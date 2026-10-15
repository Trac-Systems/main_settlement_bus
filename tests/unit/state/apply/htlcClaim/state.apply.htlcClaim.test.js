import test from 'brittle';
import b4a from 'b4a';

import {applyStateMessageFactory} from '../../../../../src/messages/state/applyStateMessageFactory.js';
import {
    safeDecodeApplyOperation,
    safeEncodeApplyOperation,
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import * as escrowEntryUtils from '../../../../../src/core/state/utils/escrowEntry.js';
import {toBalance} from '../../../../../src/core/state/utils/balance.js';
import {BALANCE_BYTE_LENGTH, EntryType} from '../../../../../src/utils/constants.js';
import {uint64ToBuffer} from '../../../../../src/utils/buffer.js';
import {deriveIndexerSequenceState} from '../../../../helpers/autobaseTestHelpers.js';
import {config} from '../../../../helpers/config.js';
import {applyWithEntryOverrides} from '../setGenesisEpoch/setGenesisEpochScenarioHelpers.js';
import {
    appendHtlcLock,
    appendHtlcLockBatch,
    buildHtlcLockPayload,
    decodeHtlcLockPayload,
    DEFAULT_PREIMAGE,
    DEFAULT_PRINCIPAL,
    DEFAULT_SURCHARGE,
    readLockState,
    readNodeEntry,
    setupHtlcLockScenario,
} from '../htlcLock/htlcLockScenarioHelpers.js';

async function buildClaimPayload(context, lockPayload, {
    wallet = context.htlcLockScenario.validatorPeer.wallet,
    preimage = DEFAULT_PREIMAGE,
} = {}) {
    const lockId = decodeHtlcLockPayload(lockPayload).hlo.tx;
    const txValidity = await deriveIndexerSequenceState(context.htlcLockScenario.validatorPeer.base);
    const partial = await applyStateMessageFactory(wallet, config)
        .buildPartialHtlcClaimOperationMessage(wallet.address, txValidity, lockId, preimage);
    const complete = await applyStateMessageFactory(wallet, config)
        .buildCompleteHtlcClaimOperationMessage(
            partial.address,
            partial.hco.tx,
            partial.hco.txv,
            partial.hco.li,
            partial.hco.pi,
            partial.hco.in,
            partial.hco.is
        );
    return safeEncodeApplyOperation(complete);
}

async function readClaimRecord(base, payload) {
    const txHash = safeDecodeApplyOperation(payload).hco.tx;
    return base.view.get(b4a.toString(txHash, 'hex'));
}

test('State.apply HTLC_CLAIM lets a third party settle to stored recipients and reveals the preimage', async t => {
    const context = await setupHtlcLockScenario(t, {nodes: 4});
    const {validatorPeer, makerPeer, claimantPeer} = context.htlcLockScenario;
    const submitterPeer = context.peers[3];
    const lockPayload = await buildHtlcLockPayload(context, {feeRecipient: makerPeer.wallet.address});
    await appendHtlcLock(context, lockPayload);
    const claimPayload = await buildClaimPayload(context, lockPayload, {wallet: submitterPeer.wallet});
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    t.is(await readNodeEntry(validatorPeer.base, submitterPeer.wallet.address), null, 'submitter has no account');

    await appendHtlcLock(context, claimPayload);

    const claimantAfter = await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address);
    const makerAfter = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    const submitterAfter = await readNodeEntry(validatorPeer.base, submitterPeer.wallet.address);
    const lockState = await readLockState(validatorPeer.base, lockPayload);
    const claimRecord = await readClaimRecord(validatorPeer.base, claimPayload);

    t.ok(b4a.equals(claimantAfter.balance, DEFAULT_PRINCIPAL), 'claimant receives principal even though a reader submitted');
    t.ok(b4a.equals(makerAfter.balance, toBalance(makerBefore.balance).add(toBalance(DEFAULT_SURCHARGE)).value), 'stored fee recipient receives surcharge');
    t.is(submitterAfter, null, 'unfunded submitter receives no escrow funds');
    t.is(lockState.escrow.status, escrowEntryUtils.Status.CLAIMED, 'escrow becomes claimed');
    t.ok(b4a.equals(lockState.escrow.preimage, DEFAULT_PREIMAGE), 'preimage remains visible in escrow');
    t.ok(b4a.equals(claimRecord.value, claimPayload), 'claim operation is retained in history');

    await appendHtlcLock(context, claimPayload);
    const claimantAfterReplay = await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address);
    t.ok(b4a.equals(claimantAfterReplay.balance, DEFAULT_PRINCIPAL), 'replay does not pay twice');
});

