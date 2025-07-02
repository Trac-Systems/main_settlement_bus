import { test } from 'brittle';
import b4a from 'b4a';
import {
    encodeAdminEntry,
    decodeAdminEntry,
    encodeNodeEntry,
    decodeNodeEntry,
    setNodeEntryRole,
    appendIndexer,
    removeIndexer
} from '../../src/core/state/ApplyOperationEncodings.js';

const WRITING_KEY_SIZE = 32;
const TRAC_PUB_KEY_SIZE = 32;
const TRAC_ADDRESS_SIZE = 1 + TRAC_PUB_KEY_SIZE;
const NODE_ENTRY_SIZE = WRITING_KEY_SIZE + 1;

function randomBuffer(size) {
    return b4a.from(Array.from({ length: size }, () => Math.floor(Math.random() * 256)));
}

test('Encode and Decode Admin Entry - Happy Path', t => {
    const tracAddr = randomBuffer(TRAC_ADDRESS_SIZE);
    const wKey = randomBuffer(WRITING_KEY_SIZE);

    const encoded = encodeAdminEntry(tracAddr, wKey);
    t.is(encoded.length, 1 + tracAddr.length + wKey.length, "encoding has valid length");

    const decoded = decodeAdminEntry(encoded);
    t.ok(decoded, 'decoded should not be null');
    t.is(b4a.compare(decoded.tracAddr, tracAddr), 0, 'tracAddr matches');
    t.is(b4a.compare(decoded.wKey, wKey), 0, 'wKey matches');
});

test('encodeAdminEntry returns empty buffer on invalid input', t => {
    const validTracAddr = randomBuffer(TRAC_ADDRESS_SIZE);
    const invalidTracAddr = randomBuffer(10);

    const validWKey = randomBuffer(WRITING_KEY_SIZE);
    const invalidWKey = randomBuffer(10);

    const encoded1 = encodeAdminEntry(validTracAddr, invalidWKey);
    const encoded2 = encodeAdminEntry(invalidTracAddr, validWKey);

    t.is(encoded1.length, 0);
    t.is(encoded2.length, 0);
});

test('decodeAdminEntry returns null on invalid input', t => {
    const buf = randomBuffer(10); // invalid size
    const decoded = decodeAdminEntry(buf);
    t.is(decoded, null);
});

test('Encode and Decode Node Entry - Happy Path', t => {
    const wKey = randomBuffer(WRITING_KEY_SIZE);
    const isWriter = true;
    const isIndexer = false;

    const encoded = encodeNodeEntry(wKey, isWriter, isIndexer);
    t.is(encoded.length, NODE_ENTRY_SIZE, "encoding has valid length");

    const decoded = decodeNodeEntry(encoded);
    t.ok(decoded, 'decoded should not be null');
    t.is(b4a.compare(decoded.wk, wKey), 0, 'wKey matches');
    t.is(decoded.isWriter, isWriter, 'isWriter matches');
    t.is(decoded.isIndexer, isIndexer, 'isIndexer matches');
});

test('encodeNodeEntry returns empty buffer on invalid input', t => {
    const wKey = randomBuffer(10); // invalid size
    const encoded = encodeNodeEntry(wKey, true, true);
    t.is(encoded.length, 0);
});

test('decodeNodeEntry returns null on invalid input', t => {
    const buf = randomBuffer(10); // invalid size
    const decoded = decodeNodeEntry(buf);
    t.is(decoded, null);
});

test('setNodeEntryRole updates role flags', t => {
    const wKey = randomBuffer(WRITING_KEY_SIZE);
    let entry = encodeNodeEntry(wKey, false, false);

    entry = setNodeEntryRole(entry, true, true);
    const decoded = decodeNodeEntry(entry);
    t.ok(decoded.isWriter, 'isWriter should be true');
    t.ok(decoded.isIndexer, 'isIndexer should be true');

    entry = setNodeEntryRole(entry, false, false);
    const decoded2 = decodeNodeEntry(entry);
    t.not(decoded2.isWriter, 'isWriter should be false');
    t.not(decoded2.isIndexer, 'isIndexer should be false');
});

