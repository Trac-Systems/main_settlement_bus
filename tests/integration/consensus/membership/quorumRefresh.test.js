import test from 'brittle';
import sinon from 'sinon';
import { decodeEpochProofV1, safeDecodeApplyOperation } from '../../../../src/codecs/apply/applyOperationCodec.js';
import { createConsensusNetwork, waitFor } from '../helpers/consensusNetwork.js';
import { assertSignedEpoch } from '../helpers/epochAssertions.js';

test('consensus refreshes quorum when membership grows from two to five before append', async t => {
    const network = await createConsensusNetwork(t, { indexerCount: 2 });
    const { proposer, nodes, deferred } = network;
    const operations = proposer.operations;
    const firstPayloadReady = deferred();
    const resumePayload = deferred();
    const responses = [];
    const append = sinon.spy(operations, 'appendSetEpoch');
    const approvers = sinon.spy(operations, 'approvers');
    const calculateVDF = sinon.spy(operations, 'calculateVDF');
    const buildPayload = operations.buildSetEpochPayload.bind(operations);
    const collectSignature = operations.collectSignature.bind(operations);
    let firstPayload;

    const build = sinon.stub(operations, 'buildSetEpochPayload').callsFake(async (...args) => {
        const payload = await buildPayload(...args);
        if (!firstPayload) {
            firstPayload = payload;
            firstPayloadReady.resolve();
            await resumePayload.promise;
        }
        return payload;
    });
    // Signatures travel through real Protomux channels and validators before being held.
    operations.collectSignature = async (...args) => {
        const result = await collectSignature(...args);
        const release = deferred();
        responses.push({ release, collection: args[3] });
        await release.promise;
        return result;
    };

    const round = network.startRound();
    await firstPayloadReady.promise;
    const firstProof = decodeEpochProofV1(safeDecodeApplyOperation(firstPayload).seo.data);
    t.is(firstProof.app.length, 0, 'the original two-indexer payload needs no external approval');
    for (const node of nodes.slice(2)) await network.addIndexer(node);
    resumePayload.resolve();

    await waitFor('four verified responses from the new membership', () => {
        if (append.called) throw new Error('A payload was appended before collecting the new quorum');
        return responses.length === 4;
    });
    t.alike(approvers.args.map(([indexers]) => indexers.length), [2, 5], 'the same round takes a fresh membership snapshot');
    t.is(append.callCount, 0, 'the stale payload was never appended');

    const collection = responses[0].collection;
    responses[0].release.resolve();
    await waitFor('first approval consumed by the round', () => collection.approvals.length === 1);
    t.is(collection.closed, false, 'one external approval leaves the collection open');
    t.is(build.callCount, 1, 'no new payload is built before reaching the new quorum');
    t.is(append.callCount, 0, 'one external approval cannot trigger append');

    responses[1].release.resolve();
    await assertSignedEpoch(t, network);
    await waitFor('round completion after membership growth', () => round.completed);

    t.is(append.callCount, 1, 'only the payload meeting the new quorum is appended');
    const appendedProof = decodeEpochProofV1(safeDecodeApplyOperation(append.firstCall.args[0]).seo.data);
    t.is(appendedProof.app.length, 2, 'the appended payload already satisfies the new quorum');
    t.is(build.callCount, 2, 'the old payload is rebuilt with new approvals');
    t.is(calculateVDF.callCount, 1, 'membership refresh reuses the existing VDF proof');
});
