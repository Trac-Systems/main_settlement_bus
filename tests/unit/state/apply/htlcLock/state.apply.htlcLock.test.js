import test from 'brittle';
import b4a from 'b4a';

import {
    BALANCE_FEE,
    PERCENT_75,
    toBalance,
} from '../../../../../src/core/state/utils/balance.js';
import * as escrowEntryUtils from '../../../../../src/core/state/utils/escrowEntry.js';
import nodeEntryUtils from '../../../../../src/core/state/utils/nodeEntry.js';
import {
    safeDecodeApplyOperation,
    safeEncodeApplyOperation,
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import {bigIntToBuffer, uint64ToBuffer} from '../../../../../src/utils/buffer.js';
import {applyWithEntryOverrides} from '../setGenesisEpoch/setGenesisEpochScenarioHelpers.js';
import {buildTransferPayload, DEFAULT_INITIAL_BALANCE} from '../transfer/transferScenarioHelpers.js';
import {initializeBalances, whitelistAddress} from '../common/commonScenarioHelper.js';
import {promotePeerToWriter} from '../addWriter/addWriterScenarioHelpers.js';
import {eventFlush} from '../../../../helpers/autobaseTestHelpers.js';
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

test('State.apply HTLC_LOCK prevents escrow overspending across separate batches', async t => {
    const oneLockBalance = toBalance(DEFAULT_PRINCIPAL).add(toBalance(DEFAULT_SURCHARGE)).add(BALANCE_FEE);
    const context = await setupHtlcLockScenario(t, {makerBalance: oneLockBalance.value});
    const {validatorPeer, makerPeer} = context.htlcLockScenario;
    const first = await buildHtlcLockPayload(context);
    const second = await buildHtlcLockPayload(context);
    const validatorBefore = await readNodeEntry(validatorPeer.base, validatorPeer.wallet.address);

    await appendHtlcLock(context, first);
    await appendHtlcLock(context, second);

    t.ok((await readLockState(validatorPeer.base, first)).escrow);
    t.is((await readLockState(validatorPeer.base, second)).escrow, null);
    t.is((await readLockState(validatorPeer.base, second)).operation, null);
    t.ok(toBalance((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance)
        .equals(toBalance(b4a.alloc(16))));
    const validatorAfter = await readNodeEntry(validatorPeer.base, validatorPeer.wallet.address);
    t.ok(b4a.equals(validatorAfter.balance,
        toBalance(validatorBefore.balance).add(BALANCE_FEE.percentage(PERCENT_75)).value));
});

test('State.apply cannot spend the same funds with a lock and transfer in either order', async t => {
    for (const firstType of ['lock', 'transfer']) {
        for (const sameBatch of [true, false]) {
            const spend = toBalance(DEFAULT_PRINCIPAL).add(toBalance(DEFAULT_SURCHARGE));
            const context = await setupHtlcLockScenario(t, {makerBalance: spend.add(BALANCE_FEE).value});
            const {validatorPeer, makerPeer, claimantPeer} = context.htlcLockScenario;
            const lockPayload = await buildHtlcLockPayload(context);
            const transferPayload = await buildTransferPayload(context, {
                senderPeer: makerPeer,
                validatorPeer,
                recipientPeer: claimantPeer,
                amount: spend.value
            });
            const payloads = firstType === 'lock'
                ? [lockPayload, transferPayload]
                : [transferPayload, lockPayload];

            if (sameBatch) await appendHtlcLockBatch(context, payloads);
            else for (const payload of payloads) await appendHtlcLock(context, payload);

            const lockState = await readLockState(validatorPeer.base, lockPayload);
            const transferHash = b4a.toString(safeDecodeApplyOperation(transferPayload).tro.tx, 'hex');
            const transferRecord = await validatorPeer.base.view.get(transferHash);
            const transferRecipient = await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address);
            t.is(Boolean(lockState.escrow), firstType === 'lock', `${firstType} wins (${sameBatch ? 'same' : 'separate'} batch)`);
            t.is(Boolean(transferRecord), firstType === 'transfer', 'only the first operation is recorded');
            t.is(Boolean(transferRecipient), firstType === 'transfer', 'transfer recipient is paid only if transfer wins');
            t.ok(toBalance((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance)
                .equals(toBalance(b4a.alloc(16))), 'one spend consumes the available balance');
        }
    }
});

test('State.apply HTLC_LOCK settles a cosigned lock with the stored terms', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer, claimantPeer} = context.htlcLockScenario;
    const payload = await buildHtlcLockPayload(context, {cosignerPeer: claimantPeer});
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);

    await appendHtlcLock(context, payload);

    const state = await readLockState(validatorPeer.base, payload);
    const operation = decodeHtlcLockPayload(payload);
    t.is(state.escrow.status, escrowEntryUtils.Status.PENDING);
    t.ok(b4a.equals(state.escrow.lockId, operation.hlo.tx));
    t.ok(b4a.equals(state.escrow.policyHash, operation.hlo.ph));
    t.is(operation.hlo.ss.length, 2);
    t.is(operation.hlo.cs.length, 1);
    t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
        toBalance(makerBefore.balance).sub(
            toBalance(DEFAULT_PRINCIPAL).add(toBalance(DEFAULT_SURCHARGE)).add(BALANCE_FEE)
        ).value));
});

