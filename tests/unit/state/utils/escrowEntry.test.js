import {test} from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import stateGenerated from '../../../../src/codecs/state/state.generated.cjs';

import {
    BALANCE_BYTE_LENGTH,
    EPOCH_BYTE_LENGTH,
    HASH_BYTE_LENGTH,
    HTLC_LOCK_ID_BYTE_LENGTH,
    HTLC_PREIMAGE_BYTE_LENGTH,
    PUBLIC_KEY_LENGTH,
} from '../../../../src/utils/constants.js';
import {bigIntToBuffer, NULL_BUFFER, uint64ToBuffer} from '../../../../src/utils/buffer.js';
import {
    decode as decodeEntry,
    ESCROW_ENTRY_VERSION,
    Status,
    init as initEntry,
    makeClaim as claimEntry,
    makeRefund as refundEntry,
} from '../../../../src/core/state/utils/escrowEntry.js';
import {randomBuffer} from '../stateTestUtils.js';
import {config} from '../../../helpers/config.js';
import {escrowPreimage, validEscrowEntry} from '../../../fixtures/escrowEntry.fixtures.js';
import applyOperationFixtures from '../../../fixtures/applyOperation.fixtures.js';

const {EscrowEntry} = stateGenerated.state;
const init = inputs => initEntry(inputs, config.addressPrefix);
const decode = entry => decodeEntry(entry, config.addressPrefix);
const makeClaim = (entry, preimage, currentEpoch) => claimEntry(entry, preimage, currentEpoch, config.addressPrefix);
const makeRefund = (entry, currentEpoch) => refundEntry(entry, currentEpoch, config.addressPrefix);

function encodeStoredEntry(inputs, overrides = {}) {
    return b4a.from(EscrowEntry.encode({
        ...inputs,
        version: ESCROW_ENTRY_VERSION,
        status: Status.PENDING,
        preimage: undefined,
        ...overrides
    }).finish());
}

function makeInputs() {
    return {
        ...Object.fromEntries(Object.entries(validEscrowEntry)
            .map(([field, value]) => [field, b4a.isBuffer(value) ? b4a.from(value) : value])),
        preimage: b4a.from(escrowPreimage),
    };
}

test('Escrow Entry - init and decode preserve all settlement fields', t => {
    const inputs = makeInputs();
    const entry = init(inputs);
    const decoded = decode(entry);

    t.ok(b4a.isBuffer(entry));
    t.ok(b4a.equals(entry, encodeStoredEntry(inputs)), 'storage uses the generated protobuf encoder');
    t.is(EscrowEntry.decode(entry).version, ESCROW_ENTRY_VERSION);
    t.is(decoded.version, ESCROW_ENTRY_VERSION);
    t.is(decoded.status, Status.PENDING);
    for (const field of [
        'lockId', 'lockerAddress', 'claimRecipientAddress', 'refundRecipientAddress', 'amount', 'additionalFeeAmount',
        'additionalFeeRecipientAddress', 'hashLock', 'refundEpoch', 'metadata'
    ]) {
        t.ok(b4a.equals(decoded[field], inputs[field]), `${field} matches`);
    }
    t.is(decoded.preimage, null, 'preimage remains hidden until claim');
    const stored = EscrowEntry.decode(entry);
    for (const field of ['nonce', 'ss', 'th']) {
        t.absent(Object.prototype.hasOwnProperty.call(stored, field), `${field} remains in the lock transaction`);
    }
});

test('Escrow Entry - validates canonical recipient addresses instead of public keys', t => {
    const inputs = makeInputs();
    for (const field of ['lockerAddress', 'claimRecipientAddress', 'refundRecipientAddress', 'additionalFeeRecipientAddress']) {
        const original = inputs[field];
        const badChecksum = b4a.from(original);
        badChecksum[badChecksum.length - 1] = badChecksum[badChecksum.length - 1] === 0x71 ? 0x70 : 0x71;
        const publicKey = tracCryptoApi.address.decodeSafe(b4a.toString(original, 'ascii'));
        const wrongNetwork = b4a.from(tracCryptoApi.address.encode('other', publicKey), 'ascii');
        const zeroKeyAddress = b4a.from(tracCryptoApi.address.encode(config.addressPrefix, b4a.alloc(PUBLIC_KEY_LENGTH)), 'ascii');

        for (const invalid of [publicKey, badChecksum, wrongNetwork, zeroKeyAddress]) {
            t.alike(init({...inputs, [field]: invalid}), NULL_BUFFER, `${field} rejects invalid address bytes`);
            t.is(decode(encodeStoredEntry(inputs, {[field]: invalid})), null, `${field} is checked when decoding stored data`);
        }
    }
});