test('appendIndexer creates new entry if none exists', t => {
    const addr = randomBuffer(TRAC_ADDRESS_SIZE);
    const entry = appendIndexer(addr, null);
    t.is(entry[0], 1, 'count should be 1');
    t.ok(b4a.equals(entry.subarray(1), addr), 'address should match');
});

test('appendIndexer appends to existing entry', t => {
    const addr1 = randomBuffer(TRAC_ADDRESS_SIZE);
    const addr2 = randomBuffer(TRAC_ADDRESS_SIZE);
    let entry = appendIndexer(addr1, null);
    entry = appendIndexer(addr2, entry);
    t.is(entry[0], 2, 'count should be 2');
    t.ok(b4a.equals(entry.subarray(1, 1 + TRAC_ADDRESS_SIZE), addr1), 'first address matches');
    t.ok(b4a.equals(entry.subarray(1 + TRAC_ADDRESS_SIZE), addr2), 'second address matches');
});

test('appendIndexer returns empty buffer if address is invalid', t => {
    const addr = b4a.alloc(5); // invalid size
    const entry = appendIndexer(addr, null);
    t.ok(b4a.equals(entry, b4a.alloc(0)), 'should return empty buffer if address is invalid');
});

test('removeIndexer removes address from entry', t => {
    const addr1 = randomBuffer(TRAC_ADDRESS_SIZE);
    const addr2 = randomBuffer(TRAC_ADDRESS_SIZE);
    let entry = appendIndexer(addr1, null);
    entry = appendIndexer(addr2, entry);

    const updated = removeIndexer(addr1, entry);
    t.is(updated[0], 1, 'count should be 1 after removal');
    t.ok(b4a.equals(updated.subarray(1), addr2), 'remaining address should be addr2');
});

test('removeIndexer returns empty buffer if address not found', t => {
    const addr1 = randomBuffer(TRAC_ADDRESS_SIZE);
    const addr2 = randomBuffer(TRAC_ADDRESS_SIZE);
    const addr3 = randomBuffer(TRAC_ADDRESS_SIZE);
    let entry = appendIndexer(addr1, null);
    entry = appendIndexer(addr2, entry);

    const updated = removeIndexer(addr3, entry);
    t.ok(b4a.equals(updated, b4a.alloc(0)), 'entry should be empty if address not found');
});

test('removeIndexer returns empty buffer on invalid entry', t => {
    const addr = randomBuffer(TRAC_ADDRESS_SIZE);
    const invalidEntry = b4a.alloc(5); // too short
    const updated = removeIndexer(addr, invalidEntry);
    t.ok(b4a.equals(updated, b4a.alloc(0)), 'should return empty buffer if invalid');
});

test('removeIndexer returns emoty buffer on invalid address', t => {
    const addr1 = randomBuffer(TRAC_ADDRESS_SIZE);
    let entry = appendIndexer(addr1, null);
    const invalidAddr = b4a.alloc(5);
    const updated = removeIndexer(invalidAddr, entry);
    t.ok(b4a.equals(updated, b4a.alloc(0)), 'should return empty buffer if address invalid');
});

test('removeIndexer doesn\'t throw an error when count is bigger than the number of indexers', t => {
    const addr1 = randomBuffer(TRAC_ADDRESS_SIZE);
    const addr2 = randomBuffer(TRAC_ADDRESS_SIZE);
    const addr3 = randomBuffer(TRAC_ADDRESS_SIZE);
    let entry = appendIndexer(addr1, null);
    entry = appendIndexer(addr2, entry);

    // Remove an indexer and set the count to a higher value
    entry[0] = 3;
    const updated = removeIndexer(addr3, entry);
    t.ok(b4a.equals(updated, b4a.alloc(0)), 'entry should be unchanged if count is too high');
});
