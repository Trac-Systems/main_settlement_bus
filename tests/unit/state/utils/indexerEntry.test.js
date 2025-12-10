import { test } from 'brittle';
import b4a from 'b4a';
import { randomBuffer } from '../stateTestUtils.js';
import indexerEntryUtils from '../../../../src/core/state/utils/indexerEntry.js';
import { config } from '../../../helpers/config.js';

const appendIndexer = indexerEntryUtils.append;
const removeIndexer = indexerEntryUtils.remove;

// Test append()
test('Indexer Entry - Append creates new entry if none exists', t => {
    const addr = randomBuffer(config.addressLength);
    const entry = appendIndexer(addr, null);
    t.is(entry[0], 1, 'count should be 1');
    t.ok(b4a.equals(entry.subarray(1), addr), 'address should match');
});

test('Indexer Entry - Append to existing entry', t => {
    const addr1 = randomBuffer(config.addressLength);
    const addr2 = randomBuffer(config.addressLength);
    let entry = appendIndexer(addr1, null);
    entry = appendIndexer(addr2, entry);
    t.is(entry[0], 2, 'count should be 2');
    t.ok(b4a.equals(entry.subarray(1, 1 + config.addressLength), addr1), 'first address matches');
    t.ok(b4a.equals(entry.subarray(1 + config.addressLength), addr2), 'second address matches');
});

test('Indexer Entry - Append returns empty buffer if address is invalid', t => {
    const addr = b4a.alloc(5); // invalid size
    const entry = appendIndexer(addr, null);
    t.ok(b4a.equals(entry, b4a.alloc(0)), 'should return empty buffer if address is invalid');
});

// Test remove()
test('Indexer Entry - Removes address from entry', t => {
    const addr1 = randomBuffer(config.addressLength);
    const addr2 = randomBuffer(config.addressLength);
    let entry = appendIndexer(addr1, null);
    entry = appendIndexer(addr2, entry);

    const updated = removeIndexer(addr1, entry);
    t.is(updated[0], 1, 'count should be 1 after removal');
    t.ok(b4a.equals(updated.subarray(1), addr2), 'remaining address should be addr2');
});

test('Indexer Entry - Remove returns empty buffer if address not found', t => {
    const addr1 = randomBuffer(config.addressLength);
    const addr2 = randomBuffer(config.addressLength);
    const addr3 = randomBuffer(config.addressLength);
    let entry = appendIndexer(addr1, null);
    entry = appendIndexer(addr2, entry);

    const updated = removeIndexer(addr3, entry);
    t.ok(b4a.equals(updated, b4a.alloc(0)), 'entry should be empty if address not found');
});

test('Indexer Entry - Remove returns empty buffer on invalid entry', t => {
    const addr = randomBuffer(config.addressLength);
    const invalidEntry = b4a.alloc(5); // too short
    const updated = removeIndexer(addr, invalidEntry);
    t.ok(b4a.equals(updated, b4a.alloc(0)), 'should return empty buffer if invalid');
});

test('Indexer Entry - Remove returns empty buffer on invalid address', t => {
    const addr1 = randomBuffer(config.addressLength);
    let entry = appendIndexer(addr1, null);
    const invalidAddr = b4a.alloc(5);
    const updated = removeIndexer(invalidAddr, entry);
    t.ok(b4a.equals(updated, b4a.alloc(0)), 'should return empty buffer if address invalid');
});

test('Indexer Entry - Remove doesn\'t throw an error when count is bigger than the number of indexers', t => {
    const addr1 = randomBuffer(config.addressLength);
    const addr2 = randomBuffer(config.addressLength);
    const addr3 = randomBuffer(config.addressLength);
    let entry = appendIndexer(addr1, null);
    entry = appendIndexer(addr2, entry);

    // Remove an indexer and set the count to a higher value
    entry[0] = 3;
    const updated = removeIndexer(addr3, entry);
    t.ok(b4a.equals(updated, b4a.alloc(0)), 'entry should be unchanged if count is too high');
});
