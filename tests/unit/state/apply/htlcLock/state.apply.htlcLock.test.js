import test from 'brittle';
import b4a from 'b4a';

import {
    BALANCE_FEE,
    PERCENT_75,
    toBalance,
} from '../../../../../src/core/state/utils/balance.js';
import * as escrowEntryUtils from '../../../../../src/core/state/utils/escrowEntry.js';
import {
    safeDecodeApplyOperation,
    safeEncodeApplyOperation,
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import {uint64ToBuffer} from '../../../../../src/utils/buffer.js';
import {
    appendHtlcLock,
    appendHtlcLockAtCurrentEpoch,
    appendHtlcLockBatch,
    buildHtlcLockPayload,
    decodeHtlcLockPayload,
    DEFAULT_POLICY_HASH,
    DEFAULT_PRINCIPAL,
    DEFAULT_REFUND_EPOCH,
    DEFAULT_SURCHARGE,
    readLockState,
    readNodeEntry,
    setupHtlcLockScenario,
} from './htlcLockScenarioHelpers.js';

test('State.apply HTLC_LOCK creates escrow and applies balances once', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer, claimantPeer} = context.htlcLockScenario;
    const payload = await buildHtlcLockPayload(context);
    const operation = decodeHtlcLockPayload(payload);
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    const validatorBefore = await readNodeEntry(validatorPeer.base, validatorPeer.wallet.address);

    await appendHtlcLock(context, payload);

    const makerAfter = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    const validatorAfter = await readNodeEntry(validatorPeer.base, validatorPeer.wallet.address);
    const lockState = await readLockState(validatorPeer.base, payload);
    const escrowAmount = toBalance(DEFAULT_PRINCIPAL).add(toBalance(DEFAULT_SURCHARGE));
    const totalDeducted = escrowAmount.add(BALANCE_FEE);
    const expectedMakerBalance = toBalance(makerBefore.balance).sub(totalDeducted);
    const expectedValidatorBalance = toBalance(validatorBefore.balance)
        .add(BALANCE_FEE.percentage(PERCENT_75));

    t.ok(b4a.equals(makerAfter.balance, expectedMakerBalance.value), 'principal, surcharge, and network fee are deducted');
    t.ok(b4a.equals(validatorAfter.balance, expectedValidatorBalance.value), 'validator receives the standard fee reward');
    t.is(lockState.escrow.status, escrowEntryUtils.Status.PENDING, 'escrow is pending');
    t.ok(b4a.equals(lockState.escrow.lockId, operation.hlo.tx), 'transaction hash is the lock id');
    t.ok(b4a.equals(lockState.escrow.lockerAddress, operation.address), 'escrow stores the locker');
    t.ok(b4a.equals(lockState.escrow.claimRecipientAddress, operation.hlo.ca), 'escrow stores the claimant');
    t.ok(b4a.equals(lockState.escrow.refundRecipientAddress, operation.hlo.ra), 'escrow stores the refund recipient');
    t.ok(b4a.equals(lockState.escrow.additionalFeeRecipientAddress, operation.hlo.fr), 'escrow stores the surcharge recipient');
    t.ok(b4a.equals(lockState.escrow.amount, DEFAULT_PRINCIPAL), 'escrow stores the principal');
    t.ok(b4a.equals(lockState.escrow.additionalFeeAmount, DEFAULT_SURCHARGE), 'escrow stores the surcharge');
    t.ok(b4a.equals(lockState.escrow.hashLock, operation.hlo.hl), 'escrow stores the hashlock');
    t.ok(b4a.equals(lockState.escrow.refundEpoch, DEFAULT_REFUND_EPOCH), 'escrow stores the refund epoch');
    t.ok(b4a.equals(lockState.escrow.policyHash, DEFAULT_POLICY_HASH), 'escrow stores the policy commitment');
    t.ok(b4a.equals(lockState.operation.value, payload), 'complete operation is retained for history and replay protection');

    const makerBalanceAfterFirstApply = b4a.from(makerAfter.balance);
    const validatorBalanceAfterFirstApply = b4a.from(validatorAfter.balance);
    await appendHtlcLock(context, payload);

    const makerAfterReplay = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    const validatorAfterReplay = await readNodeEntry(validatorPeer.base, validatorPeer.wallet.address);
    t.ok(b4a.equals(makerAfterReplay.balance, makerBalanceAfterFirstApply), 'replay does not charge the locker again');
    t.ok(b4a.equals(validatorAfterReplay.balance, validatorBalanceAfterFirstApply), 'replay does not reward the validator again');

    await context.sync();
    const replicatedState = await readLockState(claimantPeer.base, payload);
    t.ok(replicatedState.escrow, 'escrow state replicates to readers');
});