test('Escrow Entry - rejects high-bit address aliases', t => {
    const inputs = makeInputs();
    for (const field of ['lockerAddress', 'claimRecipientAddress', 'refundRecipientAddress', 'additionalFeeRecipientAddress']) {
        const highBitAlias = b4a.from(inputs[field]);
        highBitAlias[0] |= 0x80;
        t.alike(init({...inputs, [field]: highBitAlias}), NULL_BUFFER, `${field} rejects high-bit alias`);
        t.is(decode(encodeStoredEntry(inputs, {[field]: highBitAlias})), null, `${field} rejects stored high-bit alias`);
    }
});

test.skip('Escrow Entry - accepts typed address bytes', t => {
    const inputs = makeInputs();
    const typedInputs = Object.fromEntries(Object.entries(inputs)
        .map(([field, value]) => [field, b4a.isBuffer(value) ? new Uint8Array(value) : value]));
    const entry = init(typedInputs);
    t.alike(entry, init(inputs));
    t.alike(decode(entry).claimRecipientAddress, inputs.claimRecipientAddress);
});

test('Escrow Entry - requires the configured network prefix', t => {
    const inputs = makeInputs();
    const entry = init(inputs);
    t.ok(entry.length > 0);
    t.alike(initEntry(inputs, 'other'), NULL_BUFFER);
    t.is(decodeEntry(entry, 'other'), null);
    t.alike(initEntry(inputs), NULL_BUFFER, 'the caller must provide the network prefix');
    t.is(decodeEntry(entry), null);
});

test('Escrow Entry - fee and metadata fields have canonical empty representations', t => {
    const inputs = makeInputs();
    inputs.additionalFeeAmount = b4a.alloc(BALANCE_BYTE_LENGTH);
    delete inputs.additionalFeeRecipientAddress;
    delete inputs.metadata;

    const entry = init(inputs);
    const decoded = decode(entry);
    const stored = EscrowEntry.decode(entry);
    t.ok(decoded);
    t.is(decoded.additionalFeeRecipientAddress, null);
    t.is(decoded.metadata, null);
    for (const field of ['additionalFeeRecipientAddress', 'metadata', 'preimage']) {
        t.absent(Object.prototype.hasOwnProperty.call(stored, field), `${field} is omitted rather than zero-padded`);
    }

    const claimed = makeClaim(entry, inputs.preimage, uint64ToBuffer(99));
    t.is(claimed.additionalFeeRecipientAddress, null);
    t.is(claimed.additionalFeeAmount.asBigInt(), 0n);
    t.is(decode(claimed.claimedEscrowEntry).metadata, null);

    const refunded = makeRefund(entry, uint64ToBuffer(100));
    t.is(refunded.amount.asBigInt(), 100n);
    t.is(decode(refunded.refundedEscrowEntry).additionalFeeRecipientAddress, null);
});

test('Escrow Entry - protobuf encoding is deterministic and variable-length', t => {
    const inputs = makeInputs();
    const entry = init(inputs);
    t.ok(b4a.equals(entry, init(inputs)), 'the same input produces identical stored bytes');
    t.ok(b4a.equals(entry, init(Object.fromEntries(Object.entries(inputs).reverse()))), 'object property order does not change encoding');

    const feeFreeEntry = init({...inputs, additionalFeeAmount: b4a.alloc(BALANCE_BYTE_LENGTH), additionalFeeRecipientAddress: undefined, metadata: undefined});
    t.ok(feeFreeEntry.length < entry.length, 'omitted optional fields reduce storage size');

    const claimed = makeClaim(entry, inputs.preimage, uint64ToBuffer(99));
    t.ok(claimed.claimedEscrowEntry.length > entry.length, 'claimed storage includes the revealed preimage');
});