test('State.apply HTLC_LOCK rejects a corrupted locker account without reserving funds', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer} = context.htlcLockScenario;
    const payload = await buildHtlcLockPayload(context);
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);

    await applyWithEntryOverrides(context, payload,
        new Map([[makerPeer.wallet.address, b4a.from([1])]]));

    t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
        makerBefore.balance));
    t.is((await readLockState(validatorPeer.base, payload)).escrow, null);
    t.is((await readLockState(validatorPeer.base, payload)).operation, null);
});

test('State.apply HTLC_LOCK rejects validator reward overflow without reserving funds', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer} = context.htlcLockScenario;
    const payload = await buildHtlcLockPayload(context);
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    const validatorBefore = await readNodeEntry(validatorPeer.base, validatorPeer.wallet.address);
    const nearMaxValidator = nodeEntryUtils.encode({
        ...validatorBefore,
        balance: bigIntToBuffer((1n << 128n) - 1n)
    });

    await applyWithEntryOverrides(context, payload,
        new Map([[validatorPeer.wallet.address, nearMaxValidator]]));

    t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
        makerBefore.balance));
    t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, validatorPeer.wallet.address)).balance,
        validatorBefore.balance));
    t.is((await readLockState(validatorPeer.base, payload)).escrow, null);
    t.is((await readLockState(validatorPeer.base, payload)).operation, null);
});

test('State.apply HTLC_LOCK rejects malformed signatures, hash, and stale validity', async t => {
    for (const mutation of ['hash', 'maker signature', 'validator signature', 'stale validity', 'self-validation']) {
        const context = await setupHtlcLockScenario(t);
        const {validatorPeer, makerPeer} = context.htlcLockScenario;
        let payload = await buildHtlcLockPayload(context, mutation === 'stale validity'
            ? {txValidity: b4a.alloc(32, 0x7f)} : {});
        if (mutation !== 'stale validity') {
            const operation = safeDecodeApplyOperation(payload);
            if (mutation === 'hash') operation.hlo.tx[0] ^= 1;
            if (mutation === 'maker signature') operation.hlo.is[0] ^= 1;
            if (mutation === 'validator signature') operation.hlo.vs[0] ^= 1;
            if (mutation === 'self-validation') operation.address = operation.hlo.va;
            payload = safeEncodeApplyOperation(operation);
        }
        const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
        const validatorBefore = await readNodeEntry(validatorPeer.base, validatorPeer.wallet.address);

        await appendHtlcLock(context, payload);

        t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
            makerBefore.balance), `${mutation} leaves maker funds intact`);
        t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, validatorPeer.wallet.address)).balance,
            validatorBefore.balance), `${mutation} pays no reward`);
        t.is((await readLockState(validatorPeer.base, payload)).escrow, null, `${mutation} creates no escrow`);
        t.is((await readLockState(validatorPeer.base, payload)).operation, null, `${mutation} creates no record`);
    }
});

