import test from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';

import {applyStateMessageFactory} from '../../../../../src/messages/state/applyStateMessageFactory.js';
import {safeDecodeApplyOperation, safeEncodeApplyOperation} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import * as escrowEntryUtils from '../../../../../src/core/state/utils/escrowEntry.js';
import nodeEntryUtils from '../../../../../src/core/state/utils/nodeEntry.js';
import nodeRoleUtils from '../../../../../src/core/state/utils/roles.js';
import {toBalance} from '../../../../../src/core/state/utils/balance.js';
import {BALANCE_BYTE_LENGTH, EntryType, OperationType} from '../../../../../src/utils/constants.js';
import {bigIntToBuffer, createMessage, uint64ToBuffer, ZERO_WK} from '../../../../../src/utils/buffer.js';
import {deriveIndexerSequenceState} from '../../../../helpers/autobaseTestHelpers.js';
import {config} from '../../../../helpers/config.js';
import {applyWithEntryOverrides} from '../setGenesisEpoch/setGenesisEpochScenarioHelpers.js';
import {
    appendHtlcLock,
    buildHtlcLockPayload,
    decodeHtlcLockPayload,
    DEFAULT_PRINCIPAL,
    DEFAULT_SURCHARGE,
    readLockState,
    readNodeEntry,
    setupHtlcLockScenario,
} from '../htlcLock/htlcLockScenarioHelpers.js';

async function buildRefundPayload(context, lockPayload, {
    wallet = context.htlcLockScenario.claimantPeer.wallet,
    validatorWallet = context.htlcLockScenario.validatorPeer.wallet,
    txValidity = null,
} = {}) {
    const lockId = decodeHtlcLockPayload(lockPayload).hlo.tx;
    txValidity ??= await deriveIndexerSequenceState(context.htlcLockScenario.validatorPeer.base);
    const partial = await applyStateMessageFactory(wallet, config)
        .buildPartialHtlcRefundOperationMessage(wallet.address, txValidity, lockId);
    const complete = await applyStateMessageFactory(validatorWallet, config)
        .buildCompleteHtlcRefundOperationMessage(
            partial.address,
            partial.hro.tx,
            partial.hro.txv,
            partial.hro.li,
            partial.hro.in,
            partial.hro.is
        );
    return safeEncodeApplyOperation(complete);
}

async function readRefundRecord(base, payload) {
    const txHash = safeDecodeApplyOperation(payload).hro.tx;
    return base.view.get(b4a.toString(txHash, 'hex'));
}

test('State.apply HTLC_REFUND lets a third party return all escrowed TNK to the stored refund recipient', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer, claimantPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const refundPayload = await buildRefundPayload(context, lockPayload);
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    t.is(await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address), null, 'submitter has no account');

    await applyWithEntryOverrides(
        context,
        refundPayload,
        new Map([[EntryType.EPOCH_CURRENT, decodeHtlcLockPayload(lockPayload).hlo.re]])
    );

    const refundAmount = toBalance(DEFAULT_PRINCIPAL).add(toBalance(DEFAULT_SURCHARGE));
    const makerAfter = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    const lockState = await readLockState(validatorPeer.base, lockPayload);
    t.ok(b4a.equals(makerAfter.balance, toBalance(makerBefore.balance).add(refundAmount).value));
    t.is(await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address), null, 'submitter receives nothing');
    t.is(lockState.escrow.status, escrowEntryUtils.Status.REFUNDED);
    t.is(lockState.escrow.preimage, null);
    t.ok(b4a.equals((await readRefundRecord(validatorPeer.base, refundPayload)).value, refundPayload));
});

test('State.apply HTLC_REFUND pays only the refund recipient stored in escrow', async t => {
    const context = await setupHtlcLockScenario(t, {nodes: 4});
    const {validatorPeer, makerPeer, claimantPeer} = context.htlcLockScenario;
    const refundPeer = context.peers[3];
    const lockPayload = await buildHtlcLockPayload(context, {refundAddress: refundPeer.wallet.address});
    await appendHtlcLock(context, lockPayload);
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    const refundPayload = await buildRefundPayload(context, lockPayload, {wallet: claimantPeer.wallet});

    await applyWithEntryOverrides(context, refundPayload,
        new Map([[EntryType.EPOCH_CURRENT, decodeHtlcLockPayload(lockPayload).hlo.re]]));

    const refundAmount = toBalance(DEFAULT_PRINCIPAL).add(toBalance(DEFAULT_SURCHARGE));
    t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, refundPeer.wallet.address)).balance,
        refundAmount.value), 'stored refund recipient receives principal and surcharge');
    t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
        makerBefore.balance), 'maker receives nothing when not the refund recipient');
    t.is(await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address), null,
        'submitter and fee recipient receive nothing');
    t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.REFUNDED);
});