test('Escrow Entry - decoded byte fields are independent of the stored input', t => {
    const inputs = makeInputs();
    const entry = init(inputs);
    const original = b4a.from(entry);
    const decoded = decode(new Uint8Array(entry));
    t.ok(decoded);
    t.ok(b4a.isBuffer(decoded.amount));
    t.ok(b4a.equals(decoded.lockId, inputs.lockId));

    const bufferDecoded = decode(entry);
    for (const value of Object.values(bufferDecoded)) {
        if (b4a.isBuffer(value)) value.fill(0xff);
    }
    t.ok(b4a.equals(entry, original), 'changing decoded buffers does not mutate stored bytes');
    t.ok(b4a.equals(decode(entry).amount, inputs.amount));
});

test('Escrow Entry - init rejects invalid required fields and fee combinations', t => {
    const inputs = makeInputs();
    const fieldSizes = {
        lockId: HTLC_LOCK_ID_BYTE_LENGTH,
        lockerAddress: config.addressLength,
        claimRecipientAddress: config.addressLength,
        refundRecipientAddress: config.addressLength,
        amount: BALANCE_BYTE_LENGTH,
        additionalFeeAmount: BALANCE_BYTE_LENGTH,
        hashLock: HASH_BYTE_LENGTH,
        refundEpoch: EPOCH_BYTE_LENGTH,
    };

    for (const [field, size] of Object.entries(fieldSizes)) {
        const entry = init({...inputs, [field]: randomBuffer(size - 1)});
        t.ok(b4a.equals(entry, NULL_BUFFER), `${field} rejects an invalid buffer`);
    }

    t.ok(b4a.equals(init({...inputs, amount: b4a.alloc(BALANCE_BYTE_LENGTH)}), NULL_BUFFER));

    const missingFeeRecipient = {...inputs};
    delete missingFeeRecipient.additionalFeeRecipientAddress;
    t.ok(b4a.equals(init(missingFeeRecipient), NULL_BUFFER));

    t.ok(b4a.equals(init({
        ...inputs,
        additionalFeeAmount: b4a.alloc(BALANCE_BYTE_LENGTH)
    }), NULL_BUFFER), 'zero fee rejects a fee recipient');
});

test('Escrow Entry - claim pays stored recipients and records the preimage before expiry', t => {
    const inputs = makeInputs();
    const entry = init(inputs);
    const result = makeClaim(entry, inputs.preimage, uint64ToBuffer(99));
    const claimed = decode(result.claimedEscrowEntry);

    t.ok(b4a.equals(result.address, inputs.claimRecipientAddress));
    t.ok(b4a.equals(result.amount.value, inputs.amount));
    t.ok(b4a.equals(result.additionalFeeRecipientAddress, inputs.additionalFeeRecipientAddress));
    t.ok(b4a.equals(result.additionalFeeAmount.value, inputs.additionalFeeAmount));
    t.is(claimed.status, Status.CLAIMED);
    t.ok(b4a.equals(claimed.preimage, inputs.preimage));
    t.is(decode(entry).status, Status.PENDING, 'input entry is not mutated');
    t.is(makeClaim(result.claimedEscrowEntry, inputs.preimage, uint64ToBuffer(99)), null, 'claim is one-shot');
    t.is(makeRefund(result.claimedEscrowEntry, uint64ToBuffer(100)), null, 'claimed lock cannot be refunded');
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
    t.ok(b4a.equals(result.address, inputs.refundRecipientAddress));
    t.is(result.amount.asBigInt(), 105n);
    t.is(decode(result.refundedEscrowEntry).status, Status.REFUNDED);
    t.is(decode(entry).status, Status.PENDING, 'input entry is not mutated');
    t.is(makeRefund(result.refundedEscrowEntry, uint64ToBuffer(101)), null, 'refund is one-shot');
    t.is(makeClaim(result.refundedEscrowEntry, inputs.preimage, uint64ToBuffer(99)), null, 'refunded lock cannot be claimed');
});

