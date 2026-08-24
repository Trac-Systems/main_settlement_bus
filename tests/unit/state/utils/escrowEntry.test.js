import { test } from 'brittle';
import b4a from 'b4a';
import { BALANCE_BYTE_LENGTH, EPOCH_BYTE_LENGTH } from '../../../../src/utils/constants.js';
import { TRAC_HASH_SIZE, TRAC_PUB_KEY_SIZE } from 'trac-crypto-api/constants.js';
import { NULL_BUFFER } from '../../../../src/utils/buffer.js';
import { ESCROW_ENTRY_SIZE, Status, init, makeClaim, makeRefund } from '../../../../src/core/state/utils/escrowEntry.js';
import { TEN_THOUSAND_VALUE, randomBuffer } from '../stateTestUtils.js';

const makeInputs = () => ({
    id: randomBuffer(TRAC_HASH_SIZE), maker: randomBuffer(TRAC_PUB_KEY_SIZE), taker: randomBuffer(TRAC_PUB_KEY_SIZE),
    lock: randomBuffer(TRAC_HASH_SIZE), nonce: randomBuffer(TRAC_HASH_SIZE), expiryEpoch: randomBuffer(EPOCH_BYTE_LENGTH), amount: TEN_THOUSAND_VALUE,
});

test('Escrow Entry - init encodes all fields and starts pending', t => {
    const inputs = makeInputs();
    const entry = init(inputs.id, inputs.maker, inputs.taker, inputs.lock, inputs.nonce, inputs.expiryEpoch, inputs.amount);
    t.is(entry.length, ESCROW_ENTRY_SIZE, 'entry has the expected size');
    t.ok(b4a.equals(entry.subarray(0, BALANCE_BYTE_LENGTH), inputs.amount), 'amount matches');
    let offset = BALANCE_BYTE_LENGTH;
    t.ok(b4a.equals(entry.subarray(offset, offset += TRAC_PUB_KEY_SIZE), inputs.maker), 'maker matches');
    t.ok(b4a.equals(entry.subarray(offset, offset += TRAC_PUB_KEY_SIZE), inputs.taker), 'taker matches');
    t.ok(b4a.equals(entry.subarray(offset, offset += TRAC_PUB_KEY_SIZE), inputs.maker), 'refund key matches maker');
    t.ok(b4a.equals(entry.subarray(offset, offset += TRAC_HASH_SIZE), inputs.id), 'id matches');
    t.ok(b4a.equals(entry.subarray(offset, offset += TRAC_HASH_SIZE), inputs.nonce), 'nonce matches');
    t.ok(b4a.equals(entry.subarray(offset, offset += TRAC_HASH_SIZE), inputs.lock), 'lock matches');
    t.ok(b4a.equals(entry.subarray(offset, offset + EPOCH_BYTE_LENGTH), inputs.expiryEpoch), 'expiry epoch matches');
    t.is(entry[ESCROW_ENTRY_SIZE - 1], Status.PENDING, 'status is pending');
});

test('Escrow Entry - init rejects invalid field sizes', t => {
    const inputs = makeInputs();
    const invalidFields = [['amount', BALANCE_BYTE_LENGTH], ['maker', TRAC_PUB_KEY_SIZE], ['taker', TRAC_PUB_KEY_SIZE], ['id', TRAC_HASH_SIZE], ['nonce', TRAC_HASH_SIZE], ['lock', TRAC_HASH_SIZE], ['expiryEpoch', EPOCH_BYTE_LENGTH]];
    for (const [field, size] of invalidFields) {
        const invalidInputs = { ...inputs, [field]: randomBuffer(size - 1) };
        const entry = init(invalidInputs.id, invalidInputs.maker, invalidInputs.taker, invalidInputs.lock, invalidInputs.nonce, invalidInputs.expiryEpoch, invalidInputs.amount);
        t.ok(b4a.equals(entry, NULL_BUFFER), `${field} rejects an invalid buffer`);
    }
});

test('Escrow Entry - makeClaim pays the taker and clears the amount', t => {
    const inputs = makeInputs();
    const entry = init(inputs.id, inputs.maker, inputs.taker, inputs.lock, inputs.nonce, inputs.expiryEpoch, inputs.amount);
    const result = makeClaim(entry);
    t.ok(b4a.equals(result.publicKey, inputs.taker), 'claim recipient is the taker');
    t.ok(b4a.equals(result.amount.value, inputs.amount), 'claimed amount matches');
    t.ok(b4a.equals(entry.subarray(0, BALANCE_BYTE_LENGTH), b4a.alloc(BALANCE_BYTE_LENGTH)), 'amount is cleared');
    t.is(entry[ESCROW_ENTRY_SIZE - 1], Status.CLAIMED, 'status is claimed');
    t.is(result.entry, entry, 'settlement updates the original entry');
});

test('Escrow Entry - makeRefund pays the maker and clears the amount', t => {
    const inputs = makeInputs();
    const entry = init(inputs.id, inputs.maker, inputs.taker, inputs.lock, inputs.nonce, inputs.expiryEpoch, inputs.amount);
    const result = makeRefund(entry);
    t.ok(b4a.equals(result.publicKey, inputs.maker), 'refund recipient is the maker');
    t.ok(b4a.equals(result.amount.value, inputs.amount), 'refunded amount matches');
    t.is(entry[ESCROW_ENTRY_SIZE - 1], Status.REFUNDED, 'status is refunded');
});

test('Escrow Entry - settlement rejects invalid entries', t => {
    t.is(makeClaim(randomBuffer(ESCROW_ENTRY_SIZE - 1)), null, 'claim rejects invalid entry');
    t.is(makeRefund(null), null, 'refund rejects non-buffer entry');
});
