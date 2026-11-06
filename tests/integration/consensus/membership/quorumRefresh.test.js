import test from 'brittle';
import sinon from 'sinon';
import { decodeEpochProofV1, safeDecodeApplyOperation } from '../../../../src/codecs/apply/applyOperationCodec.js';
import V1EpochProofProposalRequest from '../../../../src/core/network/protocols/consensus/v1/validators/V1EpochProofProposalRequest.js';
import { sleep } from '../../../../src/utils/helpers.js';
import { createConsensusNetwork, waitFor } from '../helpers/consensusNetwork.js';
import { assertSignedEpoch } from '../helpers/epochAssertions.js';

test('consensus refreshes quorum when membership grows from two to five before append', async t => {
    const network = await createConsensusNetwork(t, {
        indexerCount: 2,
        // Allow real proof verification to finish on a busy runner. Gates control approval delivery.
        timings: { epochSignatureTimeout: 10_000, epochBackoffDelay: 100, indexerPendingRequestTimeout: 5_000 },
    });
    const { proposer, nodes, deferred } = network;
    const operations = proposer.operations;
    const firstPayloadReady = deferred();
    const resumePayload = deferred();
    const resumeProofValidation = deferred();
    const responses = [];
    const approvalFailures = [];
    const append = sinon.spy(operations, 'appendSetEpoch');
    const approvers = sinon.spy(operations, 'getProofApprovers');
    const calculateVDF = sinon.spy(operations, 'calculateVDF');
    const buildPayload = operations.buildSetEpochPayload.bind(operations);
    const requestProofApproval = operations.requestProofApproval.bind(operations);
    let firstPayload;
    let holdResponses = true;
    let verifiedProposalCount = 0;

    const validateProofProposal = V1EpochProofProposalRequest.prototype.validate;
    const delayedProofValidation = sinon.stub(V1EpochProofProposalRequest.prototype, 'validate').callsFake(async function (proposal, connection) {
        const result = await validateProofProposal.call(this, proposal, connection);
        verifiedProposalCount++;
        await resumeProofValidation.promise;
        return result;
    });
    t.teardown(() => delayedProofValidation.restore());

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
    operations.requestProofApproval = async (...args) => {
        let result;
        try {
            result = await requestProofApproval(...args);
        } catch (error) {
            approvalFailures.push(error);
            throw error;
        }
        if (!holdResponses) return result;
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

    await waitFor('four peers to verify the proposal', () => {
        if (approvalFailures.length) {
            throw new AggregateError(approvalFailures, 'Proof approval failed before all peers verified the proposal');
        }
        return verifiedProposalCount === 4;
    });
    // Keep valid responses pending beyond the old one second RPC timeout.
    await sleep(1100);
    resumeProofValidation.resolve();

    await waitFor('four verified responses from the new membership', () => {
        if (approvalFailures.length) {
            throw new AggregateError(approvalFailures, 'Proof approval failed after membership growth');
        }
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
    await waitFor('payload rebuilt with the new quorum', () => build.callCount === 2);
    t.is(build.callCount, 2, 'the old payload is rebuilt with new approvals');
    // A withdrawn election can retain remote votes until their deadline. Let later
    // attempts collect fresh approvals while the real selector waits for that expiry.
    holdResponses = false;
    for (const response of responses) response.release.resolve();
    await assertSignedEpoch(t, network);
    await waitFor('round completion after membership growth', () => round.completed);

    t.is(append.callCount, 1, 'only the payload meeting the new quorum is appended');
    const appendedProof = decodeEpochProofV1(safeDecodeApplyOperation(append.firstCall.args[0]).seo.data);
    t.is(appendedProof.app.length, 2, 'the appended payload already satisfies the new quorum');
    t.is(calculateVDF.callCount, 1, 'membership refresh reuses the existing VDF proof');
});