test('State.apply HTLC_REFUND returns principal without a surcharge', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context, {
        feeAmount: b4a.alloc(BALANCE_BYTE_LENGTH),
        feeRecipient: null,
    });
    await appendHtlcLock(context, lockPayload);
    const before = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    const refundPayload = await buildRefundPayload(context, lockPayload);

    await applyWithEntryOverrides(context, refundPayload,
        new Map([[EntryType.EPOCH_CURRENT, decodeHtlcLockPayload(lockPayload).hlo.re]]));

    t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
        toBalance(before.balance).add(toBalance(DEFAULT_PRINCIPAL)).value));
    t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.REFUNDED);
});

test('State.apply HTLC_REFUND cannot settle before the refund epoch', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const refundPayload = await buildRefundPayload(context, lockPayload);
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);

    await applyWithEntryOverrides(
        context,
        refundPayload,
        new Map([[EntryType.EPOCH_CURRENT, uint64ToBuffer(9n)]])
    );

    t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.PENDING);
    t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance, makerBefore.balance));
    t.is(await readRefundRecord(validatorPeer.base, refundPayload), null);
});

test('State.apply HTLC_REFUND rejects an invalid submitter signature', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const refund = safeDecodeApplyOperation(await buildRefundPayload(context, lockPayload));
    refund.hro.is = b4a.alloc(refund.hro.is.length, 0xaa);
    const invalidPayload = safeEncodeApplyOperation(refund);

    await applyWithEntryOverrides(
        context,
        invalidPayload,
        new Map([[EntryType.EPOCH_CURRENT, decodeHtlcLockPayload(lockPayload).hlo.re]])
    );

    t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.PENDING);
    t.is(await readRefundRecord(validatorPeer.base, invalidPayload), null);
});

test('State.apply HTLC_REFUND reports hash failures, hash mismatches, and signature errors separately', async t => {
    for (const {label, modify, hashMessage, expectedLog} of [
        {
            label: 'refund hash failure',
            hashMessage: operation => createMessage(config.networkId, operation.hro.txv,
                operation.hro.li, operation.hro.in, OperationType.HTLC_REFUND),
            expectedLog: 'Failed to hash refund message.'
        },
        {
            label: 'refund hash mismatch',
            modify: operation => { operation.hro.tx[0] ^= 1; },
            expectedLog: 'Refund transaction hash is invalid.'
        },
        {
            label: 'refund submitter signature',
            modify: operation => { operation.hro.is[0] ^= 1; },
            expectedLog: 'Refund submitter signature is invalid.'
        },
        {
            label: 'validator hash failure',
            hashMessage: operation => createMessage(config.networkId, operation.hro.tx,
                operation.hro.vn, OperationType.HTLC_REFUND),
            expectedLog: 'Failed to hash validator message.'
        },
        {
            label: 'validator signature',
            modify: operation => { operation.hro.vs[0] ^= 1; },
            expectedLog: 'Validator signature is invalid.'
        }
    ]) {
        const context = await setupHtlcLockScenario(t);
        const {validatorPeer, makerPeer} = context.htlcLockScenario;
        const lockPayload = await buildHtlcLockPayload(context);
        await appendHtlcLock(context, lockPayload);
        const operation = safeDecodeApplyOperation(await buildRefundPayload(context, lockPayload));
        modify?.(operation);
        const payload = safeEncodeApplyOperation(operation);
        const targetMessage = hashMessage?.(operation);
        const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
        const originalHash = tracCryptoApi.hash.blake3Safe;
        const originalConsoleError = console.error;
        const logs = [];

        if (targetMessage) {
            tracCryptoApi.hash.blake3Safe = async message => b4a.equals(message, targetMessage)
                ? b4a.alloc(0)
                : originalHash(message);
        }
        console.error = (...args) => logs.push(args.join(' '));
        try {
            await applyWithEntryOverrides(context, payload,
                new Map([[EntryType.EPOCH_CURRENT, decodeHtlcLockPayload(lockPayload).hlo.re]]));
        } finally {
            tracCryptoApi.hash.blake3Safe = originalHash;
            console.error = originalConsoleError;
        }

        t.ok(logs.some(log => log.includes(expectedLog)), `${label}: expected error is logged`);
        t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status,
            escrowEntryUtils.Status.PENDING, `${label}: escrow stays pending`);
        t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
            makerBefore.balance), `${label}: refund recipient is not credited`);
        t.is(await readRefundRecord(validatorPeer.base, payload), null, `${label}: refund is not recorded`);
    }
});

