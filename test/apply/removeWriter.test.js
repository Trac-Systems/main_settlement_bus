import {test, hook} from 'brittle';
import b4a from 'b4a';

import {
    tick,
    setupMsbAdmin,
    initTemporaryDirectory,
    removeTemporaryDirectory,
    setupMsbWriter,
    randomBytes,
    setupNodeAsWriter,
    setupMsbIndexer,
    tryToSyncWriters,
    waitForNotIndexer, waitForNodeState,
} from '../utils/setupApplyTests.js';
import {formatIndexersEntry} from '../../src/utils/helpers.js';
import {
    testKeyPair1,
    testKeyPair2,
    testKeyPair3,
    testKeyPair4,
    testKeyPair5,
    testKeyPair6
} from '../fixtures/apply.fixtures.js';
import CompleteStateMessageOperations from '../../src/messages/completeStateMessages/CompleteStateMessageOperations.js';


let admin, writer1, writer2, writer3, writer4, indexer, tmpDirectory;

hook('Initialize nodes for removeWriter tests', async t => {
    tmpDirectory = await initTemporaryDirectory()
    const randomChannel = randomBytes(32).toString('hex');

    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, {
        enable_txlogs: false,
        enable_interactive_mode: false,
        enable_role_requester: false,
        enable_validator_observer: false,
        channel: randomChannel,
    });
    writer1 = await setupMsbWriter(admin, 'writer', testKeyPair2, tmpDirectory, admin.options);
    writer2 = await setupMsbWriter(admin, 'writer2', testKeyPair3, tmpDirectory, admin.options);
    writer3 = await setupMsbWriter(admin, 'writer3', testKeyPair4, tmpDirectory, admin.options);
    writer4 = await setupMsbWriter(admin, 'writer4', testKeyPair5, tmpDirectory, admin.options);

    indexer = await setupMsbWriter(admin, 'indexer', testKeyPair6, tmpDirectory, admin.options);
    indexer = await setupMsbIndexer(indexer, admin);
})

test('handleApplyRemoveWriterOperation (apply) - Append removeWriter payload into the base - happy path', async (t) => {
    try {
        // writer1 is already a writer ->  this writer will lose its writer status
        // writer2 is already a writer
        // writer3 is already a writer
        // writer4 is already a writer
        // indexer is already an indexer
        const reqRemoveWriter = await CompleteStateMessageOperations.assembleRemoveWriterMessage(
            writer1.wallet,
            writer1.msb.state.writingKey,
        );

        await admin.msb.state.append(reqRemoveWriter);
        await tryToSyncWriters(admin, writer2, writer3, writer4, indexer);
        await waitForNodeState(writer2, writer1.wallet.address, {
            wk: writer1.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: false,
            isIndexer: false,
        })

        const resultRemoveWriter = await writer2.msb.state.getNodeEntry(writer1.wallet.address); // check if the writer entry was removed successfully in the base

        t.ok(resultRemoveWriter, 'Result should not be null');
        t.ok(b4a.equals(resultRemoveWriter.wk, writer1.msb.state.writingKey), 'Result writing key should match writer writing key');
        t.is(resultRemoveWriter.isWriter, false, 'Node should not be a writer anymore');
        t.is(resultRemoveWriter.isIndexer, false, 'Result should not indicate that the peer is an indexer');
        t.is(writer1.msb.state.isWritable(), false, 'peer should not be writable');

    } catch (error) {
        t.fail('Failed to remove writer: ' + error.message);
    }

});