test('State.apply HTLC_LOCK rejects principal and fee overflow before any write', async t => {
    const maxAmount = (1n << 128n) - 1n;
    for (const [amount, feeAmount] of [
        [maxAmount, 1n],
        [maxAmount - 1n, 1n]
    ]) {
        const context = await setupHtlcLockScenario(t);
        const {validatorPeer, makerPeer} = context.htlcLockScenario;
        const payload = await buildHtlcLockPayload(context, {
            amount: bigIntToBuffer(amount),
            feeAmount: bigIntToBuffer(feeAmount)
        });
        const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
        const validatorBefore = await readNodeEntry(validatorPeer.base, validatorPeer.wallet.address);

        await appendHtlcLock(context, payload);

        t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
            makerBefore.balance));
        t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, validatorPeer.wallet.address)).balance,
            validatorBefore.balance));
        t.is((await readLockState(validatorPeer.base, payload)).escrow, null);
        t.is((await readLockState(validatorPeer.base, payload)).operation, null);
    }
});

test('State.apply HTLC_LOCK rejects a missing locker account', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer} = context.htlcLockScenario;
    const payload = await buildHtlcLockPayload(context);
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);

    await applyWithEntryOverrides(context, payload, new Map([[makerPeer.wallet.address, null]]));

    t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
        makerBefore.balance));
    t.is((await readLockState(validatorPeer.base, payload)).escrow, null);
    t.is((await readLockState(validatorPeer.base, payload)).operation, null);
});

test('State.apply HTLC_LOCK rejects a second validator spending locked funds', async t => {
    const oneLockBalance = toBalance(DEFAULT_PRINCIPAL).add(toBalance(DEFAULT_SURCHARGE)).add(BALANCE_FEE);
    const context = await setupHtlcLockScenario(t, {nodes: 5, makerBalance: oneLockBalance.value});
    const {validatorPeer, makerPeer} = context.htlcLockScenario;
    const secondaryValidator = context.peers[3];
    const writerInitialBalance = DEFAULT_INITIAL_BALANCE;
    context.addWriterScenario = {writerInitialBalance};
    await initializeBalances(context, [[secondaryValidator.wallet.address, writerInitialBalance]]);
    await whitelistAddress(context, secondaryValidator.wallet.address);
    await promotePeerToWriter(t, context, {
        readerPeer: secondaryValidator,
        validatorPeer,
        expectedWriterIndex: 1
    });
    await context.sync();

    const first = await buildHtlcLockPayload(context, {signingValidatorPeer: validatorPeer});
    const second = await buildHtlcLockPayload(context, {signingValidatorPeer: secondaryValidator});
    await validatorPeer.base.append(first);
    await validatorPeer.base.update();
    await eventFlush();
    await context.sync();
    await secondaryValidator.base.append(second);
    await secondaryValidator.base.update();
    await eventFlush();
    await context.sync();

    const firstState = await readLockState(validatorPeer.base, first);
    const secondState = await readLockState(validatorPeer.base, second);
    t.is(Number(Boolean(firstState.escrow)) + Number(Boolean(secondState.escrow)), 1,
        'only one competing lock reserves the funds');
    for (const peer of [validatorPeer, secondaryValidator, makerPeer]) {
        const peerFirst = await readLockState(peer.base, first);
        const peerSecond = await readLockState(peer.base, second);
        t.is(Boolean(peerFirst.escrow), Boolean(firstState.escrow), 'first lock agrees across peers');
        t.is(Boolean(peerSecond.escrow), Boolean(secondState.escrow), 'second lock agrees across peers');
        t.ok(toBalance((await readNodeEntry(peer.base, makerPeer.wallet.address)).balance)
            .equals(toBalance(b4a.alloc(16))), 'the maker spends only once');
    }
});
