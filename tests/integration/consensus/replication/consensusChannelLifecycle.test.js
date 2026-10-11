import test from 'brittle';
import sinon from 'sinon';
import { WalletProvider } from 'trac-wallet';
import { $TNK } from '../../../../src/core/state/utils/balance.js';
import { createConsensusNetwork, waitFor } from '../helpers/consensusNetwork.js';
import { assertSignedEpoch } from '../helpers/epochAssertions.js';

test('closing a consensus channel preserves replication and the next round reopens it', async t => {
    const network = await createConsensusNetwork(t);
    const { proposer, nodes } = network;
    const peer = nodes[1];
    await proposer.manager.connect();
    const connection = proposer.manager.getConnection(peer.wallet.publicKey);
    const remoteConnection = network.connectionFrom(peer, proposer);
    await peer.manager.add(proposer.wallet.publicKey, remoteConnection);
    await waitFor('consensus sessions on both ends', () =>
        connection.protocolSessions?.indexer && remoteConnection.protocolSessions?.indexer
    );
    const session = connection.protocolSessions.indexer;
    const remoteSession = remoteConnection.protocolSessions.indexer;
    t.absent(session.closed, 'local consensus session is initially open');
    t.absent(remoteSession.closed, 'remote consensus session is initially open');
    const disconnects = [connection, remoteConnection].flatMap(stream => [
        sinon.spy(stream, 'end'), sinon.spy(stream, 'destroy'),
    ]);

    // Only these two stores open this core, so other indexers cannot relay its data.
    const source = proposer.store.get({ name: 'replication-with-consensus-closed', valueEncoding: 'utf-8' });
    let replica;
    try {
        await source.ready();
        replica = peer.store.get({ key: source.key, valueEncoding: 'utf-8' });
        await replica.ready();
        await source.append('before channel closure');
        t.is(await replica.get(0, { timeout: 30_000 }), 'before channel closure', 'direct replication works initially');

        proposer.manager.remove(peer.wallet.publicKey, connection);
        await waitFor('consensus session cleanup on both ends', () =>
            !connection.protocolSessions.indexer && !remoteConnection.protocolSessions.indexer
        );
        t.ok(session.closed && remoteSession.closed, 'both consensus sessions are closed');
        t.absent(proposer.manager.connected(peer.wallet.publicKey), 'local manager removes the peer');
        t.absent(peer.manager.connected(proposer.wallet.publicKey), 'remote manager removes the peer');
        t.ok(disconnects.every(spy => !spy.called), 'channel closure calls neither end nor destroy on either transport');

        await source.append('after channel closure');
        t.is(await replica.get(1, { timeout: 30_000 }), 'after channel closure', 'new data crosses the same connection with consensus closed');

        const recipient = await new WalletProvider(proposer.config).generate({ derivationPath: proposer.config.derivationPath });
        await network.appendAdmin((factory, validity) => factory.buildCompleteBalanceInitializationMessage(
            proposer.wallet.address, recipient.address, $TNK(1n), validity
        ));
        await network.waitForReplication('new ledger entry signed with consensus closed', async () => {
            const entries = await Promise.all(nodes.map(node => node.state.getSigned(recipient.address)));
            return entries.every(entry => entry && entry.equals(entries[0]));
        });
        t.ok(await peer.state.getSigned(recipient.address), 'new ledger data reaches signed state on the peer');
        t.absent(connection.protocolSessions.indexer, 'local consensus channel remains absent during replication');
        t.absent(remoteConnection.protocolSessions.indexer, 'remote consensus channel remains absent during replication');
        t.ok(connection.connected && remoteConnection.connected, 'both ends retain the original transport');

        // Quorum must include the peer whose channel was closed, not just unaffected peers.
        const otherResponses = network.deferred();
        const collectSignature = proposer.operations.collectSignature.bind(proposer.operations);
        proposer.operations.collectSignature = async (...args) => {
            const result = await collectSignature(...args);
            const key = args[0].key;
            if (!key.equals(peer.state.writingKey) && !key.equals(nodes[2].state.writingKey)) {
                await otherResponses.promise;
            }
            return result;
        };
        const round = network.startRound();
        const approvers = await assertSignedEpoch(t, network);
        await waitFor('round completion after channel reopening', () => round.completed);

        t.ok(approvers.includes(peer.wallet.address), 'the reopened channel supplies an approval stored in the signed epoch');
        t.is(proposer.manager.getConnection(peer.wallet.publicKey), connection, 'consensus reuses the original connection');
        t.ok(connection.protocolSessions.indexer && !connection.protocolSessions.indexer.closed, 'local consensus channel is open again');
        t.ok(remoteConnection.protocolSessions.indexer && !remoteConnection.protocolSessions.indexer.closed, 'remote consensus channel is open again');
        t.absent(connection.protocolSessions.indexer === session, 'local session was recreated');
        t.absent(remoteConnection.protocolSessions.indexer === remoteSession, 'remote session was recreated');
        t.ok(disconnects.every(spy => !spy.called), 'the entire scenario keeps both transports open');
    } finally {
        await replica?.close();
        await source.close();
    }
});
