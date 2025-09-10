import { test } from 'brittle';
import b4a from 'b4a';
import { WRITER_BYTE_LENGTH } from '../../../src/utils/constants.js';
import { randomBuffer, TEN_THOUSAND_VALUE } from '../stateTestUtils.js';
import { NodeRole } from '../../../src/core/state/utils/roles.js';
import {
    ZERO_BALANCE,
    NODE_ENTRY_SIZE,
    init as initNodeEntry,
    encode as encodeNodeEntry,
    decode as decodeNodeEntry,
    setRole as setNodeEntryRole,
    setBalance as setNodeEntryBalance,
    disableInitialization as disableNodeEntryInitialization
} from '../../../src/core/state/utils/nodeEntry.js';
import { NULL_BUFFER } from '../../../src/utils/buffer.js';

// Test init()
test('Node Entry - init - Happy Path', t => {
    const wk = randomBuffer(WRITER_BYTE_LENGTH)
    const initialized = initNodeEntry(wk, NodeRole.WHITELISTED)

    t.is(initialized.length, NODE_ENTRY_SIZE, "initialized has valid length");
    const decoded = decodeNodeEntry(initialized);
    t.ok(decoded, 'decoded should not be null');
    t.ok(b4a.equals(decoded.wk, wk), 'wk matches');
    t.is(decoded.isWhitelisted, true, 'isWhitelisted matches');
    t.is(decoded.isWriter, false, 'isWriter matches');
    t.is(decoded.isIndexer, false, 'isIndexer matches');
    t.is(decoded.isInitlizationDisabled, false, 'isInitlizationDisabled matches');
    t.ok(b4a.equals(decoded.balance, ZERO_BALANCE), 'balance matches');
});

test('Node Entry - init - Happy Path with balance', t => {
    const wk = randomBuffer(WRITER_BYTE_LENGTH)
    const initialized = initNodeEntry(wk, NodeRole.WHITELISTED, TEN_THOUSAND_VALUE)

    t.is(initialized.length, NODE_ENTRY_SIZE, "initialized has valid length");
    const decoded = decodeNodeEntry(initialized);
    t.ok(decoded, 'decoded should not be null');
    t.ok(b4a.equals(decoded.wk, wk), 'wk matches');
    t.is(decoded.isWhitelisted, true, 'isWhitelisted matches');
    t.is(decoded.isWriter, false, 'isWriter matches');
    t.is(decoded.isIndexer, false, 'isIndexer matches');
    t.is(decoded.isInitlizationDisabled, false, 'isInitlizationDisabled matches');
    t.ok(b4a.equals(decoded.balance, TEN_THOUSAND_VALUE), 'balance matches');
});

// Test encode()
test('Node Entry - encode and decode - Happy Path', t => {
    const node = {
        wk: randomBuffer(WRITER_BYTE_LENGTH),
        isWhitelisted: true,
        isWriter: true,
        isIndexer: false,
        balance: ZERO_BALANCE,
        isInitlizationDisabled: true
    };

    const encoded = encodeNodeEntry(node);
    t.is(encoded.length, NODE_ENTRY_SIZE, "encoding has valid length");

    const decoded = decodeNodeEntry(encoded);
    t.ok(decoded, 'decoded should not be null');
    t.ok(b4a.equals(decoded.wk, node.wk), 'wk matches');
    t.is(decoded.isWhitelisted, true, 'isWhitelisted matches');
    t.is(decoded.isWriter, true, 'isWriter matches');
    t.is(decoded.isIndexer, false, 'isIndexer matches');
    t.is(decoded.isInitlizationDisabled, true, 'isIndexer matches');
    t.ok(b4a.equals(decoded.balance, ZERO_BALANCE), 'balance matches');
});

test('Node Entry - encode returns empty buffer on invalid isInitlizationDisabled', t => {
    const node = {
        wk: randomBuffer(10), // invalid size
        isWhitelisted: false,
        isWriter: false,
        isIndexer: true,
        balance: ZERO_BALANCE,
        isInitlizationDisabled: null
    };
    const encoded = encodeNodeEntry(node);
    t.is(encoded.length, 0);
});

test('Node Entry - encode returns empty buffer on invalid wk', t => {
    const node = {
        wk: randomBuffer(10), // invalid size
        isWhitelisted: false,
        isWriter: false,
        isIndexer: true,
        balance: ZERO_BALANCE,
        isInitlizationDisabled: true
    };
    const encoded = encodeNodeEntry(node);
    t.is(encoded.length, 0);
});

test('Node Entry - encode returns empty buffer on invalid node role', t => {
    const node = {
        wk: randomBuffer(WRITER_BYTE_LENGTH),
        isWhitelisted: false,
        isWriter: true, // can't be a writer without being whitelisted
        isIndexer: false,
        balance: ZERO_BALANCE,
        isInitlizationDisabled: true
    };
    const encoded = encodeNodeEntry(node);
    t.is(encoded.length, 0);
});

