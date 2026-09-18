import test from 'brittle';
import b4a from 'b4a';

import {
    decodeEscrowEntry,
    encodeEscrowEntry,
    safeDecodeEscrowEntry,
    safeEncodeEscrowEntry,
} from '../../../src/codecs/state/escrowEntryCodec.js';
import {validEscrowEntry} from '../../fixtures/escrowEntry.fixtures.js';

test('Escrow entry codec roundtrips protobuf fields without changing address bytes', t => {
    const encoded = encodeEscrowEntry(validEscrowEntry);
    const decoded = decodeEscrowEntry(encoded);

    t.ok(b4a.isBuffer(encoded));
    t.alike(decoded, validEscrowEntry);
    t.alike(safeDecodeEscrowEntry(safeEncodeEscrowEntry(validEscrowEntry)), validEscrowEntry);
    t.ok(Object.prototype.hasOwnProperty.call(decoded, 'status'), 'pending status zero has explicit presence');
    for (const field of ['nonce', 'ss', 'th', 'preimage']) {
        t.absent(Object.prototype.hasOwnProperty.call(decoded, field), `${field} is not stored for an open escrow`);
    }
});

test('Escrow entry codec preserves absent optional fields', t => {
    const entry = {
        ...validEscrowEntry,
        additionalFeeAmount: b4a.alloc(16),
        additionalFeeRecipientAddress: undefined,
        policyHash: undefined,
    };
    const decoded = decodeEscrowEntry(encodeEscrowEntry(entry));
    for (const field of ['additionalFeeRecipientAddress', 'policyHash', 'preimage']) {
        t.absent(Object.prototype.hasOwnProperty.call(decoded, field), `${field} is omitted`);
    }
    t.alike(decoded.additionalFeeAmount, entry.additionalFeeAmount);
});

test('Escrow entry codec handles Uint8Array inputs and independent decoded buffers', t => {
    const typedEntry = Object.fromEntries(Object.entries(validEscrowEntry)
        .map(([field, value]) => [field, b4a.isBuffer(value) ? new Uint8Array(value) : value]));
    const encoded = encodeEscrowEntry(typedEntry);
    const original = b4a.from(encoded);
    t.alike(decodeEscrowEntry(new Uint8Array(encoded)), validEscrowEntry);

    const decoded = decodeEscrowEntry(encoded);
    for (const value of Object.values(decoded)) {
        if (b4a.isBuffer(value)) value.fill(0xff);
    }
    t.alike(encoded, original, 'mutating decoded bytes does not change stored bytes');
    t.alike(decodeEscrowEntry(encoded), validEscrowEntry);
});

test('Escrow entry codec rejects invalid protobuf input with safe fallbacks', async t => {
    for (const entry of [
        null, undefined, [], 'escrow', b4a.alloc(0),
        {...validEscrowEntry, version: '3'},
        {...validEscrowEntry, status: 99},
        {...validEscrowEntry, amount: 100},
        {...validEscrowEntry, lockerAddress: {}},
    ]) {
        await t.exception(() => encodeEscrowEntry(entry));
        t.alike(safeEncodeEscrowEntry(entry), b4a.alloc(0));
    }

    const encoded = encodeEscrowEntry(validEscrowEntry);
    for (const value of [
        null, undefined, [], {}, 'escrow', b4a.alloc(0), b4a.from([0xff]),
        encoded.subarray(0, encoded.length - 1),
    ]) {
        await t.exception.all(() => decodeEscrowEntry(value));
        t.is(safeDecodeEscrowEntry(value), null);
    }
});

test('Escrow entry codec leaves financial and version validation to the state helper', t => {
    const entry = {...validEscrowEntry, version: 99, amount: b4a.from([1])};
    t.alike(safeDecodeEscrowEntry(safeEncodeEscrowEntry(entry)), entry);
});
