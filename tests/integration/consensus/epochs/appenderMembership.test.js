import test from 'brittle';
import b4a from 'b4a';
import { createConsensusNetwork, waitFor } from '../helpers/consensusNetwork.js';
import { assertSignedEpoch } from '../helpers/epochAssertions.js';
import { EpochAppenderSelectionErrorCode } from '../../../../src/core/consensus/epochAppenderSelection/EpochAppenderSelectionError.js';

test('epochs continue after signed indexer removals from three to two to one', async t => {
    const network = await createConsensusNetwork(t, {
        indexerCount: 3,
        timings: { epochSignatureTimeout: 10000, epochBackoffDelay: 100, indexerPendingRequestTimeout: 5000 },
    });
    for (let epoch = 1n; epoch <= 3n; epoch++) {
        if (epoch > 1n) await network.removeIndexer(network.nodes[Number(4n - epoch)]);
        const context = await network.proposer.state.getEpochAppenderSelectionContext();
        t.is(context.currentWriterKeys.length, Number(4n - epoch), 'the signed indexer membership shrinks');
        t.is(context.members.length, Number(4n - epoch), 'removed indexers are no longer voters');
        if (epoch === 3n) {
            for (const node of network.nodes.slice(1)) await network.disconnect(network.proposer, node);
        }
        const round = network.startRound();
        if (epoch === 3n) {
            await network.waitForReplication('the remaining indexer signs without any peer', async () =>
                (await network.proposer.state.getCurrentEpoch()) === epoch, [network.proposer]
            );
            for (const node of network.nodes.slice(1)) await network.reconnect(network.proposer, node);
        }
        await assertSignedEpoch(t, network, { epoch });
        await waitFor('round finishes after indexer removal', () => round.completed);
    }
});

test('appender selection reads the migrated view when the previous view blocks are unavailable', async t => {
    const network = await createConsensusNetwork(t, { indexerCount: 2 });
    const { state, store } = network.proposer;
    const previousView = store.get({ key: state.base.view.core.key });
    await previousView.ready();
    t.teardown(() => previousView.close());
    const selector = network.proposer.appenderSelector;
    const request = await selector.createRequest(await state.getEpochAppenderSelectionContext(), b4a.from('old membership'));
    await selector.waitForReplies(request);
    await network.removeIndexer(network.nodes[1]);
    t.absent(previousView.key.equals(state.base.view.core.key), 'removal migrates the application view');
    await previousView.clear(0, previousView.length);
    t.is(await state.getCurrentEpoch(), 0n, 'the current signed view remains readable');
    const context = await state.getEpochAppenderSelectionContext();
    t.is(context.members.length, 1, 'the remaining signed indexer can elect itself');
    const failure = await selector.authorizeAppend(request.requestId, {
        writerKey: state.base.local.key.toString('hex'), from: state.base.local.length,
    }).catch(error => error);
    t.is(failure?.code, EpochAppenderSelectionErrorCode.CONTEXT_CHANGED, 'the old selection cannot authorize a queued append');
    await selector.cancel(request.requestId);
    const round = network.startRound();
    await assertSignedEpoch(t, network);
    await waitFor('single-indexer round completes', () => round.completed);
});
