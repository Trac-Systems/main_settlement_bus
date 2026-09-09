import {test} from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';

import {
    BALANCE_BYTE_LENGTH,
    EPOCH_BYTE_LENGTH,
    HASH_BYTE_LENGTH,
    HTLC_LOCK_ID_BYTE_LENGTH,
    HTLC_PREIMAGE_BYTE_LENGTH,
    NONCE_BYTE_LENGTH,
    PUBLIC_KEY_LENGTH,
} from '../../../../src/utils/constants.js';
import {bigIntToBuffer, NULL_BUFFER, uint64ToBuffer} from '../../../../src/utils/buffer.js';
import {
    decode,
    ESCROW_ENTRY_SIZE,
    ESCROW_ENTRY_VERSION,
    Status,
    init,
    makeClaim,
    makeRefund,
} from '../../../../src/core/state/utils/escrowEntry.js';
import {randomBuffer} from '../stateTestUtils.js';

function makeInputs() {
    const preimage = randomBuffer(HTLC_PREIMAGE_BYTE_LENGTH);
    return {
        lockId: randomBuffer(HTLC_LOCK_ID_BYTE_LENGTH),
        locker: randomBuffer(PUBLIC_KEY_LENGTH),
        claimRecipient: randomBuffer(PUBLIC_KEY_LENGTH),
        refundRecipient: randomBuffer(PUBLIC_KEY_LENGTH),
        amount: bigIntToBuffer(100n, BALANCE_BYTE_LENGTH),
        feeAmount: bigIntToBuffer(5n, BALANCE_BYTE_LENGTH),
        feeRecipient: randomBuffer(PUBLIC_KEY_LENGTH),
        nonce: randomBuffer(NONCE_BYTE_LENGTH),
        hashLock: tracCryptoApi.hash.sha256(preimage),
        refundEpoch: uint64ToBuffer(100),
        counterpartyHash: randomBuffer(HASH_BYTE_LENGTH),
        policyHash: randomBuffer(HASH_BYTE_LENGTH),
        preimage,
    };
}

test('Escrow Entry - init and decode preserve all settlement fields', t => {
    const inputs = makeInputs();
    const entry = init(inputs);
    const decoded = decode(entry);

    t.is(entry.length, ESCROW_ENTRY_SIZE);
    t.is(decoded.version, ESCROW_ENTRY_VERSION);
    t.is(decoded.status, Status.PENDING);
    for (const field of [
        'lockId', 'locker', 'claimRecipient', 'refundRecipient', 'amount', 'feeAmount',
        'feeRecipient', 'nonce', 'hashLock', 'refundEpoch', 'counterpartyHash', 'policyHash'
    ]) {
        t.ok(b4a.equals(decoded[field], inputs[field]), `${field} matches`);
    }
    t.is(decoded.preimage, null, 'preimage remains hidden until claim');
});

test('Escrow Entry - fee and policy fields have canonical empty representations', t => {
    const inputs = makeInputs();
    inputs.feeAmount = b4a.alloc(BALANCE_BYTE_LENGTH);
    delete inputs.feeRecipient;
    delete inputs.policyHash;

    const decoded = decode(init(inputs));
    t.ok(decoded);
    t.is(decoded.feeRecipient, null);
    t.is(decoded.policyHash, null);
});

