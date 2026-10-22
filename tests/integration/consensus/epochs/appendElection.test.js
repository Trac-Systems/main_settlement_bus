import test from 'brittle';
import sinon from 'sinon';
import { createConsensusNetwork, waitFor } from '../helpers/consensusNetwork.js';
import { assertSignedEpoch } from '../helpers/epochAssertions.js';

test('two of three indexers keep committing epochs while the third is offline and then reconnects', async t => {
    const network = await createConsensusNetwork(t, {
        indexerCount: 3,
        timings: { epochSignatureTimeout: 10_000, epochBackoffDelay: 100, indexerPendingRequestTimeout: 5_000 },
    });
    const offline = network.nodes[2];
    const online = network.nodes.filter(node => node !== offline);
    for (const node of online) await network.disconnect(offline, node);
    const writes = sinon.spy(network.proposer.state, 'appendEpoch');
    for (let epoch = 1n; epoch <= 3n; epoch++) {
        const round = network.startRound();
        await network.waitForReplication(`epoch ${epoch} signed without the offline indexer`, async () =>
            (await Promise.all(online.map(node => node.state.getCurrentEpoch()))).every(current => current === epoch), online
        );
        await waitFor('quorum round completion', () => round.completed);
        t.is(await offline.state.getCurrentEpoch(), 0n, 'the offline node did not participate');
    }
    t.is(writes.callCount, 3, 'one append per epoch, without waiting for every indexer');
    for (const node of online) await network.reconnect(offline, node);
    await assertSignedEpoch(t, network, { epoch: 3n });
});

test('a disconnected elected appender is replaced and its late write cannot replace the committed epoch', async t => {
    const network = await createConsensusNetwork(t, {
        indexerCount: 3,
        timings: {
            epochSignatureTimeout: 10_000, epochBackoffDelay: 100,
            indexerPendingRequestTimeout: 5_000, epochRemoteProposalTimeout: 100,
        },
    });
    const first = network.proposer;
    const online = network.nodes.filter(node => node !== first);
    const contenders = network.nodes.slice(0, 3);
    await Promise.all(contenders.slice(1).map(node => network.openOperations(node)));
    let appendEntered = false;
    const gate = network.deferred();
    let appendFinished = false;
    const original = first.state.appendEpoch.bind(first.state);
    first.state.appendEpoch = async (payload, before) => {
        const result = await original(payload, async location => {
            await before(location);
            appendEntered = true;
            await gate.promise;
        });
        appendFinished = true;
        return result;
    };
    const writes = contenders.map(node => sinon.spy(node.state, 'appendEpoch'));
    const oldRound = network.startRound(first);
    await waitFor('the first appender to reach the authorized append', () => appendEntered);
    for (const node of online) await network.disconnect(first, node);
    await oldRound.round.cancel();
    const successors = contenders.slice(1).map(node => network.startRound(node));
    await network.waitForReplication('successor commits without the old appender', async () =>
        (await Promise.all(online.map(node => node.state.getCurrentEpoch()))).every(epoch => epoch === 1n), online
    );
    await waitFor('successor rounds finish', () => successors.every(round => round.completed));
    t.is(writes[1].callCount + writes[2].callCount, 1, 'the remaining majority elects one successor');
    const committed = await contenders[1].state.getEpoch(1n);

    for (const node of online) await network.reconnect(first, node);
    await waitFor('returning appender observes the new signed epoch', async () => (await first.state.getCurrentEpoch()) === 1n);
    gate.resolve();
    await waitFor('the returning appender to finish its late append', () => appendFinished);
    await assertSignedEpoch(t, network);
    t.alike(await first.state.getEpoch(1n), committed, 'the previously authorized late append cannot replace the epoch');
    t.is(writes.reduce((sum, spy) => sum + spy.callCount, 0), 2, 'only the old in-flight append and its replacement were submitted');
});

test('two-member fallback submits locally after silence and finalizes when Autobase regains its quorum', async t => {
    const network = await createConsensusNetwork(t, {
        indexerCount: 2,
        timings: { epochSignatureTimeout: 10_000, epochBackoffDelay: 100, indexerPendingRequestTimeout: 5_000 },
    });
    const offline = network.nodes[1];
    const online = network.nodes.filter(node => node !== offline);
    for (const node of online) await network.disconnect(offline, node);
    let submitted = false;
    const original = network.proposer.state.appendEpoch.bind(network.proposer.state);
    network.proposer.state.appendEpoch = async (...args) => {
        const result = await original(...args);
        submitted = true;
        return result;
    };
    const round = network.startRound();
    await waitFor('solo local append after the unanswered election', () => submitted);
    t.is(network.proposer.appenderSelector.activeReservation.solo, true);
    t.is(await network.proposer.state.getCurrentEpoch(), 0n, 'the election fallback does not bypass Autobase signed finality');
    for (const node of online) await network.reconnect(offline, node);
    await assertSignedEpoch(t, network);
    await waitFor('fallback round finishes after signed replication', () => round.completed);
});