test('State.apply HTLC_REFUND distinguishes invalid submitter addresses from public keys', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const refund = safeDecodeApplyOperation(await buildRefundPayload(context, lockPayload));
    const refundEpoch = decodeHtlcLockPayload(lockPayload).hlo.re;
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);

    for (const [address, expectedLog] of [
        [b4a.alloc(config.addressLength, 0x78), 'Submitter address is invalid.'],
        [b4a.from(tracCryptoApi.address.encode(config.addressPrefix, b4a.alloc(32)), 'ascii'),
            'Submitter public key is invalid.'],
    ]) {
        const payload = safeEncodeApplyOperation({...refund, address});
        const originalConsoleError = console.error;
        const logs = [];
        console.error = (...args) => logs.push(args.join(' '));
        try {
            await applyWithEntryOverrides(context, payload, new Map([[EntryType.EPOCH_CURRENT, refundEpoch]]));
        } finally {
            console.error = originalConsoleError;
        }

        t.ok(logs.some(log => log.includes(expectedLog)), `expected apply log "${expectedLog}" was emitted`);
        t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.PENDING);
        t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
            makerBefore.balance));
        t.is(await readRefundRecord(validatorPeer.base, payload), null);
    }
});


test('State.apply HTLC_REFUND rejects missing or forged validator metadata', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const refund = safeDecodeApplyOperation(await buildRefundPayload(context, lockPayload));
    const refundEpoch = decodeHtlcLockPayload(lockPayload).hlo.re;

    for (const modify of [
        operation => { delete operation.hro.va; delete operation.hro.vn; delete operation.hro.vs; },
        operation => { operation.hro.vs = b4a.alloc(operation.hro.vs.length, 0xaa); },
        operation => { operation.hro.va = operation.address; },
    ]) {
        const invalidRefund = {...refund, hro: {...refund.hro}};
        modify(invalidRefund);
        const payload = safeEncodeApplyOperation(invalidRefund);
        await applyWithEntryOverrides(
            context,
            payload,
            new Map([[EntryType.EPOCH_CURRENT, refundEpoch]])
        );
        t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.PENDING);
        t.is(await readRefundRecord(validatorPeer.base, payload), null);
    }
});

test('State.apply HTLC_REFUND requires the validator signer to own the publishing writer key', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, claimantPeer, makerPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const refundPayload = await buildRefundPayload(context, lockPayload, {
        wallet: makerPeer.wallet,
        validatorWallet: claimantPeer.wallet
    });
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);

    await applyWithEntryOverrides(context, refundPayload,
        new Map([[EntryType.EPOCH_CURRENT, decodeHtlcLockPayload(lockPayload).hlo.re]]));

    t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.PENDING);
    t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
        makerBefore.balance));
    t.is(await readRefundRecord(validatorPeer.base, refundPayload), null);
});

test('State.apply HTLC_REFUND rejects matching submitter and validator nonces or signatures', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const refund = safeDecodeApplyOperation(await buildRefundPayload(context, lockPayload));
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);

    for (const modify of [
        operation => { operation.hro.vn = operation.hro.in; },
        operation => { operation.hro.vs = operation.hro.is; },
    ]) {
        const invalidRefund = {...refund, hro: {...refund.hro}};
        modify(invalidRefund);
        const payload = safeEncodeApplyOperation(invalidRefund);
        await applyWithEntryOverrides(context, payload,
            new Map([[EntryType.EPOCH_CURRENT, decodeHtlcLockPayload(lockPayload).hlo.re]]));

        t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.PENDING);
        t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
            makerBefore.balance));
        t.is(await readRefundRecord(validatorPeer.base, payload), null);
    }
});

test('State.apply HTLC_REFUND pays once for competing refunds in the same batch', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const first = await buildRefundPayload(context, lockPayload);
    const second = await buildRefundPayload(context, lockPayload);
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);

    await applyWithEntryOverrides(
        context,
        [first, second],
        new Map([[EntryType.EPOCH_CURRENT, decodeHtlcLockPayload(lockPayload).hlo.re]])
    );

    const refundAmount = toBalance(DEFAULT_PRINCIPAL).add(toBalance(DEFAULT_SURCHARGE));
    const makerAfter = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    t.ok(b4a.equals(makerAfter.balance, toBalance(makerBefore.balance).add(refundAmount).value));
    t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.REFUNDED);
    t.ok(await readRefundRecord(validatorPeer.base, first));
    t.is(await readRefundRecord(validatorPeer.base, second), null);
});

