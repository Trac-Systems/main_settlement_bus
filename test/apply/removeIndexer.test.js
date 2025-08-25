import {test, hook} from 'brittle';

import CompleteStateMessageOperations from '../../src/messages/completeStateMessages/CompleteStateMessageOperations.js';
import {formatIndexersEntry} from '../../src/utils/helpers.js';
import {
    initTemporaryDirectory,
    removeTemporaryDirectory,
    setupMsbAdmin,
    setupMsbWriter,
    randomBytes,
    setupMsbIndexer, waitForNodeState, tryToSyncWriters
} from '../utils/setupApplyTests.js';
import {testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4} from '../fixtures/apply.fixtures.js';

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
        // indexer1 is already an indexer -> this indexer will lose its indexer status and will become a writer.
        // indexer2 is already an indexer
        // writer is already a writer
        const assembledRemoveIndexerMessage = await CompleteStateMessageOperations.assembleRemoveIndexerMessage(admin.wallet, indexer1.wallet.address);
        await admin.msb.state.append(assembledRemoveIndexerMessage);
        await tryToSyncWriters(admin, indexer1, indexer2);
        await waitForNodeState(indexer1, indexer1.wallet.address, {
            wk: indexer1.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: true,
            isIndexer: false,
        })

        indexersEntryAddressesCount -= 1;

        const indexersEntry = await indexer1.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);
        const nodeEntryIndexer1 = await indexer1.msb.state.getNodeEntry(indexer1.wallet.address);

        t.is(formattedIndexersEntry.count, indexersEntryAddressesCount, `Indexers entry count should be still ${indexersEntryAddressesCount}`);
        t.is(formattedIndexersEntry.addresses.includes(indexer1.wallet.address), false, 'Indexer address should not be included in the indexers entry');
        t.is(nodeEntryIndexer1.isWriter, true, 'Node info should indicate that the node is a writer');
        t.is(nodeEntryIndexer1.isIndexer, false, 'Node info should indicate that the node is not an indexer');
    } catch (error) {
        t.fail('Failed to remove indexer: ' + error.message);
    }
});


test('handleApplyRemoveIndexerOperation (apply) - Append removeIndexer payload into the base - idempotence', async t => {
    try {
        // indexer1 is already a writer (after the previous test) -> let's test idempotence on this node.
        // indexer2 is already an indexer
        // writer is already a writer
        const adminSignedLengthBefore = admin.msb.state.getSignedLength();
        const indexer2SignedLengthBefore = indexer2.msb.state.getSignedLength();
        const writerSignedLengthBefore = writer.msb.state.getSignedLength();

        const assembledRemoveIndexerMessage = await CompleteStateMessageOperations.assembleRemoveIndexerMessage(admin.wallet, indexer1.wallet.address);
        await admin.msb.state.append(assembledRemoveIndexerMessage);
        await tryToSyncWriters(admin, indexer2, writer);

        const adminSignedLengthAfter = admin.msb.state.getSignedLength();
        const indexer2SignedLengthAfter = indexer2.msb.state.getSignedLength();
        const writerSignedLengthAfter = writer.msb.state.getSignedLength();

        const indexersEntry = await indexer1.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);
        const nodeInfo = await indexer1.msb.state.getNodeEntry(indexer1.wallet.address);

        t.is(formattedIndexersEntry.count, indexersEntryAddressesCount, `Indexers entry count should remain ${indexersEntryAddressesCount}`);
        t.is(formattedIndexersEntry.addresses.includes(indexer1.wallet.address), false, 'Indexer address should not be included in the indexers entry');
        t.is(nodeInfo.isWriter, true, 'Node info should indicate that the node is a writer');
        t.is(nodeInfo.isIndexer, false, 'Node info should indicate that the node is not an indexer');
        t.is(adminSignedLengthBefore, adminSignedLengthAfter, 'Admin signed length should not change');
        t.is(indexer2SignedLengthBefore, indexer2SignedLengthAfter, 'Indexer2 signed length should not change');
        t.is(writerSignedLengthBefore, writerSignedLengthAfter, 'Writer signed length should not change');
    }
    catch (error) {
        t.fail('Failed to remove indexer (idempotence): ' + error.message);
    }
});

test('handleApplyAddIndexerOperation (apply) - Append removeIndexer payload into the base by non-admin node', async t => {
    try {
        // indexer1 is already a writer.
        // indexer2 is already an indexer -> should still be an indexer after the operation.
        // writer is already a writer -> will try to remove indexer2 as a non-admin node, however it should not be allowed.
        const writerSignedLengthBefore = admin.msb.state.getSignedLength();
        const indexer2SignedLengthBefore = indexer2.msb.state.getSignedLength();

        const assembledRemoveIndexerMessage = await CompleteStateMessageOperations.assembleRemoveIndexerMessage(admin.wallet, indexer2.wallet.address);
        await writer.msb.state.append(assembledRemoveIndexerMessage);
        await tryToSyncWriters(admin, indexer2, writer);

        const writerSignedLengthAfter = writer.msb.state.getSignedLength();
        const indexer2SignedLengthAfter = indexer2.msb.state.getSignedLength();

        const indexersEntry = await indexer2.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);
        const nodeInfo = await indexer2.msb.state.getNodeEntry(indexer2.wallet.address);

        t.is(formattedIndexersEntry.count, indexersEntryAddressesCount, `Indexers entry count should be still ${indexersEntryAddressesCount}`);
        t.is(formattedIndexersEntry.addresses.includes(indexer2.wallet.address), true, 'Indexer address should not be included in the indexers entry');
        t.is(nodeInfo.isIndexer, true, 'Node info should indicate that the node is an indexer');
        t.is(writerSignedLengthBefore, writerSignedLengthAfter, 'Writer signed length should not change');
        t.is(indexer2SignedLengthBefore, indexer2SignedLengthAfter, 'Indexer2 signed length should not change');
    }
    catch (error) {
        t.fail('Failed to add indexer: ' + error.message);
    }
});

hook('Clean up removeIndexer setup', async t => {
    if (admin && admin.msb) await admin.msb.close();
    if (indexer1 && indexer1.msb) await indexer1.msb.close();
    if (indexer2 && indexer2.msb) await indexer2.msb.close();
    if (writer && writer.msb) await writer.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});