test('State.apply HTLC_CLAIM combines principal and surcharge for one recipient', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, claimantPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);

    await appendHtlcLock(context, await buildClaimPayload(context, lockPayload));

    const claimant = await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address);
    const total = toBalance(DEFAULT_PRINCIPAL).add(toBalance(DEFAULT_SURCHARGE));
    t.ok(b4a.equals(claimant.balance, total.value), 'same beneficiary is credited once with both amounts');
});

test('State.apply HTLC_CLAIM settles a lock without a surcharge recipient', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, claimantPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context, {
        feeAmount: b4a.alloc(BALANCE_BYTE_LENGTH),
        feeRecipient: null,
    });
    await appendHtlcLock(context, lockPayload);

    await appendHtlcLock(context, await buildClaimPayload(context, lockPayload));

    const claimant = await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address);
    t.ok(b4a.equals(claimant.balance, DEFAULT_PRINCIPAL), 'claimant receives the full principal');
    t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.CLAIMED);
});

test('State.apply HTLC_CLAIM rejects a wrong preimage without changing escrow or balances', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, claimantPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const claimPayload = await buildClaimPayload(context, lockPayload, {preimage: b4a.alloc(32, 0x32)});

    await appendHtlcLock(context, claimPayload);

    const lockState = await readLockState(validatorPeer.base, lockPayload);
    t.is(lockState.escrow.status, escrowEntryUtils.Status.PENDING, 'wrong secret does not settle');
    t.is(await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address), null, 'claimant receives nothing');
    t.is(await readClaimRecord(validatorPeer.base, claimPayload), null, 'invalid claim is not recorded');
});

test('State.apply HTLC_CLAIM rejects an invalid submitter signature', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const claim = safeDecodeApplyOperation(await buildClaimPayload(context, lockPayload));
    claim.hco.is = b4a.alloc(claim.hco.is.length, 0xaa);
    const invalidPayload = safeEncodeApplyOperation(claim);

    await appendHtlcLock(context, invalidPayload);

    t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.PENDING);
    t.is(await readClaimRecord(validatorPeer.base, invalidPayload), null, 'invalid signature is not recorded');
});

test('State.apply HTLC_CLAIM stops at the refund epoch', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, claimantPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const claimPayload = await buildClaimPayload(context, lockPayload);
    const refundEpoch = decodeHtlcLockPayload(lockPayload).hlo.re;

    await applyWithEntryOverrides(
        context,
        claimPayload,
        new Map([[EntryType.EPOCH_CURRENT, uint64ToBuffer(refundEpoch.readBigUInt64BE(0))]])
    );

    t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.PENDING);
    t.is(await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address), null, 'expired claim pays nothing');
    t.is(await readClaimRecord(validatorPeer.base, claimPayload), null, 'expired claim is not recorded');
});

test('State.apply HTLC_CLAIM settles at most once for distinct claims in the same batch', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, claimantPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const first = await buildClaimPayload(context, lockPayload);
    const second = await buildClaimPayload(context, lockPayload);

    await appendHtlcLockBatch(context, [first, second]);

    const claimant = await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address);
    const total = toBalance(DEFAULT_PRINCIPAL).add(toBalance(DEFAULT_SURCHARGE));
    t.ok(b4a.equals(claimant.balance, total.value), 'escrow is paid once');
    t.ok(await readClaimRecord(validatorPeer.base, first), 'first claim is recorded');
    t.is(await readClaimRecord(validatorPeer.base, second), null, 'second claim is not recorded');
});