test('Escrow Entry - init rejects invalid required fields and fee combinations', t => {
    const inputs = makeInputs();
    const fieldSizes = {
        lockId: HTLC_LOCK_ID_BYTE_LENGTH,
        locker: PUBLIC_KEY_LENGTH,
        claimRecipient: PUBLIC_KEY_LENGTH,
        refundRecipient: PUBLIC_KEY_LENGTH,
        amount: BALANCE_BYTE_LENGTH,
        feeAmount: BALANCE_BYTE_LENGTH,
        nonce: NONCE_BYTE_LENGTH,
        hashLock: HASH_BYTE_LENGTH,
        refundEpoch: EPOCH_BYTE_LENGTH,
        counterpartyHash: HASH_BYTE_LENGTH,
    };

    for (const [field, size] of Object.entries(fieldSizes)) {
        const entry = init({...inputs, [field]: randomBuffer(size - 1)});
        t.ok(b4a.equals(entry, NULL_BUFFER), `${field} rejects an invalid buffer`);
    }

    t.ok(b4a.equals(init({...inputs, amount: b4a.alloc(BALANCE_BYTE_LENGTH)}), NULL_BUFFER));

    const missingFeeRecipient = {...inputs};
    delete missingFeeRecipient.feeRecipient;
    t.ok(b4a.equals(init(missingFeeRecipient), NULL_BUFFER));

    t.ok(b4a.equals(init({
        ...inputs,
        feeAmount: b4a.alloc(BALANCE_BYTE_LENGTH)
    }), NULL_BUFFER), 'zero fee rejects a fee recipient');
});

test('Escrow Entry - claim pays stored recipients and records the preimage before expiry', t => {
    const inputs = makeInputs();
    const entry = init(inputs);
    const result = makeClaim(entry, inputs.preimage, uint64ToBuffer(99));
    const claimed = decode(result.entry);

    t.ok(b4a.equals(result.publicKey, inputs.claimRecipient));
    t.ok(b4a.equals(result.amount.value, inputs.amount));
    t.ok(b4a.equals(result.feePublicKey, inputs.feeRecipient));
    t.ok(b4a.equals(result.feeAmount.value, inputs.feeAmount));
    t.is(claimed.status, Status.CLAIMED);
    t.ok(b4a.equals(claimed.preimage, inputs.preimage));
    t.is(decode(entry).status, Status.PENDING, 'input entry is not mutated');
    t.is(makeClaim(result.entry, inputs.preimage, uint64ToBuffer(99)), null, 'claim is one-shot');
    t.is(makeRefund(result.entry, uint64ToBuffer(100)), null, 'claimed lock cannot be refunded');
});

test('Escrow Entry - claim enforces the hashlock and exclusive claim window', t => {
    const inputs = makeInputs();
    const entry = init(inputs);

    t.is(makeClaim(entry, randomBuffer(HASH_BYTE_LENGTH), uint64ToBuffer(99)), null);
    t.is(makeClaim(entry, inputs.preimage, uint64ToBuffer(100)), null);
    t.is(makeClaim(entry, inputs.preimage, uint64ToBuffer(101)), null);
});

test('Escrow Entry - refund returns principal and surcharge at or after expiry', t => {
    const inputs = makeInputs();
    const entry = init(inputs);

    t.is(makeRefund(entry, uint64ToBuffer(99)), null);

    const result = makeRefund(entry, uint64ToBuffer(100));
    t.ok(b4a.equals(result.publicKey, inputs.refundRecipient));
    t.is(result.amount.asBigInt(), 105n);
    t.is(decode(result.entry).status, Status.REFUNDED);
    t.is(decode(entry).status, Status.PENDING, 'input entry is not mutated');
    t.is(makeRefund(result.entry, uint64ToBuffer(101)), null, 'refund is one-shot');
    t.is(makeClaim(result.entry, inputs.preimage, uint64ToBuffer(99)), null, 'refunded lock cannot be claimed');
});

test('Escrow Entry - decode and settlement reject malformed entries', t => {
    const inputs = makeInputs();
    const wrongVersion = init(inputs);
    wrongVersion[0] = ESCROW_ENTRY_VERSION + 1;

    t.is(decode(randomBuffer(ESCROW_ENTRY_SIZE - 1)), null);
    t.is(decode(wrongVersion), null);
    t.is(makeClaim(null, inputs.preimage, uint64ToBuffer(99)), null);
    t.is(makeRefund(init(inputs), b4a.alloc(EPOCH_BYTE_LENGTH - 1)), null);
});
