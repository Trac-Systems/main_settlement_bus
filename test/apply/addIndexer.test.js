import {test, hook} from 'brittle';

import StateMessageOperations from '../../src/messages/stateMessages/StateMessageOperations.js';
import {formatIndexersEntry} from '../../src/utils/helpers.js';
import {
    initTemporaryDirectory,
    removeTemporaryDirectory,
    setupMsbAdmin,
    setupMsbWriter,
    randomBytes,
    setupMsbPeer,
    setupWhitelist, waitForNodeState, tryToSyncWriters, setupNodeAsWriter
} from '../utils/setupApplyTests.js';
import {
    testKeyPair1,
    testKeyPair2,
    testKeyPair3,
    testKeyPair4,
    testKeyPair5,
    testKeyPair6,
    testKeyPair7
} from '../fixtures/apply.fixtures.js';

let tmpDirectory, admin, indexer1, indexer2, reader1, reader2, indexer3, writer;
let indexersEntryAddressesCount = 1;

hook('Initialize nodes for addIndexer tests', async t => {
    const randomChannel = randomBytes(32).toString('hex');
    const baseOptions = {
        enable_txlogs: false,
        enable_interactive_mode: false,
        enable_role_requester: false,
        enable_validator_observer: false,
        channel: randomChannel,
    }

    tmpDirectory = await initTemporaryDirectory()
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);

    indexer1 = await setupMsbWriter(admin, 'indexer1', testKeyPair2, tmpDirectory, admin.options);
    indexer2 = await setupMsbWriter(admin, 'indexer2', testKeyPair3, tmpDirectory, admin.options);
    indexer3 = await setupMsbWriter(admin, 'indexer3', testKeyPair4, tmpDirectory, admin.options);

    reader1 = await setupMsbPeer('reader1', testKeyPair5, tmpDirectory, admin.options);
    reader2 = await setupMsbPeer('reader2', testKeyPair6, tmpDirectory, admin.options);
    await setupWhitelist(admin, [reader2.wallet.address]);

    writer = await setupMsbWriter(admin, 'writer', testKeyPair7, tmpDirectory, admin.options);

});

test('handleApplyAddIndexerOperation (apply) - Append addIndexer payload into the base - happy path', async t => {
    // indexer1 is already a writer -> this writer will become an indexer
    // indexer2 is already a writer.
    // reader1 is just a reading node.
    // reader2 is just a reading node.
    // indexer3 is just a writer.

    try {
        const assembledAddIndexerMessage = await StateMessageOperations.assembleAddIndexerMessage(admin.wallet, indexer1.wallet.address);
        await admin.msb.state.append(assembledAddIndexerMessage);
        indexersEntryAddressesCount += 1;

        await waitForNodeState(admin, indexer1.wallet.address, {
            wk: indexer1.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: true,
            isIndexer: true,
        })

        const indexersEntry = await admin.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);
        const nodeInfo = await admin.msb.state.getNodeEntry(indexer1.wallet.address);

        t.is(formattedIndexersEntry.count, indexersEntryAddressesCount, 'Indexers entry count should be 2');
        t.is(formattedIndexersEntry.addresses.includes(indexer1.wallet.address), true, 'Indexer address should not be included in the indexers entry');
        t.is(nodeInfo.isIndexer, true, 'Node info should indicate that the node is an indexer');
    } catch (error) {
        t.fail('Failed to add indexer: ' + error.message);
    }
});

test('handleApplyAddIndexerOperation (apply) - Append addIndexer payload into the base - idempotence', async t => {
    try {
        // indexer1 is already an indexer.
        // indexer2 is already a writer -> this writer will become an indexer
        // writer is already a writer.
        // reader1 is just a reading node.
        // reader2 is just a reading node.
        // indexer3 is just a writer.


        const assembledAddIndexerMessage = await StateMessageOperations.assembleAddIndexerMessage(
            admin.wallet,
            indexer2.wallet.address
        );
        await admin.msb.state.append(assembledAddIndexerMessage);
        indexersEntryAddressesCount += 1;

        await waitForNodeState(admin, indexer2.wallet.address, {
            wk: indexer2.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: true,
            isIndexer: true,
        })

        await tryToSyncWriters(admin, indexer1, indexer2);

        const adminSignedLengthBefore = admin.msb.state.getSignedLength();
        const reqAddIndexerMessageAgain = await StateMessageOperations.assembleAddIndexerMessage(
            admin.wallet,
            indexer2.wallet.address
        );

        await admin.msb.state.append(reqAddIndexerMessageAgain);

        await waitForNodeState(admin, indexer2.wallet.address, {
            wk: indexer2.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: true,
            isIndexer: true,
        })

        await waitForNodeState(indexer2, indexer2.wallet.address, {
            wk: indexer2.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: true,
            isIndexer: true,
        })


        const adminSignedLengthAfter = admin.msb.state.getSignedLength();

        const indexersEntry = await indexer1.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);
        const nodeInfo = await indexer1.msb.state.getNodeEntry(indexer1.wallet.address);

        t.is(formattedIndexersEntry.count, indexersEntryAddressesCount, `Indexers entry count should be ${indexersEntryAddressesCount}`);
        t.is(formattedIndexersEntry.addresses.includes(indexer1.wallet.address), true, 'Indexer address should not be included in the indexers entry');
        t.is(nodeInfo.isIndexer, true, 'Node info should indicate that the node is an indexer');
        t.is(adminSignedLengthBefore, adminSignedLengthAfter, 'Admin signed length should not change');
    } catch (error) {
        t.fail('Failed to add indexer: ' + error.message);
    }
});

