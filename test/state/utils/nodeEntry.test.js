import { test } from 'brittle';
import b4a from 'b4a';
import { WRITER_BYTE_LENGTH } from '../../../src/utils/constants.js';
import { randomBuffer } from '../stateTestUtils.js';
import nodeEntryUtils from '../../../src/core/state/utils/nodeEntry.js';
import { NodeRole } from '../../../src/core/state/utils/roles.js';

const NODE_ENTRY_SIZE = nodeEntryUtils.NODE_ENTRY_SIZE;
const encodeNodeEntry = nodeEntryUtils.encode;
const decodeNodeEntry = nodeEntryUtils.decode;
const setNodeEntryRole = nodeEntryUtils.setRole;

// Test encode()
test('Node Entry - encode and decode - Happy Path', t => {
    const node = {
        wk: randomBuffer(WRITER_BYTE_LENGTH),
        isWhitelisted: true,
        isWriter: true,
        isIndexer: false
    };

    const encoded = encodeNodeEntry(node);
    t.is(encoded.length, NODE_ENTRY_SIZE, "encoding has valid length");

    const decoded = decodeNodeEntry(encoded);
    t.ok(decoded, 'decoded should not be null');
    t.ok(b4a.equals(decoded.wk, node.wk), 'wk matches');
    t.is(decoded.isWhitelisted, true, 'isWhitelisted matches');
    t.is(decoded.isWriter, true, 'isWriter matches');
    t.is(decoded.isIndexer, false, 'isIndexer matches');
});

test('Node Entry - encode returns empty buffer on invalid wk', t => {
    const node = {
        wk: randomBuffer(10), // invalid size
        isWhitelisted: false,
        isWriter: false,
        isIndexer: true
    };
    const encoded = encodeNodeEntry(node);
    t.is(encoded.length, 0);
});

test('Node Entry - encode returns empty buffer on invalid node role', t => {
    const node = {
        wk: randomBuffer(WRITER_BYTE_LENGTH),
        isWhitelisted: false,
        isWriter: true, // can't be a writer without being whitelisted
        isIndexer: false
    };
    const encoded = encodeNodeEntry(node);
    t.is(encoded.length, 0);
});

// Test decode()
test('Node Entry - decode returns null on invalid input', t => {
    const buf = randomBuffer(10); // invalid size
    const decoded = decodeNodeEntry(buf);
    t.is(decoded, null);
});

test('Node Entry - setRole updates role flags', t => {
    let entry = encodeNodeEntry({
        wk: randomBuffer(WRITER_BYTE_LENGTH),
        isWhitelisted: false,
        isWriter: false,
        isIndexer: false
    });

    // Set maximum tier role (0x7)
    entry = setNodeEntryRole(entry, NodeRole.INDEXER);
    const decoded = decodeNodeEntry(entry);
    t.ok(decoded.isWhitelisted, 'isWhitelisted should be true');
    t.ok(decoded.isWriter, 'isWriter should be true');
    t.ok(decoded.isIndexer, 'isIndexer should be true');

    // Set to no roles (0x0)
    entry = setNodeEntryRole(entry, NodeRole.READER);
    const decoded2 = decodeNodeEntry(entry);
    t.not(decoded2.isWhitelisted, 'isWhitelisted should be false');
    t.not(decoded2.isWriter, 'isWriter should be false');
    t.not(decoded2.isIndexer, 'isIndexer should be false');
});