test('Escrow Entry - decode and settlement reject malformed entries', t => {
    const inputs = makeInputs();
    const entry = init(inputs);
    const wrongVersion = encodeStoredEntry(inputs, {version: ESCROW_ENTRY_VERSION + 1});

    for (const invalid of [null, undefined, {}, [], 'escrow', b4a.alloc(0), b4a.from([0xff]), entry.subarray(0, entry.length - 1)]) {
        t.is(decode(invalid), null);
    }
    t.is(decode(wrongVersion), null);
    t.is(makeClaim(null, inputs.preimage, uint64ToBuffer(99)), null);
    t.is(makeRefund(init(inputs), b4a.alloc(EPOCH_BYTE_LENGTH - 1)), null);
});

test('Escrow Entry - decode rejects missing protobuf settlement fields', t => {
    const inputs = makeInputs();
    for (const field of [
        'version', 'status', 'lockId', 'lockerAddress', 'claimRecipientAddress', 'refundRecipientAddress',
        'amount', 'additionalFeeAmount', 'hashLock', 'refundEpoch'
    ]) {
        t.is(decode(encodeStoredEntry(inputs, {[field]: undefined})), null, `${field} must be explicitly stored`);
    }
});

test('Escrow Entry - decode validates protobuf byte widths and non-zero fields', t => {
    const inputs = makeInputs();
    const fieldSizes = {
        lockId: HTLC_LOCK_ID_BYTE_LENGTH,
        lockerAddress: config.addressLength,
        claimRecipientAddress: config.addressLength,
        refundRecipientAddress: config.addressLength,
        amount: BALANCE_BYTE_LENGTH,
        additionalFeeAmount: BALANCE_BYTE_LENGTH,
        hashLock: HASH_BYTE_LENGTH,
        refundEpoch: EPOCH_BYTE_LENGTH,
    };
    for (const [field, size] of Object.entries(fieldSizes)) {
        for (const length of [0, size - 1, size + 1]) {
            t.is(decode(encodeStoredEntry(inputs, {[field]: randomBuffer(length)})), null, `${field} rejects ${length} bytes`);
        }
        if (field !== 'additionalFeeAmount') {
            t.is(decode(encodeStoredEntry(inputs, {[field]: b4a.alloc(size)})), null, `${field} rejects an all-zero value`);
        }
    }
});

test('Escrow Entry - decode validates optional fields and escrow amount overflow', t => {
    const inputs = makeInputs();
    for (const overrides of [
        {additionalFeeRecipientAddress: undefined},
        {additionalFeeRecipientAddress: b4a.alloc(config.addressLength)},
        {additionalFeeRecipientAddress: randomBuffer(config.addressLength - 1)},
        {additionalFeeAmount: b4a.alloc(BALANCE_BYTE_LENGTH)},
        {metadata: b4a.alloc(0)},
        {metadata: b4a.alloc(1025, 1)},
        {amount: b4a.alloc(BALANCE_BYTE_LENGTH, 0xff), additionalFeeAmount: bigIntToBuffer(1n)},
    ]) {
        const entry = encodeStoredEntry(inputs, overrides);
        t.is(decode(entry), null);
        t.is(makeClaim(entry, inputs.preimage, uint64ToBuffer(99)), null);
        t.is(makeRefund(entry, uint64ToBuffer(100)), null);
    }
    t.ok(b4a.equals(init({...inputs, amount: b4a.alloc(BALANCE_BYTE_LENGTH, 0xff), additionalFeeAmount: bigIntToBuffer(1n)}), NULL_BUFFER));
});

test('Escrow Entry - decode enforces stored status and preimage presence', t => {
    const inputs = makeInputs();
    for (const overrides of [
        {status: 99},
        {status: Status.CLAIMED},
        {status: Status.CLAIMED, preimage: randomBuffer(HTLC_PREIMAGE_BYTE_LENGTH - 1)},
        {status: Status.CLAIMED, preimage: b4a.alloc(HTLC_PREIMAGE_BYTE_LENGTH)},
        {status: Status.PENDING, preimage: inputs.preimage},
        {status: Status.REFUNDED, preimage: inputs.preimage},
    ]) {
        t.is(decode(encodeStoredEntry(inputs, overrides)), null);
    }
    t.ok(decode(encodeStoredEntry(inputs, {status: Status.CLAIMED, preimage: inputs.preimage})));
});

