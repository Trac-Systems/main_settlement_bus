import test from 'brittle';
import sinon from 'sinon';
import { createConsensusNetwork, waitFor } from '../helpers/consensusNetwork.js';
import { assertSignedEpoch } from '../helpers/epochAssertions.js';

test('timed-out approvals cannot reach quorum in a later attempt over the same channels', async t => {
    const network = await createConsensusNetwork(t);
    const { proposer } = network;
    // Intercept only the two round deadlines. Noise, storage and request timers stay real.
    const config = {
        networkId: proposer.config.networkId,
        addressPrefix: proposer.config.addressPrefix,
        epochInterval: proposer.config.epochInterval,
        epochAppendTimeout: proposer.config.epochAppendTimeout,
        epochRemoteProposalTimeout: proposer.config.epochRemoteProposalTimeout,
        epochSignatureTimeout: 61_001,
        epochBackoffDelay: 61_002,
    };
    const deadlines = new Map();
    const schedule = globalThis.setTimeout;
    const timers = sinon.stub(globalThis, 'setTimeout').callsFake((callback, delay, ...args) => {
        const timer = schedule(callback, delay, ...args);
        if (delay === config.epochSignatureTimeout || delay === config.epochBackoffDelay) {
            deadlines.set(delay, () => { clearTimeout(timer); callback(...args); });
        }
        return timer;
    });
    t.teardown(() => timers.restore());
    const responses = [];
    const collect = proposer.operations.collectSignature.bind(proposer.operations);
    proposer.operations.collectSignature = async (...args) => {
        const result = await collect(...args);
        const release = network.deferred();
        responses.push({ release, collection: args[3], result });
        await release.promise;
        return result;
    };
    const build = sinon.spy(proposer.operations, 'buildSetEpochPayload');
    const append = sinon.spy(proposer.operations, 'appendSetEpoch');
    const execution = network.startRound(proposer, config);
    await waitFor('all four first-attempt responses verified', () => responses.length === 4);
    const oldCollection = responses[0].collection;
    t.ok(deadlines.has(config.epochSignatureTimeout), 'the real FSM installed its collection deadline');
    deadlines.get(config.epochSignatureTimeout)();
    await waitFor('collection timeout entering backoff', () => oldCollection.closed && deadlines.has(config.epochBackoffDelay));

    responses[0].release.resolve();
    // Let the old callback run before checking that it cannot build a payload.
    await new Promise(resolve => setImmediate(resolve));
    t.alike(oldCollection.approvals, [], 'late approval is ignored during backoff');
    t.absent(build.called);

    deadlines.get(config.epochBackoffDelay)();
    await waitFor('all four retry responses verified', () => responses.length === 8);
    const currentCollection = responses[4].collection;
    t.absent(currentCollection === oldCollection, 'retry uses a new collection');
    for (const response of responses.slice(1, 4)) response.release.resolve();
    await new Promise(resolve => setImmediate(resolve));
    t.alike(oldCollection.approvals, [], 'the old collection remains unchanged');
    t.alike(currentCollection.approvals, [], 'old callbacks cannot populate the new collection');
    t.alike(currentCollection.rejections, []);
    t.absent(currentCollection.closed);
    t.absent(build.called);
    t.absent(append.called);

    responses[4].release.resolve();
    await waitFor('one current approval consumed', () => currentCollection.approvals.length === 1);
    t.absent(append.called, 'one current approval cannot combine with an old approval to reach quorum');
    responses[5].release.resolve();
    await assertSignedEpoch(t, network);
    await waitFor('retry completes', () => execution.completed);
    t.ok(append.calledOnce, 'only the retried payload is appended');
    t.alike(build.firstCall.args[1], [responses[4].result, responses[5].result], 'payload uses only current approvals');
});