test('handleApplyAddIndexerOperation (apply) - Append addIndexer payload into the base - candidate is not a writer', async t => {
    try {
        // indexer1 is already an indexer.
        // indexer2 is already an indexer.
        // reader1 is just a reading node -> will not become an indexer it will still a reader.
        // reader2 is just a reading node.
        // indexer3 is just a writer.


        const reqAddReader = await StateMessageOperations.assembleAddIndexerMessage(admin.wallet, reader1.wallet.address);

        const adminSignedLengthBefore = admin.msb.state.getSignedLength()
        const indexer1SignedLengthBefore = indexer1.msb.state.getSignedLength();
        const indexer2SignedLengthBefore = indexer2.msb.state.getSignedLength();

        await admin.msb.state.append(reqAddReader);
        await tryToSyncWriters(admin, indexer1, indexer2);
        const adminSignedLengthAfter = admin.msb.state.getSignedLength();
        const indexer1SignedLengthAfter = indexer1.msb.state.getSignedLength();
        const indexer2SignedLengthAfter = indexer2.msb.state.getSignedLength();

        const indexersEntry = await admin.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);
        const nodeInfo = await admin.msb.state.getNodeEntry(reader1.wallet.address);

        t.is(formattedIndexersEntry.count, indexersEntryAddressesCount, `Indexers entry count should be ${indexersEntryAddressesCount}`);
        t.is(formattedIndexersEntry.addresses.includes(reader1.wallet.address), false, 'Reader address should not be included in the indexers entry');
        t.is(nodeInfo, null, 'Node info should be null for reader');
        t.is(adminSignedLengthBefore, adminSignedLengthAfter, 'Admin signed length should not change');
        t.is(indexer1SignedLengthBefore, indexer1SignedLengthAfter, 'Indexer1 signed length should not change');
        t.is(indexer2SignedLengthBefore, indexer2SignedLengthAfter, 'Indexer2 signed length should not change');
    } catch (error) {
        t.fail('Failed to add indexer: ' + error.message);
    }
});

test('handleApplyAddIndexerOperation (apply) - Append addIndexer payload into the base - candidate is not a writer, but whitelisted', async t => {
    try {
        // indexer1 is already an indexer.
        // indexer2 is already an indexer.
        // reader1 is just a reading node.
        // reader2 is just a reading node -> will be whitelisted -> wil try to become an indexer but will not be able to.
        // indexer3 is just a writer.

        const adminSignedLengthBefore = admin.msb.state.getSignedLength();


        const reqAddIndexer2 = await StateMessageOperations.assembleAddIndexerMessage(admin.wallet, reader2.wallet.address);
        await admin.msb.state.append(reqAddIndexer2);
        await tryToSyncWriters(admin, indexer1, indexer2);


        const adminSignedLengthAfter = admin.msb.state.getSignedLength();

        const indexersEntryAfterWhitelist = await admin.msb.state.getIndexersEntry();
        const formattedIndexersEntryAfterWhitelist = formatIndexersEntry(indexersEntryAfterWhitelist);
        const nodeEntry = await admin.msb.state.getNodeEntry(reader2.wallet.address);

        t.is(formattedIndexersEntryAfterWhitelist.count, indexersEntryAddressesCount, `Indexers entry count should be ${indexersEntryAddressesCount}`);
        t.is(formattedIndexersEntryAfterWhitelist.addresses.includes(reader2.wallet.address), false, 'Reader address should not be included in the indexers entry');
        t.is(nodeEntry.isIndexer, false, 'Node info should not indicate that the node is an indexer');
        t.is(adminSignedLengthBefore, adminSignedLengthAfter, 'Admin signed length should not change');

    } catch (error) {
        t.fail('Failed to add indexer: ' + error.message);
    }
});

test('handleApplyAddIndexerOperation (apply) - Append addIndexer payload into the base by non admin node (writer)', async t => {
    try {
        // indexer1 is already an indexer.
        // indexer2 is already an indexer.
        // reader1 is just a reading node.
        // reader2 is just a reading node.
        // indexer3 is just a writer -> writer will try to add indexer3 as an indexer, however it won't be able to because it is not an admin.
        // writer is just a writer.
        const adminSignedLengthBefore = admin.msb.state.getSignedLength();

        const assembledAddIndexerMessage = await StateMessageOperations.assembleAddIndexerMessage(admin.wallet, indexer3.wallet.address);

        await writer.msb.state.append(assembledAddIndexerMessage);
        await tryToSyncWriters(admin, writer, indexer1, indexer2);

        await waitForNodeState(writer, indexer3.wallet.address, {
            wk: indexer3.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: true,
            isIndexer: false,
        })

        const adminSignedLengthAfter = admin.msb.state.getSignedLength();

        const indexersEntry = await writer.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);
        const nodeEntry = await writer.msb.state.getNodeEntry(indexer3.wallet.address);

        t.is(formattedIndexersEntry.count, indexersEntryAddressesCount, `Indexers entry count should be ${indexersEntryAddressesCount}`);
        t.is(formattedIndexersEntry.addresses.includes(indexer3.wallet.address), false, 'Indexer address should not be included in the indexers entry');
        t.is(nodeEntry.isIndexer, false, 'Node info should indicate that the node is not an indexer');
        t.is(adminSignedLengthBefore, adminSignedLengthAfter, 'Admin signed length should not change');
    } catch (error) {
        t.fail('Failed to add indexer: ' + error.message);
    }
});


hook('Clean up addIndexer setup', async t => {
    if (admin && admin.msb) await admin.msb.close();
    if (indexer1 && indexer1.msb) await indexer1.msb.close();
    if (indexer2 && indexer2.msb) await indexer2.msb.close();
    if (reader2 && reader2.msb) await reader2.msb.close();
    if (reader1 && reader1.msb) await reader1.msb.close();
    if (indexer3 && indexer3.msb) await indexer3.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});
