import { test } from 'brittle';
import b4a from 'b4a';
import {
    appendAndUpdate,
    buildSetEpochPayload,
    decodeSetEpochPayload,
    getCurrentEpoch,
    getEpochHash,
    setupSetEpochScenario
} from './setEpochScenarioHelpers.js';
import { EntryType, CustomEventType } from '../../../../../src/utils/constants.js';
import {
    encodeApplyOperation,
    safeDecodeEpochProof
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import { addressToBuffer } from '../../../../../src/core/state/utils/address.js';
import { config } from '../../../../helpers/config.js';

test('State.apply SET_EPOCH: proposer alone satisfies quorum when it is the sole indexer, and commits the epoch', async t => {
    const context = await setupSetEpochScenario(t);
    const adminNode = context.adminBootstrap;

    let epochCreatedEmitted = false;
    adminNode.state.once(CustomEventType.EPOCH_CREATED, () => { epochCreatedEmitted = true; });

    const payload = await buildSetEpochPayload(context, { epoch: 1n, approverNodes: [] });
    await appendAndUpdate(adminNode.base, payload);

    t.ok(epochCreatedEmitted, 'EPOCH_CREATED was emitted');
    t.is(await getCurrentEpoch(adminNode.base), 1n, 'current epoch advanced to 1');

    const epochHash = await getEpochHash(adminNode.base, 1n);
    t.ok(epochHash, 'epoch 1 hash is stored');

    const storedProof = await adminNode.base.view.get(EntryType.EPOCH_HASH + epochHash.toString('hex'));
    t.ok(storedProof, 'epoch proof is stored under its hash');

    const decodedStoredProof = safeDecodeEpochProof(storedProof.value);
    const decodedPayload = decodeSetEpochPayload(payload);
    t.ok(decodedStoredProof, 'stored epoch proof decodes');
    t.ok(b4a.equals(decodedStoredProof.pd, decodedPayload.seo.pd), 'stored proof data matches the submitted proposal');
    t.is(decodedStoredProof.app.length, decodedPayload.seo.app.length, 'stored approvals count matches the submitted proposal');
});

test('State.apply SET_EPOCH: rejects a previous_epoch_record_hash mismatch', async t => {
    const context = await setupSetEpochScenario(t);
    const adminNode = context.adminBootstrap;

    const payload = await buildSetEpochPayload(context, {
        epoch: 1n,
        approverNodes: [],
        previousEpochHash: b4a.alloc(32, 0xff)
    });
    await appendAndUpdate(adminNode.base, payload);

    t.is(await getCurrentEpoch(adminNode.base), 0n, 'current epoch remains unchanged on hash mismatch');
});

test('State.apply SET_EPOCH: rejects a tampered proposer signature', async t => {
    const context = await setupSetEpochScenario(t);
    const adminNode = context.adminBootstrap;

    const payload = await buildSetEpochPayload(context, {
        epoch: 1n,
        approverNodes: [],
        proposalSignatureOverride: b4a.alloc(64, 0x11)
    });
    await appendAndUpdate(adminNode.base, payload);

    t.is(await getCurrentEpoch(adminNode.base), 0n, 'current epoch remains unchanged with an invalid signature');
});

test('State.apply SET_EPOCH: rejects an operation address that is not the proposer', async t => {
    const context = await setupSetEpochScenario(t);
    const adminNode = context.adminBootstrap;

    const payload = await buildSetEpochPayload(context, { epoch: 1n, approverNodes: [] });
    const operation = decodeSetEpochPayload(payload);
    operation.address = addressToBuffer(context.peers[1].wallet.address, config.addressPrefix);

    await appendAndUpdate(adminNode.base, encodeApplyOperation(operation));

    t.is(await getCurrentEpoch(adminNode.base), 0n, 'current epoch remains unchanged when the operation address is not the proposer');
});

test('State.apply SET_EPOCH: ignores a stale epoch proposal without disturbing the committed epoch', async t => {
    const context = await setupSetEpochScenario(t);
    const adminNode = context.adminBootstrap;

    const firstPayload = await buildSetEpochPayload(context, { epoch: 1n, approverNodes: [] });
    await appendAndUpdate(adminNode.base, firstPayload);
    t.is(await getCurrentEpoch(adminNode.base), 1n, 'epoch 1 committed');

    const stalePayload = await buildSetEpochPayload(context, {
        epoch: 1n,
        approverNodes: [],
        previousEpochHash: await getEpochHash(adminNode.base, 0n)
    });
    await appendAndUpdate(adminNode.base, stalePayload);

    t.is(await getCurrentEpoch(adminNode.base), 1n, 'stale re-proposal for epoch 1 is ignored, epoch stays at 1');
});

test('State.apply SET_EPOCH: rejects a proposal that skips ahead of the next expected epoch', async t => {
    const context = await setupSetEpochScenario(t);
    const adminNode = context.adminBootstrap;
    const genesisHash = await getEpochHash(adminNode.base, 0n);

    const payload = await buildSetEpochPayload(context, {
        epoch: 2n,
        approverNodes: [],
        previousEpochHash: genesisHash
    });
    await appendAndUpdate(adminNode.base, payload);

    t.is(await getCurrentEpoch(adminNode.base), 0n, 'current epoch remains unchanged when the proposal skips ahead');
});
