// Internal worker for compare-memory.py. Stdout carries JSON replies, stderr carries MSB logs.
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { randomBytes, randomInt } from 'node:crypto';

const [role, root, store, cyclesText, upstream] = process.argv.slice(2);
const cycles = Number(cyclesText);
const local = createRequire(path.join(root, 'package.json'));
const load = file => import(pathToFileURL(path.join(root, file)));
const reply = value => process.stdout.write(JSON.stringify(value) + '\n');
console.log = console.info = console.debug = console.error;

const host = '127.0.0.1';
const info = upstream ? JSON.parse(upstream) : {};
async function freePort() {
    const socket = dgram.createSocket('udp4');
    await new Promise((resolve, reject) => {
        socket.once('error', reject);
        socket.bind(0, host, resolve);
    });
    const { port } = socket.address();
    await new Promise(resolve => socket.close(resolve));
    return port;
}
const commands = createInterface({ input: process.stdin });
let relay, msb;
let totalCycles = 0;
async function waitFor(check, description) {
    const until = Date.now() + 90_000;
    while (!(await check())) {
        if (Date.now() > until) throw new Error('Timed out waiting for ' + description);
        await sleep(100);
    }
}

async function startLocalPeer() {
    const DHT = local('hyperdht');
    const port = info.port ?? await freePort();
    const localNetwork = { host, nodes: [], bootstrap: [host + ':' + port] };
    // Hyperswarm constructs its own HyperDHT. Apply the loopback settings before importing MSB.
    local.cache[local.resolve('hyperdht')].exports = class extends DHT {
        constructor(options) {
            super({ ...options, ...localNetwork, port: randomInt(49152, 65536), ephemeral: true });
        }
    };
    const { setupMsbAdmin, setupMsbWriter, setupMsbPeer } = await load('tests/helpers/setupApplyTests.js');
    const { testKeyPair1, testKeyPair2 } = await load('tests/fixtures/apply.fixtures.js');
    const options = {
        channel: info.channel ?? randomBytes(16).toString('hex'),
        dhtBootstrap: localNetwork.bootstrap,
        enableRoleRequester: false, enableInteractiveMode: false, enableWallet: true,
        enableTxApplyLogs: false, validatorHealthCheckInterval: 300_000,
    };
    if (role === 'admin') {
        relay = DHT.bootstrapper(port, host, { ...localNetwork, bootstrap: [] });
        await relay.fullyBootstrapped();
        const peer = await setupMsbAdmin(testKeyPair1, store, options);
        msb = peer.msb;
        const writer = await setupMsbWriter(peer, 'writer', testKeyPair2, store, peer.options);
        assert(writer.msb.state.isWritable());
        await writer.msb.close();
        reply({ port, channel: options.channel, bootstrap: peer.options.bootstrap, key: peer.wallet.publicKey.toString('hex') });
    } else if (role === 'writer') {
        const peer = await setupMsbPeer('writer', testKeyPair2, store, {
            ...options, bootstrap: info.bootstrap, enableValidatorObserver: cycles === 0,
        });
        msb = peer.msb;
        const network = msb.network;
        network.swarm.joinPeer(Buffer.from(info.key, 'hex'));
        await waitFor(async () => {
            const entry = await peer.msb.state.getNodeEntry(peer.wallet.address);
            return entry?.isWriter && !entry.isIndexer && peer.msb.state.isWritable()
                && [...network.swarm.connections].some(c => c.protocolSession && c.remotePublicKey.toString('hex') === info.key);
        }, 'writer role and replication transport');
        if (cycles) {
            const conn = [...network.swarm.connections].find(c => c.remotePublicKey.toString('hex') === info.key);
            await conn.protocolSession.probe();
        } else {
            await waitFor(() => network.validatorConnectionManager.getConnection(info.key)?.protocolSession?.isHealthCheckSupported(), 'validator observer');
        }
    } else {
        throw new Error('Unknown local worker role: ' + role);
    }
}

try {
    if (role === 'mainnet') {
        assert.equal(cycles, 0, 'Synthetic cycles require a local test network');
        const { createConfig, ENV } = await load('src/config/env.js');
        const { MainSettlementBus } = await load('src/index.js');
        msb = new MainSettlementBus(createConfig(ENV.MAINNET, {
            storesDirectory: store, enableWallet: false, enableInteractiveMode: false, enableRoleRequester: false,
        }));
        await msb.ready();
    } else {
        await startLocalPeer();
    }
    if (role !== 'admin') {
        reply({ pid: process.pid, publicKey: Buffer.from(msb.network.swarm.keyPair.publicKey).toString('hex') });
    }

    for await (const line of commands) {
        if (line === 'stop') break;
        if (role === 'admin') throw new Error('Unexpected admin command');
        const network = msb.network;
        if (role === 'writer' && line === 'sample' && cycles) {
            for (let i = 0; i < cycles; i++) {
                await network.tryConnect(info.key, 'validator');
                assert(network.validatorConnectionManager.exists(info.key) && network.disconnectValidatorPeer(info.key));
                totalCycles++;
                if (i % 100 === 99) await new Promise(resolve => setImmediate(resolve));
            }
        }
        const connections = [...network.swarm.connections];
        const count = event => connections.reduce((n, conn) => n + conn.listenerCount(event), 0);
        const { rss, heapUsed, heapTotal, external, arrayBuffers } = process.memoryUsage();
        reply({
            timestamp: new Date().toISOString(), pid: process.pid, rss, heapUsed, heapTotal, external, arrayBuffers,
            peers: connections.length, validators: network.validatorConnectionManager.connectionCount(),
            closeListeners: count('close'), maxClosePerPeer: Math.max(0, ...connections.map(c => c.listenerCount('close'))),
            errorListeners: count('error'), signedLength: msb.state.getSignedLength(), cycles: totalCycles,
        });
    }
} finally {
    commands.close();
    await msb?.close();
    await relay?.destroy();
}