test('State.apply HTLC_LOCK requires initialized epoch state', async t => {
    const context = await setupHtlcLockScenario(t, {initializeEpoch: false});
    const {validatorPeer, makerPeer} = context.htlcLockScenario;
    const payload = await buildHtlcLockPayload(context);
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);

    await appendHtlcLock(context, payload);

    const makerAfter = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    const lockState = await readLockState(validatorPeer.base, payload);
    t.ok(b4a.equals(makerAfter.balance, makerBefore.balance), 'locker balance remains unchanged');
    t.is(lockState.escrow, null, 'escrow is not created');
    t.is(lockState.operation, null, 'operation is not recorded');
});

test('State.apply HTLC_LOCK skips a lock made stale by an epoch advance without penalty', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer} = context.htlcLockScenario;
    const payload = await buildHtlcLockPayload(context, {
        refundEpoch: uint64ToBuffer(1n),
    });
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);

    const applyErrors = [];
    const originalConsoleError = console.error;
    console.error = (...args) => {
        applyErrors.push(args);
        originalConsoleError(...args);
    };
    try {
        await appendHtlcLockAtCurrentEpoch(context, payload, 1n);
    } finally {
        console.error = originalConsoleError;
    }

    const makerAfter = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    const lockState = await readLockState(validatorPeer.base, payload);
    t.ok(b4a.equals(makerAfter.balance, makerBefore.balance), 'expired lock terms cannot reserve funds');
    t.is(lockState.escrow, null, 'expired lock terms cannot create escrow');
    t.is(lockState.operation, null, 'expired lock operation is not recorded');
    t.ok(
        applyErrors.some(args => args.some(arg => String(arg).includes('Refund epoch is below the minimum lock duration.'))),
        'the lock is skipped because its refund epoch became stale'
    );
    t.absent(
        applyErrors.some(args => args.some(arg => String(arg).includes('invalid operations.'))),
        'stale lock does not count as an invalid operation'
    );
});

test('State.apply HTLC_LOCK revalidates cosigner authorization', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer, claimantPeer} = context.htlcLockScenario;
    const payload = await buildHtlcLockPayload(context, {cosignerPeer: claimantPeer});
    const mutated = safeDecodeApplyOperation(payload);
    mutated.hlo.cs[0] = b4a.alloc(64, 0xaa);
    const invalidPayload = safeEncodeApplyOperation(mutated);
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);

    await appendHtlcLock(context, invalidPayload);

    const makerAfter = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    const lockState = await readLockState(validatorPeer.base, invalidPayload);
    t.ok(b4a.equals(makerAfter.balance, makerBefore.balance), 'invalid authorization cannot reserve funds');
    t.is(lockState.escrow, null, 'invalid authorization cannot create escrow');
    t.is(lockState.operation, null, 'invalid authorization is not recorded');
});

test('State.apply HTLC_LOCK prevents same-batch escrow overspending', async t => {
    const escrowAmount = toBalance(DEFAULT_PRINCIPAL).add(toBalance(DEFAULT_SURCHARGE));
    const oneLockBalance = escrowAmount.add(BALANCE_FEE);
    const context = await setupHtlcLockScenario(t, {makerBalance: oneLockBalance.value});
    const {validatorPeer, makerPeer} = context.htlcLockScenario;
    const firstPayload = await buildHtlcLockPayload(context, {
        hashLock: b4a.alloc(32, 0x61),
        nonce: b4a.alloc(32, 0x71),
    });
    const secondPayload = await buildHtlcLockPayload(context, {
        hashLock: b4a.alloc(32, 0x62),
        nonce: b4a.alloc(32, 0x72),
    });
    const validatorBefore = await readNodeEntry(validatorPeer.base, validatorPeer.wallet.address);

    await appendHtlcLockBatch(context, [firstPayload, secondPayload]);

    const makerAfter = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    const validatorAfter = await readNodeEntry(validatorPeer.base, validatorPeer.wallet.address);
    const firstState = await readLockState(validatorPeer.base, firstPayload);
    const secondState = await readLockState(validatorPeer.base, secondPayload);
    const expectedValidatorBalance = toBalance(validatorBefore.balance)
        .add(BALANCE_FEE.percentage(PERCENT_75));

    t.ok(toBalance(makerAfter.balance).equals(toBalance(b4a.alloc(16))), 'only one lock consumes the available balance');
    t.ok(firstState.escrow, 'first escrow is created');
    t.ok(firstState.operation, 'first operation is recorded');
    t.is(secondState.escrow, null, 'second escrow is not created');
    t.is(secondState.operation, null, 'second operation is not recorded');
    t.ok(b4a.equals(validatorAfter.balance, expectedValidatorBalance.value), 'validator receives only one network fee reward');
});
