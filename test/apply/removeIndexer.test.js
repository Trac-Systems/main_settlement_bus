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
    setupWhitelist,
    setupMsbIndexer
} from '../utils/setupApplyTests.js';
import { testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4 } from '../fixtures/apply.fixtures.js';

let tmpDirectory, admin, indexer1, indexer2, writer;
let indexersEntryAddressesCount;

hook('Initialize nodes for addIndexer tests', async t => {
    const randomChannel = randomBytes(32).toString('hex');
    const baseOptions = {
        enable_txlogs: false,
        enable_interactive_mode: false,
        enable_role_requester: false,
        enable_validator_observer: false,
        channel: randomChannel,
    }
    tmpDirectory = await initTemporaryDirectory();

    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);
    indexer1 = await setupMsbWriter(admin, 'indexer1', testKeyPair2, tmpDirectory, admin.options);
    indexer1 = await setupMsbIndexer(indexer1, admin);

    indexer2 = await setupMsbWriter(admin, 'indexer2', testKeyPair3, tmpDirectory, admin.options);
    indexer2 = await setupMsbIndexer(indexer2, admin);

    writer = await setupMsbWriter(admin, 'writer', testKeyPair4, tmpDirectory, admin.options);

    indexersEntryAddressesCount = 3; // 2 indexers + 1 admin 
});

test('handleApplyRemoveIndexerOperation (apply) - Append removeIndexer payload into the base - happy path', async t => {
    try {
        const assembledRemoveIndexerMessage = await StateMessageOperations.assembleRemoveIndexerMessage(admin.wallet, indexer1.wallet.address);
        await admin.msb.state.append(assembledRemoveIndexerMessage);
        indexersEntryAddressesCount -= 1;
        await sleep(5000); // wait for both peers to sync state

        const indexersEntry = await indexer1.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);
        const nodeInfo = await indexer1.msb.state.getNodeEntry(indexer1.wallet.address);

        t.is(formattedIndexersEntry.count, indexersEntryAddressesCount, `Indexers entry count should be still ${indexersEntryAddressesCount}`);
        t.is(formattedIndexersEntry.addresses.includes(indexer1.wallet.address), false, 'Indexer address should not be included in the indexers entry');
        t.is(nodeInfo.isWriter, true, 'Node info should indicate that the node is a writer');
        t.is(nodeInfo.isIndexer, false, 'Node info should indicate that the node is not an indexer');
    }
    catch (error) {
        t.fail('Failed to remove indexer: ' + error.message);
    }
});


test('handleApplyRemoveIndexerOperation (apply) - Append removeIndexer payload into the base - idempotence', async t => {
    try {
        // indexer1 is not already an indexer.
        const adminSignedLengthBefore = admin.msb.state.getSignedLength();
        const indexerSignedLengthBefore = indexer1.msb.state.getSignedLength();

        const assembledRemoveIndexerMessage = await StateMessageOperations.assembleRemoveIndexerMessage(admin.wallet, indexer1.wallet.address);
        await admin.msb.state.append(assembledRemoveIndexerMessage);
        await sleep(5000);
        tryToSyncWriters(admin, indexer1);

        const adminSignedLengthAfter = admin.msb.state.getSignedLength();
        const indexerSignedLengthAfter = indexer1.msb.state.getSignedLength();

        const indexersEntry = await indexer1.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);
        const nodeInfo = await indexer1.msb.state.getNodeEntry(indexer1.wallet.address);

        t.is(formattedIndexersEntry.count, indexersEntryAddressesCount, `Indexers entry count should remain ${indexersEntryAddressesCount}`);
        t.is(formattedIndexersEntry.addresses.includes(indexer1.wallet.address), false, 'Indexer address should not be included in the indexers entry');
        t.is(nodeInfo.isWriter, true, 'Node info should indicate that the node is a writer');
        t.is(nodeInfo.isIndexer, false, 'Node info should indicate that the node is not an indexer');
        t.is(adminSignedLengthBefore, adminSignedLengthAfter, 'Admin signed length should not change');
        t.is(indexerSignedLengthBefore, indexerSignedLengthAfter, 'Indexer signed length should not change');
    }
    catch (error) {
        t.fail('Failed to remove indexer (idempotence): ' + error.message);
    }
});

test('handleApplyAddIndexerOperation (apply) - Append removeIndexer payload into the base by non-admin node', async t => {
    try {
        // indexer2 is already an indexer
        const indexerSignedLengthBefore = indexer2.msb.state.getSignedLength();
        const writerSignedLengthBefore = writer.msb.state.getSignedLength();

        const assembledRemoveIndexerMessage = await StateMessageOperations.assembleRemoveIndexerMessage(writer.wallet, indexer2.wallet.address);
        await writer.msb.state.append(assembledRemoveIndexerMessage);
        await sleep(5000); // wait for both peers to sync state
        tryToSyncWriters(writer, indexer2);

        const writerSignedLengthAfter = writer.msb.state.getSignedLength();
        const indexerSignedLengthAfter = indexer2.msb.state.getSignedLength();

        const indexersEntry = await indexer2.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);
        const nodeInfo = await indexer2.msb.state.getNodeEntry(indexer2.wallet.address);

        t.is(formattedIndexersEntry.count, indexersEntryAddressesCount, `Indexers entry count should be still ${indexersEntryAddressesCount}`);
        t.is(formattedIndexersEntry.addresses.includes(indexer2.wallet.address), true, 'Indexer address should not be included in the indexers entry');
        t.is(nodeInfo.isIndexer, true, 'Node info should indicate that the node is an indexer');
        t.is(writerSignedLengthBefore, writerSignedLengthAfter, 'Writer signed length should not change');
        t.is(indexerSignedLengthBefore, indexerSignedLengthAfter, 'Indexer signed length should not change');
    }
    catch (error) {
        t.fail('Failed to add indexer: ' + error.message);
    }
});

hook('Clean up removeIndexer setup', async t => {
    // close msbBoostrap and remove temp directory
    if (admin && admin.msb) await admin.msb.close();
    if (indexer1 && indexer1.msb) await indexer1.msb.close();
    if (indexer2 && indexer2.msb) await indexer2.msb.close();
    if (writer && writer.msb) await writer.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});
