import { test } from 'brittle';
import b4a from 'b4a';
import {
    buildSetEpochPayload,
    decodeSetEpochPayload,
    getCurrentEpoch,
    getEpochHash,
    setupSetEpochScenario
} from './setEpochScenarioHelpers.js';
import {
    applySetEpochWithIndexers,
    assertEpochUnchangedAfterRejectedApprovals,
    createApprovalActors,
    duplicateFirstApproval,
    tamperApprovalSignature
} from './setEpochApprovalsScenarioHelpers.js';
import {
    safeDecodeEpochProofV1,
    safeEncodeEpochProofV1
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import { safeDecodeProofProposal } from '../../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import { EntryType } from '../../../../../src/utils/constants.js';

test('State.apply SET_EPOCH approvals: accepts exact quorum from five indexers', async t => {
    const context = await setupSetEpochScenario(t);
    const indexers = await createApprovalActors(context, 5);
    const payload = await buildSetEpochPayload(context, {
        approverNodes: [indexers[1], indexers[2]]
    });

    await applySetEpochWithIndexers(context, payload, indexers);

    t.is(await getCurrentEpoch(context.adminBootstrap.base), 1n, 'three signers satisfy the five-indexer quorum');
    const epochHash = await getEpochHash(context.adminBootstrap.base, 1n);
    t.ok(epochHash, 'exact-quorum approvals commit the epoch hash');
    const stored = await context.adminBootstrap.base.view.get(
        EntryType.EPOCH_HASH + epochHash.toString('hex')
    );
    const proof = safeDecodeEpochProofV1(stored?.value);
    t.ok(proof, 'exact-quorum approvals store a decodable epoch proof');
    t.is(proof?.app.length, 2, 'stored proof contains exactly the two required external approvals');
    const proofProposal = safeDecodeProofProposal(proof?.pd);
    t.ok(proofProposal?.proof.length > 0, 'the accepted approvals are bound to the stored VDF proof');
});

test('State.apply SET_EPOCH approvals: rejects insufficient approvals from three indexers', async t => {
    const context = await setupSetEpochScenario(t);
    const indexers = await createApprovalActors(context, 3);
    const payload = await buildSetEpochPayload(context, { approverNodes: [] });

    await applySetEpochWithIndexers(context, payload, indexers);

    await assertEpochUnchangedAfterRejectedApprovals(t, context.adminBootstrap.base, payload, 'insufficient approvals');
});

test('State.apply SET_EPOCH approvals: rejects an invalid proposer signature', async t => {
    const context = await setupSetEpochScenario(t);
    const indexers = await createApprovalActors(context, 3);
    const payload = await buildSetEpochPayload(context, {
        approverNodes: [indexers[1]],
        proposalSignatureOverride: b4a.alloc(64, 0x11)
    });

    await applySetEpochWithIndexers(context, payload, indexers);

    await assertEpochUnchangedAfterRejectedApprovals(t, context.adminBootstrap.base, payload, 'bad proposer signature');
});

test('State.apply SET_EPOCH approvals: accepts excess valid approvals and stores their received order unchanged', async t => {
    const context = await setupSetEpochScenario(t);
    const indexers = await createApprovalActors(context, 5);
    const receivedOrder = [indexers[4], indexers[2], indexers[3], indexers[1]];
    const payload = await buildSetEpochPayload(context, { approverNodes: receivedOrder });
    const submittedOperation = decodeSetEpochPayload(payload);
    const submittedProof = safeEncodeEpochProofV1({
        pd: submittedOperation.seo.pd,
        app: submittedOperation.seo.app
    });

    await applySetEpochWithIndexers(context, payload, indexers);

    const epochHash = await getEpochHash(context.adminBootstrap.base, 1n);
    t.ok(epochHash, 'excess approvals commit the epoch');
    const stored = await context.adminBootstrap.base.view.get(
        EntryType.EPOCH_HASH + epochHash.toString('hex')
    );
    t.ok(stored, 'epoch proof with excess approvals is stored');
    t.ok(
        b4a.equals(stored.value, submittedProof),
        'stored epoch proof is byte-for-byte identical to the received proposal and approval order'
    );

    const decodedStoredProof = safeDecodeEpochProofV1(stored.value);
    t.is(decodedStoredProof?.app.length, receivedOrder.length, 'all excess approvals are retained');
    for (const [index, submittedApproval] of submittedOperation.seo.app.entries()) {
        t.ok(
            b4a.equals(decodedStoredProof.app[index], submittedApproval),
            `approval ${index} remains in its received position`
        );
    }
});

test('State.apply SET_EPOCH approvals: rejects proposer self-approval', async t => {
    const context = await setupSetEpochScenario(t);
    const indexers = await createApprovalActors(context, 3);
    const payload = await buildSetEpochPayload(context, {
        approverNodes: [indexers[0]]
    });

    await applySetEpochWithIndexers(context, payload, indexers);

    await assertEpochUnchangedAfterRejectedApprovals(t, context.adminBootstrap.base, payload, 'self-approval');
});

test('State.apply SET_EPOCH approvals: rejects a non-member approval', async t => {
    const context = await setupSetEpochScenario(t);
    const actors = await createApprovalActors(context, 4);
    const indexers = actors.slice(0, 3);
    const payload = await buildSetEpochPayload(context, {
        approverNodes: [actors[3]]
    });

    await applySetEpochWithIndexers(context, payload, indexers);

    await assertEpochUnchangedAfterRejectedApprovals(t, context.adminBootstrap.base, payload, 'non-member approval');
});

test('State.apply SET_EPOCH approvals: rejects a duplicate approver', async t => {
    const context = await setupSetEpochScenario(t);
    const indexers = await createApprovalActors(context, 4);
    const validPayload = await buildSetEpochPayload(context, {
        approverNodes: [indexers[1]]
    });
    const duplicatePayload = duplicateFirstApproval(validPayload);

    await applySetEpochWithIndexers(context, duplicatePayload, indexers);

    await assertEpochUnchangedAfterRejectedApprovals(t, context.adminBootstrap.base, duplicatePayload, 'duplicate approver');
});

test('State.apply SET_EPOCH approvals: rejects a bad approval signature', async t => {
    const context = await setupSetEpochScenario(t);
    const indexers = await createApprovalActors(context, 3);
    const validPayload = await buildSetEpochPayload(context, {
        approverNodes: [indexers[1]]
    });
    const invalidPayload = tamperApprovalSignature(validPayload);

    await applySetEpochWithIndexers(context, invalidPayload, indexers);

    await assertEpochUnchangedAfterRejectedApprovals(t, context.adminBootstrap.base, invalidPayload, 'bad approval signature');
});

test('State.apply SET_EPOCH approvals: rejects one invalid approval even when the remaining signers meet quorum', async t => {
    const context = await setupSetEpochScenario(t);
    const indexers = await createApprovalActors(context, 5);
    const validPayload = await buildSetEpochPayload(context, {
        approverNodes: [indexers[1], indexers[2], indexers[3]]
    });
    const invalidPayload = tamperApprovalSignature(validPayload, 2);

    await applySetEpochWithIndexers(context, invalidPayload, indexers);

    await assertEpochUnchangedAfterRejectedApprovals(t, context.adminBootstrap.base, invalidPayload, 'one invalid approval after exact quorum');
});

test('State.apply SET_EPOCH approvals: two-indexer policy accepts the proposer without external approvals', async t => {
    const context = await setupSetEpochScenario(t);
    const indexers = await createApprovalActors(context, 2);
    const payload = await buildSetEpochPayload(context, { approverNodes: [] });

    await applySetEpochWithIndexers(context, payload, indexers);

    t.is(
        await getCurrentEpoch(context.adminBootstrap.base),
        1n,
        'the configured two-indexer quorum threshold is one signer'
    );
});
