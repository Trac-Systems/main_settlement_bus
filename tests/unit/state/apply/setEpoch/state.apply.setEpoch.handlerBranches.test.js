import { test } from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { EntryType } from '../../../../../src/utils/constants.js';
import {
    encodeApplyOperation,
    safeDecodeEpochProof
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import {
    encodeProofProposal,
    safeDecodeProofProposal
} from '../../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import {
    buildSetEpochPayload,
    decodeSetEpochPayload,
    getEpochHash,
    setupSetEpochScenario
} from './setEpochScenarioHelpers.js';
import {
    appendCapturingEpochEvents,
    appendWithEpochProofEncodingFailure,
    appendWithEpochProofHashFailure,
    applyRejectedEpoch,
    changedViewKeys,
    expectedEpochWrites,
    snapshotEpochLedger,
    snapshotView
} from './setEpochHandlerBranchTestHelpers.js';

const isBareRuntime = typeof globalThis.Bare !== 'undefined';
const nodeOnlyTest = isBareRuntime ? test.skip : test;

test('State.apply SET_EPOCH rejects malformed nested proof bytes without epoch side effects', async t => {
    const context = await setupSetEpochScenario(t);
    const payload = await buildSetEpochPayload(context, { approverNodes: [] });
    const operation = decodeSetEpochPayload(payload);
    operation.seo.pd = b4a.from([0xff]);

    await applyRejectedEpoch(
        t,
        context,
        encodeApplyOperation(operation),
        'schema-invalid proof data'
    );
});

test('State.apply SET_EPOCH rejects a mismatched VDF-parameters hash without epoch side effects', async t => {
    const context = await setupSetEpochScenario(t);
    const payload = await buildSetEpochPayload(context, { approverNodes: [] });
    const operation = decodeSetEpochPayload(payload);
    const proofProposal = safeDecodeProofProposal(operation.seo.pd);
    t.ok(proofProposal, 'proof proposal decodes before mutation');

    proofProposal.vdf_parameters_hash = b4a.alloc(32, 0xee);
    operation.seo.pd = encodeProofProposal(proofProposal);
    await applyRejectedEpoch(
        t,
        context,
        encodeApplyOperation(operation),
        'mismatched VDF-parameters hash'
    );
});

test('State.apply SET_EPOCH rejects a proposer that is not a registered indexer', async t => {
    const context = await setupSetEpochScenario(t);
    const previousEpochHash = await getEpochHash(context.adminBootstrap.base, 0n);
    const payload = await buildSetEpochPayload(context, {
        proposerNode: context.peers[1],
        approverNodes: [],
        previousEpochHash
    });

    await applyRejectedEpoch(t, context, payload, 'unregistered proposer');
});

test('State.apply SET_EPOCH rejects a cryptographically invalid VDF without epoch side effects', async t => {
    const context = await setupSetEpochScenario(t);
    const payload = await buildSetEpochPayload(context, {
        approverNodes: [],
        challengeOverride: b4a.alloc(32, 0xff)
    });

    await applyRejectedEpoch(t, context, payload, 'invalid VDF proof');
});

test('State.apply SET_EPOCH success changes exactly the pointer, forward hash, and reverse proof record', async t => {
    const context = await setupSetEpochScenario(t);
    const base = context.adminBootstrap.base;
    const payload = await buildSetEpochPayload(context, { approverNodes: [] });
    const expected = await expectedEpochWrites(payload);
    const before = await snapshotView(base);

    const events = await appendCapturingEpochEvents(context, payload);
    const after = await snapshotView(base);

    t.alike(
        changedViewKeys(before, after),
        [EntryType.EPOCH_CURRENT, expected.forwardKey, expected.reverseKey].sort(),
        'SET_EPOCH changes exactly its three ledger keys'
    );

    const currentEpochEntry = await base.view.get(EntryType.EPOCH_CURRENT);
    const forwardEntry = await base.view.get(expected.forwardKey);
    const reverseEntry = await base.view.get(expected.reverseKey);
    t.ok(b4a.equals(currentEpochEntry?.value, expected.currentEpoch), 'current epoch stores canonical uint64 bytes');
    t.ok(b4a.equals(forwardEntry?.value, expected.proofHash), 'forward record stores the epoch proof hash');
    t.ok(b4a.equals(reverseEntry?.value, expected.encodedProof), 'reverse record stores the exact submitted proof and approvals');
    t.ok(b4a.equals(await tracCryptoApi.hash.blake3Safe(reverseEntry.value), forwardEntry.value), 'forward and reverse records are cryptographically linked');

    const decodedStoredProof = safeDecodeEpochProof(reverseEntry.value);
    const submittedOperation = decodeSetEpochPayload(payload);
    t.ok(decodedStoredProof, 'stored epoch proof decodes');
    t.ok(b4a.equals(decodedStoredProof.pd, submittedOperation.seo.pd), 'stored proof data is byte-exact');
    t.alike(decodedStoredProof.app, submittedOperation.seo.app, 'stored approvals are byte-exact and keep their order');
    t.is(events.length, 1, 'success emits EPOCH_CREATED once');
});

nodeOnlyTest('State.apply SET_EPOCH encoding failure leaves all epoch records atomic and emits no event', async t => {
    const context = await setupSetEpochScenario(t);
    const payload = await buildSetEpochPayload(context, { approverNodes: [] });
    const before = await snapshotEpochLedger(context.adminBootstrap.base);
    const { events, injected } = await appendWithEpochProofEncodingFailure(context, payload);
    const after = await snapshotEpochLedger(context.adminBootstrap.base);

    t.ok(injected, 'final epoch-proof encoding failure was injected');
    t.alike(after, before, 'encoding failure leaves pointer and forward/reverse records unchanged');
    t.is(events.length, 0, 'encoding failure does not emit EPOCH_CREATED');
});

nodeOnlyTest('State.apply SET_EPOCH final hash failure leaves all epoch records atomic and emits no event', async t => {
    const context = await setupSetEpochScenario(t);
    const payload = await buildSetEpochPayload(context, { approverNodes: [] });
    const before = await snapshotEpochLedger(context.adminBootstrap.base);
    const { events, injected } = await appendWithEpochProofHashFailure(context, payload);
    const after = await snapshotEpochLedger(context.adminBootstrap.base);

    t.ok(injected, 'final epoch-proof hash failure was injected');
    t.alike(after, before, 'hash failure leaves pointer and forward/reverse records unchanged');
    t.is(events.length, 0, 'hash failure does not emit EPOCH_CREATED');
});
