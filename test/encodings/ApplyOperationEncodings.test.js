import { test } from 'brittle';
import b4a from 'b4a';
import { bech32m } from 'bech32';
import { TRAC_NETWORK_MAINNET_PREFIX } from 'trac-wallet/constants.js';
import {
    NodeRole,
    encodeAdminEntry,
    decodeAdminEntry,
    encodeNodeEntry,
    decodeNodeEntry,
    setNodeEntryRole,
    appendIndexer,
    removeIndexer,
    bufferToAddress,
    addressToBuffer,
} from '../../src/core/state/ApplyOperationEncodings.js';

const WRITING_KEY_SIZE = 32;
const TRAC_PUB_KEY_SIZE = 32;

const BECH32M_HRP_SIZE = TRAC_NETWORK_MAINNET_PREFIX.length + 1; // +1 for the separator
const BECH32M_DATA_SIZE = Math.ceil(TRAC_PUB_KEY_SIZE * 8 / 5); // rounded up to the nearest 5-byte multiple (should be 52 for 32 byte keys)
const BECH32M_CHECKSUM_SIZE = 6;

const TRAC_ADDRESS_SIZE = BECH32M_DATA_SIZE + BECH32M_CHECKSUM_SIZE; // TODO: SHould we really take away the HRP when storing data in the base?
const ADMIN_ENTRY_SIZE = TRAC_ADDRESS_SIZE + WRITING_KEY_SIZE;
const NODE_ENTRY_SIZE = WRITING_KEY_SIZE + 1;

function randomBuffer(size) {
    return b4a.from(Array.from({ length: size }, () => Math.floor(Math.random() * 256)));
}

function randomAddress(hrp = TRAC_NETWORK_MAINNET_PREFIX) {
    const data = randomBuffer(TRAC_PUB_KEY_SIZE);
    return bech32m.encode(hrp, bech32m.toWords(data));
}

test('Convert bech32m address to and from buffer - Happy Path', t => {
    const hrp = 'test';
    const address = randomAddress(hrp);
    const rawBuffer = b4a.from(address, 'utf8');
    const addressBuffer = addressToBuffer(address);
    const reconstructedAddress = bufferToAddress(addressBuffer, hrp);

    t.ok(b4a.isBuffer(addressBuffer), 'Address buffer should be a Buffer instance');
    t.is(typeof reconstructedAddress, 'string', 'Reconstructed address should be a string');
    t.ok(address === reconstructedAddress, 'Reconstructed address should match original');
    t.is(addressBuffer.length, rawBuffer.length - (hrp.length + 1), 'Address buffer length should match raw buffer length excluding hrp and separator');
    t.ok(b4a.equals(addressBuffer, rawBuffer.subarray(hrp.length + 1)), 'Address buffer should match raw buffer without HRP and separator');
});

test('Encode and Decode Admin Entry - Happy Path', t => {
    const tracAddr = randomAddress();
    const wk = randomBuffer(WRITING_KEY_SIZE);

    const encoded = encodeAdminEntry(tracAddr, wk);
    t.is(encoded.length, ADMIN_ENTRY_SIZE, "encoding has valid length");

    const decoded = decodeAdminEntry(encoded);
    t.ok(decoded, 'decoded should not be null');
    t.ok(decoded.tracAddr === tracAddr, 'tracAddr matches');
    t.ok(b4a.equals(decoded.wk, wk), 'wk matches');
});

test('encodeAdminEntry returns empty buffer on invalid input', t => {
    const validTracAddr = randomAddress();
    const invalidTracAddr = randomAddress().substring(BECH32M_HRP_SIZE + 1); // missing HRP

    const validWk = randomBuffer(WRITING_KEY_SIZE);
    const invalidWk = randomBuffer(10);

    const encoded1 = encodeAdminEntry(validTracAddr, invalidWk);
    const encoded2 = encodeAdminEntry(invalidTracAddr, validWk);

    t.is(encoded1.length, 0);
    t.is(encoded2.length, 0);
});

test('decodeAdminEntry returns null on invalid input', t => {
    const buf = randomBuffer(10); // invalid size
    const decoded = decodeAdminEntry(buf);
    t.is(decoded, null);
});

test('Encode and Decode Node Entry - Happy Path', t => {
    const node = {
        wk: randomBuffer(WRITING_KEY_SIZE),
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

test('encodeNodeEntry returns empty buffer on invalid wk', t => {
    const node = {
        wk: randomBuffer(10), // invalid size
        isWhitelisted: false,
        isWriter: false,
        isIndexer: true
    };
    const encoded = encodeNodeEntry(node);
    t.is(encoded.length, 0);
});

test('encodeNodeEntry returns empty buffer on invalid node role', t => {
    const node = {
        wk: randomBuffer(WRITING_KEY_SIZE),
        isWhitelisted: false,
        isWriter: true, // can't be a writer without being whitelisted
        isIndexer: false
    };
    const encoded = encodeNodeEntry(node);
    t.is(encoded.length, 0);
});

test('decodeNodeEntry returns null on invalid input', t => {
    const buf = randomBuffer(10); // invalid size
    const decoded = decodeNodeEntry(buf);
    t.is(decoded, null);
});

test('setNodeEntryRole updates role flags', t => {
    let entry = encodeNodeEntry({
        wk: randomBuffer(WRITING_KEY_SIZE),
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

test('removeIndexer returns empty buffer on invalid address', t => {
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