test('State.apply HTLC_REFUND does not pay again across separate batches or replay', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const first = await buildRefundPayload(context, lockPayload);
    const second = await buildRefundPayload(context, lockPayload);
    const refundEpoch = decodeHtlcLockPayload(lockPayload).hlo.re;

    await applyWithEntryOverrides(context, first, new Map([[EntryType.EPOCH_CURRENT, refundEpoch]]));
    const makerAfterFirst = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    await applyWithEntryOverrides(context, second, new Map([[EntryType.EPOCH_CURRENT, refundEpoch]]));
    await applyWithEntryOverrides(context, first, new Map([[EntryType.EPOCH_CURRENT, refundEpoch]]));

    t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
        makerAfterFirst.balance), 'principal and surcharge are returned only once');
    t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.REFUNDED);
    t.ok(await readRefundRecord(validatorPeer.base, first), 'first refund remains in history');
    t.is(await readRefundRecord(validatorPeer.base, second), null, 'second refund is not recorded');
});

test('State.apply HTLC_REFUND rejects missing or corrupt escrow and epoch state', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const refundPayload = await buildRefundPayload(context, lockPayload);
    const refundEpoch = decodeHtlcLockPayload(lockPayload).hlo.re;
    const escrowKey = EntryType.HTLC_ESCROW + b4a.toString(decodeHtlcLockPayload(lockPayload).hlo.tx, 'hex');
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);

    for (const overrides of [
        new Map([[EntryType.EPOCH_CURRENT, refundEpoch], [escrowKey, null]]),
        new Map([[EntryType.EPOCH_CURRENT, refundEpoch], [escrowKey, b4a.from([1])]]),
        new Map([[EntryType.EPOCH_CURRENT, null]]),
    ]) {
        await applyWithEntryOverrides(context, refundPayload, overrides);
        t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.PENDING);
        t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
            makerBefore.balance));
        t.is(await readRefundRecord(validatorPeer.base, refundPayload), null);
    }
});

test('State.apply HTLC_REFUND rejects recipient overflow or corruption without settling', async t => {
    for (const recipientOverride of [
        nodeEntryUtils.init(ZERO_WK, nodeRoleUtils.NodeRole.READER, bigIntToBuffer((1n << 128n) - 1n)),
        b4a.from([1]),
    ]) {
        const context = await setupHtlcLockScenario(t);
        const {validatorPeer, makerPeer} = context.htlcLockScenario;
        const lockPayload = await buildHtlcLockPayload(context);
        await appendHtlcLock(context, lockPayload);
        const refundPayload = await buildRefundPayload(context, lockPayload);
        const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);

        await applyWithEntryOverrides(context, refundPayload, new Map([
            [EntryType.EPOCH_CURRENT, decodeHtlcLockPayload(lockPayload).hlo.re],
            [makerPeer.wallet.address, recipientOverride],
        ]));

        t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
            makerBefore.balance), 'recipient balance is unchanged');
        t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status,
            escrowEntryUtils.Status.PENDING, 'escrow remains pending');
        t.is(await readRefundRecord(validatorPeer.base, refundPayload), null, 'refund is not recorded');
    }
});

test('State.apply HTLC_REFUND rejects stale validity and validator self-validation', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    const refundEpoch = decodeHtlcLockPayload(lockPayload).hlo.re;
    const stale = await buildRefundPayload(context, lockPayload, {txValidity: b4a.alloc(32, 0x7f)});
    const selfValidated = await buildRefundPayload(context, lockPayload, {wallet: validatorPeer.wallet});

    for (const payload of [stale, selfValidated]) {
        await applyWithEntryOverrides(context, payload, new Map([[EntryType.EPOCH_CURRENT, refundEpoch]]));
        t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.PENDING);
        t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
            makerBefore.balance));
        t.is(await readRefundRecord(validatorPeer.base, payload), null);
    }
});

test('State.apply HTLC_REFUND preserves metadata and its omission through settlement and replay', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer} = context.htlcLockScenario;
    for (const metadata of [undefined, b4a.alloc(1), b4a.alloc(1024, 0xff)]) {
        const lockPayload = await buildHtlcLockPayload(context, {metadata});
        await appendHtlcLock(context, lockPayload);
        const refundPayload = await buildRefundPayload(context, lockPayload);
        const overrides = new Map([[EntryType.EPOCH_CURRENT, decodeHtlcLockPayload(lockPayload).hlo.re]]);
        await applyWithEntryOverrides(context, refundPayload, overrides);
        const settled = await readLockState(validatorPeer.base, lockPayload);
        t.is(settled.escrow.status, escrowEntryUtils.Status.REFUNDED);
        if (metadata === undefined) t.is(settled.escrow.metadata, null, 'refund preserves omission');
        else t.ok(b4a.equals(settled.escrow.metadata, metadata), 'refund preserves metadata bytes');
        t.ok(b4a.equals(settled.operation.value, lockPayload), 'original lock history is unchanged');

        await applyWithEntryOverrides(context, refundPayload, overrides);
        const replayed = await readLockState(validatorPeer.base, lockPayload);
        t.ok(b4a.equals(replayed.escrowRecord.value, settled.escrowRecord.value), 'replay preserves the complete escrow');
    }
});