test('Escrow Entry - decode rejects the previous draft storage format and version', t => {
    const inputs = makeInputs();
    const publicKeyFor = address => tracCryptoApi.address.decodeSafe(b4a.toString(address, 'ascii'));
    const legacyEntry = b4a.concat([
        b4a.from([1, Status.PENDING]), inputs.amount, inputs.additionalFeeAmount, publicKeyFor(inputs.lockerAddress),
        publicKeyFor(inputs.claimRecipientAddress), publicKeyFor(inputs.refundRecipientAddress), publicKeyFor(inputs.additionalFeeRecipientAddress),
        inputs.lockId, applyOperationFixtures.validHtlcLockOperation.hlo.in, inputs.hashLock, b4a.alloc(HTLC_PREIMAGE_BYTE_LENGTH),
        b4a.alloc(HASH_BYTE_LENGTH, 0x05), inputs.refundEpoch
    ]);
    t.is(decode(legacyEntry), null, 'the old fixed-layout entry is not interpreted as protobuf');
    for (const version of [1, 2]) {
        t.is(decode(encodeStoredEntry(inputs, {version})), null, `draft version ${version} is unsupported`);
    }
});

test('Escrow Entry - metadata survives init, claim and refund unchanged', t => {
    for (const feeIsZero of [false, true]) {
        for (const metadata of [undefined, b4a.alloc(1), b4a.from([0x00, 0xff, 0x80]),
            b4a.alloc(1023, 0xff), b4a.alloc(1024), new Uint8Array(1024).fill(0xff)]) {
            const inputs = {...makeInputs(), metadata};
            if (feeIsZero) {
                inputs.additionalFeeAmount = b4a.alloc(BALANCE_BYTE_LENGTH);
                delete inputs.additionalFeeRecipientAddress;
            }
            const entry = init(inputs);
            const original = b4a.from(entry);
            const claimed = makeClaim(entry, inputs.preimage, uint64ToBuffer(99));
            const refunded = makeRefund(entry, uint64ToBuffer(100));
            t.ok(claimed, 'metadata does not affect claim eligibility');
            t.ok(refunded, 'metadata does not affect refund eligibility');
            for (const [encoded, status] of [[entry, Status.PENDING],
                [claimed.claimedEscrowEntry, Status.CLAIMED], [refunded.refundedEscrowEntry, Status.REFUNDED]]) {
                const decoded = decode(encoded);
                t.is(decoded.status, status);
                t.is(Object.hasOwn(EscrowEntry.decode(encoded), 'metadata'), metadata !== undefined,
                    'metadata presence survives settlement');
                if (metadata === undefined) t.is(decoded.metadata, null, 'absent metadata decodes to null');
                else t.ok(b4a.equals(decoded.metadata, metadata), 'metadata bytes are unchanged');
                t.is(Object.hasOwn(decoded, 'policyHash'), false, 'no legacy property is returned');
            }
            t.ok(b4a.equals(entry, original), 'settlement does not mutate the pending entry');
        }
    }
});

test('Escrow Entry - init rejects invalid metadata types and sizes', t => {
    for (const metadata of [null, '', '00', 0, false, 1n, Symbol('metadata'), {}, [0],
        new ArrayBuffer(1), new Uint16Array(1), {type: 'Buffer', data: [0]},
        b4a.alloc(0), new Uint8Array(0), b4a.alloc(1025), new Uint8Array(1025)]) {
        t.alike(init({...makeInputs(), metadata}), NULL_BUFFER, 'invalid metadata cannot create escrow');
    }
});

test('Escrow Entry - malformed stored metadata is rejected in every settlement status', t => {
    const inputs = makeInputs();
    for (const metadata of [b4a.alloc(0), b4a.alloc(1025, 1)]) {
        for (const status of [Status.PENDING, Status.CLAIMED, Status.REFUNDED]) {
            const entry = encodeStoredEntry(inputs, {
                metadata, status, preimage: status === Status.CLAIMED ? inputs.preimage : undefined
            });
            t.is(decode(entry), null, 'decoding enforces the metadata limit');
            t.is(makeClaim(entry, inputs.preimage, uint64ToBuffer(99)), null);
            t.is(makeRefund(entry, uint64ToBuffer(100)), null);
        }
    }
});
