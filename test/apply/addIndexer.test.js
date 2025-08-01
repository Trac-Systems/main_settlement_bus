import { test, hook } from 'brittle';
import StateMessageOperations from '../../src/messages/stateMessages/StateMessageOperations.js';
import { formatIndexersEntry } from '../../src/utils/helpers.js';

import { sleep } from '../../src/utils/helpers.js';
import {
    initTemporaryDirectory,
    removeTemporaryDirectory,
    setupMsbAdmin,
    setupMsbWriter,
    randomBytes,
    setupMsbPeer,
    tryToSyncWriters,
    setupWhitelist
} from '../utils/setupApplyTests.js';
import { testKeyPair1, testKeyPair2, testKeyPair3 } from '../fixtures/apply.fixtures.js';

let tmpDirectory, admin, indexer1, reader;
let indexersEntryAddressesCount = 1;

hook('Initialize nodes for addIndexer tests', async t => {
    const randomChannel = randomBytes().toString('hex');
    const baseOptions = {
        enable_txlogs: false,
        enable_interactive_mode: false,
        enable_role_requester: false,
        enable_validator_observer: false,
        channel: randomChannel,
    }

    tmpDirectory = await initTemporaryDirectory()
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);

    // Indexer candidate should be a writer before addIndexer
    indexer1 = await setupMsbWriter(admin, 'indexer1', testKeyPair2, tmpDirectory, admin.options);
    reader = await setupMsbPeer('reader', testKeyPair3, tmpDirectory, admin.options);

});

test('handleApplyAddIndexerOperation (apply) - Append addIndexer payload into the base - happy path', async t => {
    try {
        const assembledAddIndexerMessage = await StateMessageOperations.assembleAddIndexerMessage(admin.wallet, indexer1.wallet.address);
        await admin.msb.state.append(assembledAddIndexerMessage);
        indexersEntryAddressesCount += 1;
        await sleep(5000); // wait for both peers to sync state


        const indexersEntry = await indexer1.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);
        const nodeInfo = await indexer1.msb.state.getNodeEntry(indexer1.wallet.address);

        t.is(formattedIndexersEntry.count, indexersEntryAddressesCount, 'Indexers entry count should be 2');
        t.is(formattedIndexersEntry.addresses.includes(indexer1.wallet.address), true, 'Indexer address should not be included in the indexers entry');
        t.is(nodeInfo.isIndexer, true, 'Node info should indicate that the node is an indexer');
    }
    catch (error) {
        t.fail('Failed to add indexer: ' + error.message);
    }
});

test('handleApplyAddIndexerOperation (apply) - Append addIndexer payload into the base - idempotence', async t => {
    try {
        // indexer1 is already an indexer, so adding it again should not change the indexers entry
        const assembledAddIndexerMessage = await StateMessageOperations.assembleAddIndexerMessage(admin.wallet, indexer1.wallet.address);
        await admin.msb.state.append(assembledAddIndexerMessage);
        await sleep(5000); // wait for both peers to sync state


        const indexersEntry = await indexer1.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);
        const nodeInfo = await indexer1.msb.state.getNodeEntry(indexer1.wallet.address);

        t.is(formattedIndexersEntry.count, indexersEntryAddressesCount, 'Indexers entry count should be still 2');
        t.is(formattedIndexersEntry.addresses.includes(indexer1.wallet.address), true, 'Indexer address should not be included in the indexers entry');
        t.is(nodeInfo.isIndexer, true, 'Node info should indicate that the node is an indexer');
    }
    catch (error) {
        t.fail('Failed to add indexer: ' + error.message);
    }
});

test('handleApplyAddIndexerOperation (apply) - handleApplyAddIndexerOperation (apply) - Append addIndexer payload into the base - candidate is not a writer', async t => {
    try {
        const adminSignedLengthBefore = admin.msb.state.getSignedLength();
        const readerSignedLengthBefore = reader.msb.state.getSignedLength();

        const reqAddIndexer1 = await StateMessageOperations.assembleAddIndexerMessage(admin.wallet, reader.wallet.address);
        await admin.msb.state.append(reqAddIndexer1);
        await sleep(5000);
        tryToSyncWriters(admin, reader);
        const adminSignedLengthAfter = admin.msb.state.getSignedLength();
        const readerSignedLengthAfter = reader.msb.state.getSignedLength();

        const indexersEntry = await reader.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);
        const nodeInfo = await reader.msb.state.getNodeEntry(reader.wallet.address);
        t.is(formattedIndexersEntry.count, indexersEntryAddressesCount, `Indexers entry count should be ${indexersEntryAddressesCount}`);
        t.is(formattedIndexersEntry.addresses.includes(reader.wallet.address), false, 'Reader address should not be included in the indexers entry');
        t.is(nodeInfo, null, 'Node info should be null for reader');
        t.is(adminSignedLengthBefore, adminSignedLengthAfter, 'Admin signed length should not change');
        t.is(readerSignedLengthBefore, readerSignedLengthAfter, 'Reader signed length should not change');
    } catch (error) {
        t.fail('Failed to add indexer: ' + error.message);
    }
});