test('handleApplyRemoveWriterOperation (apply) - Append removeWriter payload into the base - idempotency', async (t) => {
    try {
        // writer1 is not a writer.
        // writer2 is already a writer -> this writer will lose its writer status
        // writer3 is already a writer
        // writer4 is already a writer
        // indexer is already an indexer.
        const reqRemoveWriter = await CompleteStateMessageOperations.assembleRemoveWriterMessage(
            writer2.wallet,
            writer2.msb.state.writingKey,
        );

        await admin.msb.state.append(reqRemoveWriter);
        await tryToSyncWriters(admin, writer3, writer4, indexer);
        await waitForNodeState(writer3, writer2.wallet.address, {
            wk: writer2.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: false,
            isIndexer: false,
        });

        const reqRemoveWriterAgain = await CompleteStateMessageOperations.assembleRemoveWriterMessage(
            writer2.wallet,
            writer2.msb.state.writingKey,
        );


        const signedLengthAdminBefore = admin.msb.state.getSignedLength();
        const signedLengthWriter3Before = writer3.msb.state.getSignedLength();

        await admin.msb.state.append(reqRemoveWriterAgain); // Send `add writer` request to apply function
        await tryToSyncWriters(admin, writer3, writer4, indexer);
        await waitForNodeState(writer3, writer2.wallet.address, {
            wk: writer2.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: false,
            isIndexer: false,
        });


        const signedLengthAdminAfter = admin.msb.state.getSignedLength();
        const signedLengthWriter3After = writer3.msb.state.getSignedLength();

        t.is(signedLengthAdminBefore, signedLengthAdminAfter, 'Admin signed length should not change');
        t.is(signedLengthWriter3Before, signedLengthWriter3After, 'Writer3 signed length should not change');

    } catch (error) {
        t.fail('Failed to remove writer: ' + error.message);
    }

});

test('handleApplyRemoveWriterOperation (apply) - Append removeWriter payload into the base by non admin node', async (t) => {
    // writer1 is not a writer.
    // writer2 is not a writer
    // writer3 is already a writer -> This node will try to remove writer4 by signed message by writer4.
    // writer4 is already a writer.
    // indexer is already an indexer.

    const reqRemoveWriter4 = await CompleteStateMessageOperations.assembleRemoveWriterMessage(
        writer4.wallet,
        writer4.msb.state.writingKey,
    );

    await writer3.msb.state.append(reqRemoveWriter4);
    await writer3.msb.state.base.flush();
    await tryToSyncWriters(admin, writer3, writer4, indexer);
    await waitForNodeState(writer3, writer4.wallet.address, {
        wk: writer4.msb.state.writingKey,
        isWhitelisted: true,
        isWriter: false,
        isIndexer: false,
    });

    const result = await writer3.msb.state.getNodeEntry(writer4.wallet.address);

    t.ok(result, 'Result should not be null');
    t.is(result.isWriter, false, 'Result should not indicate that the peer is a writer');
    t.is(writer4.msb.state.isWritable(), false, 'peer should not be writable');
});

test('handleApplyRemoveWriterOperation (apply) - Append removeWriter payload into the base - indexer will NOT be removed', async (t) => {
    // writer1 is not a writer.
    // writer2 is not a writer
    // writer3 is already a writer.
    // writer4 is already a writer.
    // indexer is already an indexer.
    try {
        const reqRemoveWriter = await CompleteStateMessageOperations.assembleRemoveWriterMessage(
            indexer.wallet,
            indexer.msb.state.writingKey,
        );

        await admin.msb.state.append(reqRemoveWriter);
        await tryToSyncWriters(admin, writer3, writer4);

        await waitForNodeState(writer3, indexer.wallet.address, {
            wk: indexer.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: false,
            isIndexer: false,
        })

        await waitForNotIndexer(indexer);
        await writer3.msb.state.getNodeEntry(indexer.wallet.address);
        const indexersEntry = await writer3.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);

        t.ok(indexersEntry, 'Indexers entry should not be null');
        t.is(formattedIndexersEntry.addresses.includes(indexer.wallet.address), true, 'Indexer address should still be included in indexers entry');
        t.is(indexer.msb.state.isWritable(), true, 'Peer should remain writable');
    } catch (error) {
        t.fail('Failed to remove writer: ' + error.message);
    }
})

test('handleApplyRemoveWriterOperation (apply) - validator and invoker are the same', async (t) => {
    // TODO: Implement when apply tests are fixed
    t.pass('Skipping test: Placeholder. To be implemented later.');
});

hook('Clean up removeWriter setup', async t => {
    // close msb instances and remove temp directory
    if (admin && admin.msb) await admin.msb.close();
    if (writer1 && writer1.msb) await writer1.msb.close();
    if (writer2 && writer2.msb) await writer2.msb.close();
    if (writer3 && writer3.msb) await writer3.msb.close();
    if (writer4 && writer4.msb) await writer4.msb.close();
    if (indexer && indexer.msb) await indexer.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
})
