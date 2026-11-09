import test from 'brittle';
import createTestnet from 'hyperdht/testnet.js';
import Network from '../../src/core/network/Network.js';
import { createConfig, ENV } from '../../src/config/env.js';
import { createConsensusNetwork, waitFor } from './consensus/helpers/consensusNetwork.js';
import { applyStateMessageFactory } from '../../src/messages/state/applyStateMessageFactory.js';
import { $TNK } from '../../src/core/state/utils/balance.js';

test('validator selection follows writer promotions in a local three-indexer, one-validator network', async t => {
    const networks = [];
    let testnet;
    t.teardown(async () => {
        const results = await Promise.allSettled(networks.map(network => network.close()));
        await testnet?.destroy();
        const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
        if (failures.length) throw new AggregateError(failures, 'Peer cleanup failed');
    }, { force: true, order: -2 });
    const peers = await createConsensusNetwork(t, { indexerCount: 1, nodeCount: 4, prepareConnections: false });
    const [admin, firstIndexer, secondIndexer, validator] = peers.nodes;
    testnet = await createTestnet(3);
    const options = {
        bootstrap: admin.config.bootstrap,
        channel: admin.wallet.publicKey.toString('hex').slice(0, 32),
        dhtBootstrap: testnet.bootstrap.map(({ host, port }) => `${host}:${port}`),
        enableRoleRequester: false,
        enableInteractiveMode: false,
        enableLogTimestamp: false,
        enableTxApplyLogs: false,
        disableRateLimit: true,
        writersShortCacheTTL: 120_000,
        writersLongCacheTTL: 120_000,
    };
    for (const peer of peers.nodes) {
        const config = createConfig(ENV.DEVELOPMENT, options);
        Object.defineProperty(config, 'epochInterval', { value: 600_000 });
        peer.network = new Network(peer.state, peer.store, config, peer.wallet);
        networks.push(peer.network);
        await peer.network.ready();
        await peer.network.swarm.listen();
    }
    const indexers = [firstIndexer, secondIndexer];
    for (const peer of indexers) {
        await waitFor('writer is connected before promotion', () =>
            admin.network.validatorConnectionManager.connected(peer.wallet.publicKey));
        await peers.addIndexer(peer);
    }

    t.is((await admin.state.getIndexersEntry()).length, 3, 'three indexers including admin');
    t.is(await admin.state.getActiveWriterCount(true), 1, 'one non-admin validator');
    t.ok(await admin.state.isAdminAllowedToValidate(), 'admin can validate below ten validators');
    await waitFor('admin sees the ordinary validator', () =>
        admin.network.validatorConnectionManager.connected(validator.wallet.publicKey));
    for (const peer of indexers) {
        await waitFor('promoted indexer leaves the pool before discovery cache expires', () =>
            !admin.network.validatorConnectionManager.connected(peer.wallet.publicKey));
        t.absent(admin.network.validatorConnectionManager.connected(peer.wallet.publicKey),
            'promoted indexer is removed from the validator pool');
    }
    for (let i = 0; i < 6; i++) {
        const sender = i % 2 === 0 ? admin : validator;
        const validity = await sender.state.getIndexerSequenceState();
        const message = await applyStateMessageFactory(sender.wallet, sender.config)
            .buildPartialTransferOperationMessage(sender.wallet.address, sender.wallet.address,
                $TNK(1n), validity, 'json');
        t.ok(await sender.network.validatorMessageOrchestrator.send(message), `transfer ${i + 1} succeeds`);
        await peers.waitForReplication(`transfer ${i + 1} is signed`, async () =>
            (await Promise.all(peers.nodes.map(peer => peer.state.getSigned(message.tro.tx)))).every(Boolean));
        t.ok(await admin.state.getSigned(message.tro.tx), 'transfer is committed in signed state');
    }
});
