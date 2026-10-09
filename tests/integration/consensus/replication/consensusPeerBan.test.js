import test from 'brittle';
import sinon from 'sinon';
import Hyperswarm from 'hyperswarm';
import createTestnet from 'hyperdht/testnet.js';
import Network from '../../../../src/core/network/Network.js';
import { createConfig, ENV } from '../../../../src/config/env.js';
import { CONNECTION_STATUS, ConsensusResultCode, CustomEventType } from '../../../../src/utils/constants.js';
import { createConsensusNetwork, waitFor } from '../helpers/consensusNetwork.js';

test('real Hyperswarm bans an impersonating indexer, disconnects it, and rejects reconnects including an admitted handshake', async t => {
    let network;
    let testnet;
    let releaseHandshake = () => {};
    const swarms = [];
    t.teardown(async () => {
        releaseHandshake();
        const results = await Promise.allSettled([
            network?.close(),
            ...swarms.map(swarm => swarm.destroy()),
        ]);
        await testnet?.destroy();
        const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
        if (failures.length) throw new AggregateError(failures, 'Hyperswarm ban test cleanup failed');
    }, { order: -2, force: true });

    const peers = await createConsensusNetwork(t, { prepareConnections: false });
    const { proposer, nodes, deferred } = peers;
    const offender = nodes[1];
    const healthy = nodes[2];
    const offenderKey = offender.wallet.publicKey.toString('hex');
    const targetKey = proposer.wallet.publicKey.toString('hex');
    // All discovery and handshakes use this local DHT, without public bootstrap nodes.
    testnet = await createTestnet(3);
    const config = createConfig(ENV.DEVELOPMENT, {
        bootstrap: proposer.config.bootstrap,
        channel: targetKey.slice(0, 32),
        dhtBootstrap: testnet.bootstrap.map(({ host, port }) => `${host}:${port}`),
        enableLogTimestamp: false,
    });
    Object.defineProperty(config, 'epochInterval', { value: 600_000 });
    network = new Network(proposer.state, proposer.store, config, proposer.wallet);
    // This scenario drives connections and proposals explicitly, with the real Network and swarm.
    sinon.stub(network.validatorObserverService, 'start').resolves();
    await network.ready();
    await network.swarm.listen();
    const manager = network.indexerConnectionManager;

    function createSwarm(node) {
        const swarm = new Hyperswarm({ bootstrap: testnet.bootstrap, keyPair: node.wallet });
        swarms.push(swarm);
        // Both offending clients can finish opening before the server's ban resets them.
        swarm.on('connection', connection => connection.on('error', () => {}));
        return swarm;
    }

    async function connectIndexer(node) {
        const swarm = createSwarm(node);
        const connected = new Promise(resolve => swarm.once('connection', connection => {
            node.store.replicate(connection);
            node.messages.prepareConnection(connection);
            resolve(connection);
        }));
        swarm.joinPeer(proposer.wallet.publicKey);
        swarm.peers.get(targetKey).reconnect(false);
        const remote = await connected;
        await waitFor('real Hyperswarm delivers the indexer connection', () =>
            [...network.swarm.connections].some(connection => connection.remotePublicKey.equals(node.wallet.publicKey))
        );
        t.is(await network.tryConnect(node.wallet.publicKey.toString('hex'), 'indexer'), CONNECTION_STATUS.CONNECTED);
        await waitFor('consensus channel opens on the remote swarm', () => remote.protocolSessions?.indexer);
        return { remote, local: manager.getConnection(node.wallet.publicKey) };
    }

    const badLink = await connectIndexer(offender);
    const goodLink = await connectIndexer(healthy);
    const proposal = await peers.createProofProposal();
    t.is((await manager.send(healthy.wallet.publicKey, proposal)).resultCode, ConsensusResultCode.OK);

    // Keep one genuinely validated/signed response pending when the ban disconnects the peer.
    const responseReady = deferred();
    const badSession = badLink.remote.protocolSessions.indexer;
    const holdResponse = sinon.stub(badSession, 'sendAndForget').callsFake(response => responseReady.resolve(response));
    t.teardown(() => holdResponse.restore());
    const pending = manager.send(offender.wallet.publicKey, proposal).catch(error => error);
    t.is((await responseReady.promise).proof_proposal_response.result, ConsensusResultCode.OK);

    const admitted = deferred();
    const resume = deferred();
    releaseHandshake = resume.resolve;
    const rejected = deferred();
    let holdNextHandshake = true;
    const firewall = network.swarm.server.firewall;
    const gate = sinon.stub(network.swarm.server, 'firewall').callsFake(async (...args) => {
        // Preserve the real firewall decision; delay only completion of one accepted handshake.
        const denied = await firewall(...args);
        if (args[0].equals(offender.wallet.publicKey)) {
            if (denied) rejected.resolve();
            else if (holdNextHandshake) {
                holdNextHandshake = false;
                admitted.resolve();
                await resume.promise;
            }
        }
        return denied;
    });
    t.teardown(() => gate.restore());

    // A second real client with the same identity starts handshaking before that identity is banned.
    const racingSwarm = createSwarm(offender);
    racingSwarm.joinPeer(proposer.wallet.publicKey);
    racingSwarm.peers.get(targetKey).reconnect(false);
    await admitted.promise;
    const peerInfo = network.swarm.peers.get(offenderKey);
    t.absent(peerInfo.banned, 'the in-flight handshake passed the real firewall before the ban');
    t.is(network.swarm.connections.size, 2, 'the held handshake has not produced a connection');

    const banned = deferred();
    proposer.state.once(CustomEventType.CONSENSUS_PEER_BAN_REQUESTED, banned.resolve);
    const oldClosed = [badLink.local, badLink.remote].map(connection =>
        new Promise(resolve => connection.once('close', resolve))
    );
    // The transport authenticates the offender, but this proposal claims the proposer's identity.
    const impersonation = badSession.send(proposal).catch(error => error);
    const ban = await banned.promise;
    t.is(ban.connection, badLink.local);
    t.is(ban.error.resultCode, ConsensusResultCode.PUBLIC_KEY_MISMATCH);
    t.ok(peerInfo.banned, 'production policy bans the actual Hyperswarm PeerInfo');
    t.is((await pending).resultCode, ConsensusResultCode.PUBLIC_KEY_MISMATCH, 'ban rejects the in-flight request');
    await Promise.all(oldClosed);
    await impersonation;
    t.ok(badLink.local.destroyed && badLink.remote.destroyed, 'both ends of the offending transport close');
    t.absent(badLink.local.protocolSessions.indexer, 'closed consensus session is removed');
    t.absent(manager.connected(offenderKey));
    t.absent(network.isConnectionPending(offenderKey));
    t.is(network.swarm.peers.get(offenderKey), peerInfo, 'the banned identity survives connection cleanup');

    for (const role of ['indexer', 'validator']) {
        t.is(await network.tryConnect(offenderKey, role), CONNECTION_STATUS.IGNORED, `${role} cannot reconnect a banned identity`);
    }
    t.is(network.pendingConnectionsCount(), 0, 'rejected reconnects create no pending attempts');

    const lateConnection = deferred();
    network.swarm.once('connection', connection => {
        lateConnection.resolve({ connection, closed: new Promise(resolve => connection.once('close', resolve)) });
    });
    const replicate = sinon.spy(proposer.store, 'replicate');
    t.teardown(() => replicate.restore());
    resume.resolve();
    const late = await lateConnection.promise;
    t.ok(late.connection.remotePublicKey.equals(offender.wallet.publicKey));
    await late.closed;
    t.ok(late.connection.destroyed, 'Network closes the real connection delivered after the ban');
    t.absent(late.connection.protocolSessions, 'late handshake cannot initialize protocol sessions');
    t.absent(replicate.called, 'late handshake cannot start replication');
    t.absent(manager.connected(offenderKey), 'late handshake cannot restore the manager entry');

    // Start a fresh handshake after the ban, and wait for an actual firewall rejection and closure.
    const accepted = sinon.spy();
    network.swarm.on('connection', accepted);
    const reconnectingSwarm = createSwarm(offender);
    reconnectingSwarm.joinPeer(proposer.wallet.publicKey);
    reconnectingSwarm.peers.get(targetKey).reconnect(false);
    const attempt = reconnectingSwarm._allConnections.get(proposer.wallet.publicKey);
    const attemptClosed = new Promise(resolve => attempt.once('close', resolve));
    await rejected.promise;
    await attemptClosed;
    t.absent(accepted.called, 'a fresh banned handshake never becomes a server connection');
    t.is(reconnectingSwarm.stats.connects.client.opened, 0, 'the reconnecting client never opens a transport');
    t.ok(network.swarm.peers.get(offenderKey).banned, 'the ban remains after both rejected handshakes');
    t.absent(manager.connected(offenderKey));
    t.is(network.pendingConnectionsCount(), 0);

    t.is(manager.getConnection(healthy.wallet.publicKey), goodLink.local, 'another indexer keeps its original connection');
    t.ok(goodLink.local.connected && goodLink.remote.connected);
    t.absent(network.swarm.peers.get(healthy.wallet.publicKey.toString('hex')).banned);
    t.is((await manager.send(healthy.wallet.publicKey, proposal)).resultCode, ConsensusResultCode.OK,
        'the healthy indexer still approves, and the banned request ID has been released');
});
