import test from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';

import {applyStateMessageFactory} from '../../../../../src/messages/state/applyStateMessageFactory.js';
import {
    safeDecodeApplyOperation,
    safeEncodeApplyOperation,
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import * as escrowEntryUtils from '../../../../../src/core/state/utils/escrowEntry.js';
import nodeEntryUtils from '../../../../../src/core/state/utils/nodeEntry.js';
import {$TNK, toBalance} from '../../../../../src/core/state/utils/balance.js';
import {BALANCE_BYTE_LENGTH, EntryType, OperationType} from '../../../../../src/utils/constants.js';
import {bigIntToBuffer, createMessage, uint64ToBuffer, ZERO_WK} from '../../../../../src/utils/buffer.js';
import nodeRoleUtils from '../../../../../src/core/state/utils/roles.js';
import {deriveIndexerSequenceState, eventFlush} from '../../../../helpers/autobaseTestHelpers.js';
import {config} from '../../../../helpers/config.js';
import {applyWithEntryOverrides} from '../setGenesisEpoch/setGenesisEpochScenarioHelpers.js';
import {initializeBalances, whitelistAddress} from '../common/commonScenarioHelper.js';
import {promotePeerToWriter} from '../addWriter/addWriterScenarioHelpers.js';
import {DEFAULT_INITIAL_BALANCE} from '../transfer/transferScenarioHelpers.js';
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
    wallet = context.htlcLockScenario.makerPeer.wallet,
    validatorWallet = context.htlcLockScenario.validatorPeer.wallet,
    preimage = DEFAULT_PREIMAGE,
    txValidity = null,
} = {}) {
    const lockId = decodeHtlcLockPayload(lockPayload).hlo.tx;
    txValidity ??= await deriveIndexerSequenceState(context.htlcLockScenario.validatorPeer.base);
    const partial = await applyStateMessageFactory(wallet, config)
        .buildPartialHtlcClaimOperationMessage(wallet.address, txValidity, lockId, preimage);
    const complete = await applyStateMessageFactory(validatorWallet, config)
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
    t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
        makerAfter.balance), 'replay does not pay the fee recipient twice');
    t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status,
        escrowEntryUtils.Status.CLAIMED, 'replay does not change escrow status');
    t.ok(b4a.equals((await readClaimRecord(validatorPeer.base, claimPayload)).value,
        claimPayload), 'claim history remains intact');
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

test('State.apply HTLC_CLAIM distinguishes hashing failures from transaction and signature errors', async t => {
    for (const {label, modify, hashMessage, expectedLog} of [
        {
            label: 'claim hash failure',
            hashMessage: operation => createMessage(config.networkId, operation.hco.txv,
                operation.hco.li, operation.hco.pi, operation.hco.in, OperationType.HTLC_CLAIM),
            expectedLog: 'Failed to hash claim message.'
        },
        {
            label: 'claim hash mismatch',
            modify: operation => { operation.hco.tx[0] ^= 1; },
            expectedLog: 'Claim transaction hash is invalid.'
        },
        {
            label: 'claim submitter signature',
            modify: operation => { operation.hco.is[0] ^= 1; },
            expectedLog: 'Claim submitter signature is invalid.'
        },
        {
            label: 'validator hash failure',
            hashMessage: operation => createMessage(config.networkId, operation.hco.tx,
                operation.hco.vn, OperationType.HTLC_CLAIM),
            expectedLog: 'Failed to hash validator message.'
        }
    ]) {
        const context = await setupHtlcLockScenario(t);
        const {validatorPeer, claimantPeer} = context.htlcLockScenario;
        const lockPayload = await buildHtlcLockPayload(context);
        await appendHtlcLock(context, lockPayload);
        const operation = safeDecodeApplyOperation(await buildClaimPayload(context, lockPayload));
        modify?.(operation);
        const payload = safeEncodeApplyOperation(operation);
        const targetMessage = hashMessage?.(operation);
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
            await appendHtlcLock(context, payload);
        } finally {
            tracCryptoApi.hash.blake3Safe = originalHash;
            console.error = originalConsoleError;
        }

        t.ok(logs.some(log => log.includes(expectedLog)), `${label}: expected error is logged`);
        t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status,
            escrowEntryUtils.Status.PENDING, `${label}: escrow stays pending`);
        t.is(await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address), null,
            `${label}: claimant receives nothing`);
        t.is(await readClaimRecord(validatorPeer.base, payload), null, `${label}: claim is not recorded`);
    }
});

