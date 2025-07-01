import { test } from 'brittle';
import b4a from 'b4a';
import {
    encodeAdminEntry,
    decodeAdminEntry,
    encodeNodeEntry,
    decodeNodeEntry,
    setNodeEntryRole
} from '../../src/core/state/encodings.js';

const WRITING_KEY_SIZE = 32;
const TRAC_PUB_KEY_SIZE = 32;
const TRAC_ADDRESS_SIZE = 1 + TRAC_PUB_KEY_SIZE;
const ADMIN_ENTRY_SIZE = TRAC_ADDRESS_SIZE + WRITING_KEY_SIZE;
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