test('handleApplyAddIndexerOperation (apply) - candidate is whitelisted but not a writer, should not be added as indexer', async t => {
    try {
        await setupWhitelist(admin, [reader.wallet.address]);
        await sleep(5000);

        const adminSignedLengthBefore = admin.msb.state.getSignedLength();
        const readerSignedLengthBefore = reader.msb.state.getSignedLength();

        const reqAddIndexer2 = await StateMessageOperations.assembleAddIndexerMessage(admin.wallet, reader.wallet.address);
        await admin.msb.state.append(reqAddIndexer2);
        await sleep(5000);

        tryToSyncWriters(admin, reader);
        const adminSignedLengthAfter = admin.msb.state.getSignedLength();
        const readerSignedLengthAfter = reader.msb.state.getSignedLength();

        const indexersEntryAfterWhitelist = await reader.msb.state.getIndexersEntry();
        const formattedIndexersEntryAfterWhitelist = formatIndexersEntry(indexersEntryAfterWhitelist);
        const nodeInfoAfterWhitelist = await reader.msb.state.getNodeEntry(reader.wallet.address);

        t.is(formattedIndexersEntryAfterWhitelist.count, indexersEntryAddressesCount, `Indexers entry count should be ${indexersEntryAddressesCount}`);
        t.is(formattedIndexersEntryAfterWhitelist.addresses.includes(reader.wallet.address), false, 'Reader address should not be included in the indexers entry');
        t.is(nodeInfoAfterWhitelist.isIndexer, false, 'Node info should not indicate that the node is an indexer');
        t.is(adminSignedLengthBefore, adminSignedLengthAfter, 'Admin signed length should not change');
        t.is(readerSignedLengthBefore, readerSignedLengthAfter, 'Reader signed length should not change');
    } catch (error) {
        t.fail('Failed to add indexer: ' + error.message);
    }
});

test('handleApplyAddIndexerOperation (apply) - Append addIndexer payload into the base by non admin node', async t => {
    try {
        const adminSignedLengthBefore = admin.msb.state.getSignedLength();
        const indexerSignedLengthBefore = indexer1.msb.state.getSignedLength();

        const assembledAddIndexerMessage = await StateMessageOperations.assembleAddIndexerMessage(admin.wallet, indexer1.wallet.address);
        await admin.msb.state.append(assembledAddIndexerMessage);
        await sleep(5000); // wait for both peers to sync state

        const adminSignedLengthAfter = admin.msb.state.getSignedLength();
        const indexerSignedLengthAfter = indexer1.msb.state.getSignedLength();

        const indexersEntry = await indexer1.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);
        const nodeInfo = await indexer1.msb.state.getNodeEntry(indexer1.wallet.address);

        t.is(formattedIndexersEntry.count, indexersEntryAddressesCount, `Indexers entry count should be ${indexersEntryAddressesCount}`);
        t.is(formattedIndexersEntry.addresses.includes(indexer1.wallet.address), true, 'Indexer address should not be included in the indexers entry');
        t.is(nodeInfo.isIndexer, true, 'Node info should indicate that the node is an indexer');
        t.is(adminSignedLengthBefore, adminSignedLengthAfter, 'Admin signed length should not change');
        t.is(indexerSignedLengthBefore, indexerSignedLengthAfter, 'Indexer signed length should not change');
    }
    catch (error) {
        t.fail('Failed to add indexer: ' + error.message);
    }
});



hook('Clean up addIndexer setup', async t => {
    // close msb instances and remove temp directory
    if (admin && admin.msb) await admin.msb.close();
    if (indexer1 && indexer1.msb) await indexer1.msb.close();
    if (reader && reader.msb) await reader.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});