test('State.apply HTLC_CLAIM distinguishes invalid submitter addresses from public keys', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, claimantPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const claim = safeDecodeApplyOperation(await buildClaimPayload(context, lockPayload));

    for (const [address, expectedLog] of [
        [b4a.alloc(config.addressLength, 0x78), 'Submitter address is invalid.'],
        [b4a.from(tracCryptoApi.address.encode(config.addressPrefix, b4a.alloc(32)), 'ascii'),
            'Submitter public key is invalid.'],
    ]) {
        const payload = safeEncodeApplyOperation({...claim, address});
        const originalConsoleError = console.error;
        const logs = [];
        console.error = (...args) => logs.push(args.join(' '));
        try {
            await appendHtlcLock(context, payload);
        } finally {
            console.error = originalConsoleError;
        }

        t.ok(logs.some(log => log.includes(expectedLog)), `expected apply log "${expectedLog}" was emitted`);
        t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.PENDING);
        t.is(await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address), null);
        t.is(await readClaimRecord(validatorPeer.base, payload), null);
    }
});

test('State.apply HTLC_CLAIM rejects missing and invalid validator metadata', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, claimantPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const claim = safeDecodeApplyOperation(await buildClaimPayload(context, lockPayload, {wallet: claimantPeer.wallet}));

    for (const modify of [
        operation => { delete operation.hco.va; delete operation.hco.vn; delete operation.hco.vs; },
        operation => { operation.hco.vs = b4a.alloc(operation.hco.vs.length, 0xaa); },
        operation => { operation.hco.va = operation.address; },
    ]) {
        const invalidClaim = {...claim, hco: {...claim.hco}};
        modify(invalidClaim);
        await appendHtlcLock(context, safeEncodeApplyOperation(invalidClaim));
        t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.PENDING);
        t.is(await readClaimRecord(validatorPeer.base, safeEncodeApplyOperation(invalidClaim)), null);
    }
});

test('State.apply HTLC_CLAIM requires the validator signer to own the publishing writer key', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, claimantPeer, makerPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const claimPayload = await buildClaimPayload(context, lockPayload, {
        wallet: makerPeer.wallet,
        validatorWallet: claimantPeer.wallet
    });

    await appendHtlcLock(context, claimPayload);

    t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.PENDING);
    t.is(await readClaimRecord(validatorPeer.base, claimPayload), null);
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

test('State.apply HTLC_CLAIM settles at most once across separate batches', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer, claimantPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context, {feeRecipient: makerPeer.wallet.address});
    await appendHtlcLock(context, lockPayload);
    const first = await buildClaimPayload(context, lockPayload);
    const second = await buildClaimPayload(context, lockPayload);

    await appendHtlcLock(context, first);
    const claimantAfterFirst = await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address);
    const makerAfterFirst = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    await appendHtlcLock(context, second);

    t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address)).balance,
        claimantAfterFirst.balance), 'claimant is paid once');
    t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
        makerAfterFirst.balance), 'fee recipient is paid once');
    t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.CLAIMED);
    t.ok(await readClaimRecord(validatorPeer.base, first));
    t.is(await readClaimRecord(validatorPeer.base, second), null);
});

test('State.apply HTLC_CLAIM rejects a second validator claiming the same escrow', async t => {
    const context = await setupHtlcLockScenario(t, {nodes: 5});
    const {validatorPeer, makerPeer, claimantPeer} = context.htlcLockScenario;
    const secondaryValidator = context.peers[3];
    context.addWriterScenario = {writerInitialBalance: DEFAULT_INITIAL_BALANCE};
    await initializeBalances(context, [[secondaryValidator.wallet.address, DEFAULT_INITIAL_BALANCE]]);
    await whitelistAddress(context, secondaryValidator.wallet.address);
    await promotePeerToWriter(t, context, {
        readerPeer: secondaryValidator,
        validatorPeer,
        expectedWriterIndex: 1,
    });
    await context.sync();

    const lockPayload = await buildHtlcLockPayload(context, {feeRecipient: makerPeer.wallet.address});
    await appendHtlcLock(context, lockPayload);
    await context.sync();
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
    const first = await buildClaimPayload(context, lockPayload);
    const second = await buildClaimPayload(context, lockPayload, {
        validatorWallet: secondaryValidator.wallet,
    });

    await validatorPeer.base.append(first);
    await validatorPeer.base.update();
    await eventFlush();
    await context.sync();
    await secondaryValidator.base.append(second);
    await secondaryValidator.base.update();
    await eventFlush();
    await context.sync();

    for (const peer of [validatorPeer, secondaryValidator, makerPeer]) {
        const escrow = (await readLockState(peer.base, lockPayload)).escrow;
        const claimant = await readNodeEntry(peer.base, claimantPeer.wallet.address);
        const maker = await readNodeEntry(peer.base, makerPeer.wallet.address);
        t.is(escrow.status, escrowEntryUtils.Status.CLAIMED, 'peers agree on claimed status');
        t.ok(b4a.equals(claimant.balance, DEFAULT_PRINCIPAL), 'principal is paid once');
        t.ok(b4a.equals(maker.balance, toBalance(makerBefore.balance).add(toBalance(DEFAULT_SURCHARGE)).value),
            'fee is paid once');
        t.ok(await readClaimRecord(peer.base, first), 'first claim is recorded');
        t.is(await readClaimRecord(peer.base, second), null, 'second claim is not recorded');
    }
});

