import test from 'brittle';
import sinon from 'sinon';
import createTestnet from 'hyperdht/testnet.js';
import Network from '../../../../src/core/network/Network.js';
import { createConfig, ENV } from '../../../../src/config/env.js';
import { createConsensusNetwork } from '../helpers/consensusNetwork.js';
import { assertSignedEpoch } from '../helpers/epochAssertions.js';

for (const beforeMembership of [false, true]) {
    test(`three Network instances coordinate append when started ${beforeMembership ? 'before promotions' : 'after genesis'}`, async t => {
        const networks = [];
        let testnet;
        t.teardown(async () => {
            const closed = await Promise.allSettled(networks.map(network => network.close()));
            await testnet?.destroy();
            const failures = closed.filter(result => result.status === 'rejected').map(result => result.reason);
            if (failures.length) throw new AggregateError(failures, 'Network cleanup failed');
        }, { order: -2, force: true });
        testnet = await createTestnet(3);
        let appends;
        async function startNetworks({ nodes }) {
            const indexers = nodes.slice(0, 3);
            appends = indexers.map(node => sinon.spy(node.state, 'appendEpoch'));
            for (const node of indexers) {
                const config = createConfig(ENV.DEVELOPMENT, {
                    bootstrap: node.config.bootstrap,
                    channel: indexers[0].wallet.publicKey.toString('hex').slice(0, 32),
                    dhtBootstrap: testnet.bootstrap.map(({ host, port }) => `${host}:${port}`),
                    enableTxApplyLogs: false,
                    enableInteractiveMode: false,
                    enableLogTimestamp: false,
                });
                for (const [name, value] of Object.entries({
                    epochInterval: 10_000,
                    epochSignatureTimeout: 5000,
                    epochBackoffDelay: 500,
                    epochRemoteProposalTimeout: 1000,
                    indexerPendingRequestTimeout: 2000,
                })) Object.defineProperty(config, name, { value });
                const network = new Network(node.state, node.store, config, node.wallet);
                networks.push(network);
                sinon.stub(network.validatorObserverService, 'start').resolves();
                await network.ready();
                await network.swarm.listen();
            }
        }
        const peers = await createConsensusNetwork(t, {
            indexerCount: 3,
            prepareConnections: false,
            beforeMembership: beforeMembership ? startNetworks : undefined,
        });
        if (!beforeMembership) await startNetworks(peers);
        await assertSignedEpoch(t, peers);
        t.is(appends.reduce((count, append) => count + append.callCount, 0), 1,
            'one coordinated append advances the signed epoch');
        for (const network of networks) {
            const manager = network.indexerConnectionManager;
            t.is(manager.connectionCount(), 2, 'each indexer can send to both other indexers');
            for (const peer of manager.connectedPeers()) {
                const connection = manager.getConnection(peer);
                t.ok(connection.connected && network.swarm.connections.has(connection),
                    'the shared Hyperswarm transport remains open');
            }
        }
    });
}