test('Node Entry - encode returns empty buffer on invalid balance', t => {
    const node = {
        wk: randomBuffer(WRITER_BYTE_LENGTH),
        isWhitelisted: true,
        isWriter: true, // can't be a writer without being whitelisted
        isIndexer: false,
        balance: b4a.from([
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x27,
            0x10,
        ]),
        isInitlizationDisabled: true
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
    const TEN_THOUSAND_VALUE = b4a.from([
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x27, 0x10,
    ])

    let entry = encodeNodeEntry({
        wk: randomBuffer(WRITER_BYTE_LENGTH),
        isWhitelisted: false,
        isWriter: false,
        isIndexer: false,
        balance: TEN_THOUSAND_VALUE,
        isInitlizationDisabled: true
    });

    // Set maximum tier role (0x7)
    entry = setNodeEntryRole(entry, NodeRole.INDEXER);
    const decoded = decodeNodeEntry(entry);
    t.ok(decoded.isWhitelisted, 'isWhitelisted should be true');
    t.ok(decoded.isWriter, 'isWriter should be true');
    t.ok(decoded.isIndexer, 'isIndexer should be true');
    t.ok(b4a.equals(decoded.balance, TEN_THOUSAND_VALUE), 'balance should not change');

    // Set to no roles (0x0)
    entry = setNodeEntryRole(entry, NodeRole.READER);
    const decoded2 = decodeNodeEntry(entry);
    t.not(decoded2.isWhitelisted, 'isWhitelisted should be false');
    t.not(decoded2.isWriter, 'isWriter should be false');
    t.not(decoded2.isIndexer, 'isIndexer should be false');
    t.ok(b4a.equals(decoded.balance, TEN_THOUSAND_VALUE), 'balance should not change');
});

test('Node Entry - setBalance updates the balance', t => {
    let entry = encodeNodeEntry({
        wk: randomBuffer(WRITER_BYTE_LENGTH),
        isWhitelisted: false,
        isWriter: false,
        isIndexer: false,
        balance: ZERO_BALANCE,
        isInitlizationDisabled: true
    });

    entry = setNodeEntryBalance(entry, TEN_THOUSAND_VALUE);
    const decoded = decodeNodeEntry(entry);
    t.not(decoded.isWhitelisted, 'isWhitelisted should be true');
    t.not(decoded.isWriter, 'isWriter should be true');
    t.not(decoded.isIndexer, 'isIndexer should be true');
    t.ok(b4a.equals(decoded.balance, TEN_THOUSAND_VALUE), 'balance should be 10k');

    const INVALID_BALANCE = b4a.from([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x27,
        0x10,
    ])

    // Set to no roles (0x0)
    entry = setNodeEntryBalance(entry, INVALID_BALANCE);
    const decoded2 = decodeNodeEntry(entry);
    t.is(decoded2, null);
});

test('Node Entry - disableInitialization disables', t => {
    const wk = randomBuffer(WRITER_BYTE_LENGTH)
    const entry = initNodeEntry(wk, NodeRole.READER)

    const decoded = decodeNodeEntry(entry);
    t.not(decoded.isWhitelisted, 'isWhitelisted should not be true');
    t.not(decoded.isWriter, 'isWriter should not be true');
    t.not(decoded.isIndexer, 'isIndexer should not be true');
    t.not(decoded.isInitlizationDisabled, 'isInitlizationDisabled should not be true');
    t.ok(b4a.equals(decoded.balance, ZERO_BALANCE), 'balance should be 0');

    const updated = disableNodeEntryInitialization(entry);
    const updatedDecoded = decodeNodeEntry(updated);
    t.not(updatedDecoded.isWhitelisted, 'isWhitelisted should not be true');
    t.not(updatedDecoded.isWriter, 'isWriter should not be true');
    t.not(updatedDecoded.isIndexer, 'isIndexer should not be true');
    t.not(updatedDecoded.isInitlizationDisabled, 'isInitlizationDisabled should not be true');
    t.ok(b4a.equals(updatedDecoded.balance, ZERO_BALANCE), 'balance should be 0');
});

test('Node Entry - cannot double disable', t => {
    const wk = randomBuffer(WRITER_BYTE_LENGTH)
    const entry = initNodeEntry(wk, NodeRole.READER)

    const updated = disableNodeEntryInitialization(entry);
    t.ok(!b4a.equals(updated, NULL_BUFFER), 'updated should not be null');

    const invalid = disableNodeEntryInitialization(updated);
    t.ok(b4a.equals(invalid, NULL_BUFFER), 'invalid should be null');
});