test('State.apply HTLC_CLAIM rejects validator self-validation', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, claimantPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const claimPayload = await buildClaimPayload(context, lockPayload, {wallet: validatorPeer.wallet});

    await appendHtlcLock(context, claimPayload);

    t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.PENDING);
    t.is(await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address), null);
    t.is(await readClaimRecord(validatorPeer.base, claimPayload), null);
});

test('State.apply HTLC_CLAIM rejects matching submitter and validator nonces or signatures', async t => {
    for (const field of ['vn', 'vs']) {
        const context = await setupHtlcLockScenario(t);
        const {validatorPeer, claimantPeer} = context.htlcLockScenario;
        const lockPayload = await buildHtlcLockPayload(context);
        await appendHtlcLock(context, lockPayload);
        const claim = safeDecodeApplyOperation(await buildClaimPayload(context, lockPayload));
        claim.hco[field] = b4a.from(claim.hco[field === 'vn' ? 'in' : 'is']);
        const payload = safeEncodeApplyOperation(claim);

        await appendHtlcLock(context, payload);

        t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status,
            escrowEntryUtils.Status.PENDING, `${field} mismatch does not settle`);
        t.is(await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address), null);
        t.is(await readClaimRecord(validatorPeer.base, payload), null);
    }
});

test('State.apply HTLC_CLAIM preserves an existing combined recipient account', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, claimantPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    await initializeBalances(context, [[claimantPeer.wallet.address, $TNK(5n)]]);
    const before = await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address);

    await appendHtlcLock(context, await buildClaimPayload(context, lockPayload));

    const after = await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address);
    const payout = toBalance(DEFAULT_PRINCIPAL).add(toBalance(DEFAULT_SURCHARGE));
    t.ok(b4a.equals(after.balance, toBalance(before.balance).add(payout).value));
    t.ok(b4a.equals(after.wk, before.wk), 'writer key is preserved');
    t.ok(b4a.equals(after.license, before.license), 'license is preserved');
    t.ok(b4a.equals(after.stakedBalance, before.stakedBalance), 'stake is preserved');
    t.is(after.isWriter, before.isWriter, 'writer role is preserved');
    t.is(after.isIndexer, before.isIndexer, 'indexer role is preserved');
});

test('State.apply HTLC_CLAIM rejects missing and corrupt escrow without payout', async t => {
    for (const escrowOverride of [null, b4a.from([1])]) {
        const context = await setupHtlcLockScenario(t);
        const {validatorPeer, claimantPeer} = context.htlcLockScenario;
        const lockPayload = await buildHtlcLockPayload(context);
        await appendHtlcLock(context, lockPayload);
        const claimPayload = await buildClaimPayload(context, lockPayload);
        const escrowKey = EntryType.HTLC_ESCROW + b4a.toString(decodeHtlcLockPayload(lockPayload).hlo.tx, 'hex');

        await applyWithEntryOverrides(context, claimPayload, new Map([[escrowKey, escrowOverride]]));

        t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status,
            escrowEntryUtils.Status.PENDING);
        t.is(await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address), null);
        t.is(await readClaimRecord(validatorPeer.base, claimPayload), null);
    }
});

test('State.apply HTLC_CLAIM rejects stale transaction validity and invalid epoch state', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, claimantPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context);
    await appendHtlcLock(context, lockPayload);
    const staleClaim = await buildClaimPayload(context, lockPayload, {txValidity: b4a.alloc(32, 0x7f)});
    const invalidEpochClaim = await buildClaimPayload(context, lockPayload);

    await appendHtlcLock(context, staleClaim);
    await applyWithEntryOverrides(context, invalidEpochClaim, new Map([[EntryType.EPOCH_CURRENT, null]]));

    t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status,
        escrowEntryUtils.Status.PENDING);
    t.is(await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address), null);
    t.is(await readClaimRecord(validatorPeer.base, staleClaim), null);
    t.is(await readClaimRecord(validatorPeer.base, invalidEpochClaim), null);
});

test('State.apply HTLC_CLAIM rejects either payout overflow without partial settlement', async t => {
    const maxBalance = (1n << 128n) - 1n;
    for (const overflowRecipient of ['claimant', 'fee recipient']) {
        const context = await setupHtlcLockScenario(t);
        const {validatorPeer, makerPeer, claimantPeer} = context.htlcLockScenario;
        const lockPayload = await buildHtlcLockPayload(context, {feeRecipient: makerPeer.wallet.address});
        await appendHtlcLock(context, lockPayload);
        const claimPayload = await buildClaimPayload(context, lockPayload);
        const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);
        const recipient = overflowRecipient === 'claimant' ? claimantPeer.wallet.address : makerPeer.wallet.address;
        const nearMax = nodeEntryUtils.init(
            ZERO_WK,
            nodeRoleUtils.NodeRole.READER,
            bigIntToBuffer(maxBalance)
        );

        await applyWithEntryOverrides(context, claimPayload, new Map([[recipient, nearMax]]));

        t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status,
            escrowEntryUtils.Status.PENDING, `${overflowRecipient} overflow leaves escrow pending`);
        t.is(await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address), null,
            `${overflowRecipient} overflow does not pay claimant`);
        t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
            makerBefore.balance), `${overflowRecipient} overflow does not pay fee recipient`);
        t.is(await readClaimRecord(validatorPeer.base, claimPayload), null,
            `${overflowRecipient} overflow does not record claim`);
    }
});

test('State.apply HTLC_CLAIM rejects a corrupted second recipient without paying the first', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, makerPeer, claimantPeer} = context.htlcLockScenario;
    const lockPayload = await buildHtlcLockPayload(context, {feeRecipient: makerPeer.wallet.address});
    await appendHtlcLock(context, lockPayload);
    const claimPayload = await buildClaimPayload(context, lockPayload);
    const makerBefore = await readNodeEntry(validatorPeer.base, makerPeer.wallet.address);

    await applyWithEntryOverrides(context, claimPayload,
        new Map([[makerPeer.wallet.address, b4a.from([1])]]));

    t.is(await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address), null);
    t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, makerPeer.wallet.address)).balance,
        makerBefore.balance));
    t.is((await readLockState(validatorPeer.base, lockPayload)).escrow.status, escrowEntryUtils.Status.PENDING);
    t.is(await readClaimRecord(validatorPeer.base, claimPayload), null);
});

test('State.apply HTLC_CLAIM adds two escrow payouts to one account in a batch', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer, claimantPeer} = context.htlcLockScenario;
    const firstLock = await buildHtlcLockPayload(context);
    const secondLock = await buildHtlcLockPayload(context);
    await appendHtlcLockBatch(context, [firstLock, secondLock]);
    const firstClaim = await buildClaimPayload(context, firstLock);
    const secondClaim = await buildClaimPayload(context, secondLock);

    await appendHtlcLockBatch(context, [firstClaim, secondClaim]);

    const onePayout = toBalance(DEFAULT_PRINCIPAL).add(toBalance(DEFAULT_SURCHARGE));
    const twoPayouts = onePayout.add(onePayout);
    t.ok(b4a.equals((await readNodeEntry(validatorPeer.base, claimantPeer.wallet.address)).balance,
        twoPayouts.value), 'both payouts accumulate');
    t.ok(await readClaimRecord(validatorPeer.base, firstClaim));
    t.ok(await readClaimRecord(validatorPeer.base, secondClaim));
    t.is((await readLockState(validatorPeer.base, firstLock)).escrow.status, escrowEntryUtils.Status.CLAIMED);
    t.is((await readLockState(validatorPeer.base, secondLock)).escrow.status, escrowEntryUtils.Status.CLAIMED);
});

test('State.apply HTLC_CLAIM preserves metadata and its omission through settlement and replay', async t => {
    const context = await setupHtlcLockScenario(t);
    const {validatorPeer} = context.htlcLockScenario;
    for (const metadata of [undefined, b4a.alloc(1), b4a.alloc(1024, 0xff)]) {
        const lockPayload = await buildHtlcLockPayload(context, {metadata});
        await appendHtlcLock(context, lockPayload);
        const claimPayload = await buildClaimPayload(context, lockPayload);
        await appendHtlcLock(context, claimPayload);
        const settled = await readLockState(validatorPeer.base, lockPayload);
        t.is(settled.escrow.status, escrowEntryUtils.Status.CLAIMED);
        if (metadata === undefined) t.is(settled.escrow.metadata, null, 'claim preserves omission');
        else t.ok(b4a.equals(settled.escrow.metadata, metadata), 'claim preserves metadata bytes');
        t.ok(b4a.equals(settled.operation.value, lockPayload), 'original lock history is unchanged');

        await appendHtlcLock(context, claimPayload);
        const replayed = await readLockState(validatorPeer.base, lockPayload);
        t.ok(b4a.equals(replayed.escrowRecord.value, settled.escrowRecord.value), 'replay preserves the complete escrow');
    }
});
