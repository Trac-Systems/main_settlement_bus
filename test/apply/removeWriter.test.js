import {test, hook, solo} from 'brittle';
import b4a from 'b4a';
import {
    setupMsbAdmin,
    initTemporaryDirectory,
    removeTemporaryDirectory,
    setupMsbWriter,
    randomBytes,
    setupMsbIndexer,
    tryToSyncWriters,
    waitForNotIndexer,
    waitForNodeState,
    fundPeer
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
import PartialStateMessageOperations from '../../src/messages/partialStateMessages/PartialStateMessageOperations.js';

let admin, writer1, writer2, writer3, writer4, indexer, tmpDirectory;

hook('Initialize nodes for removeWriter tests', async () => {
    tmpDirectory = await initTemporaryDirectory()
    const randomChannel = randomBytes(32).toString('hex');

    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, {
        enable_txlogs: false,
        enable_interactive_mode: false,
        enable_role_requester: false,
        enable_validator_observer: true,
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
        const validity = await admin.msb.state.getIndexerSequenceState()
        const reqRemoveWriter = await PartialStateMessageOperations.assembleRemoveWriterMessage(
            writer1.wallet,
            b4a.toString(writer1.msb.state.writingKey, 'hex'),
            b4a.toString(validity, 'hex')
        );

        await writer2.msb.broadcastPartialTransaction(reqRemoveWriter);
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
        const validity = await admin.msb.state.getIndexerSequenceState()
        const reqRemoveWriter = await PartialStateMessageOperations.assembleRemoveWriterMessage(
            writer2.wallet,
            b4a.toString(writer2.msb.state.writingKey, 'hex'),
            b4a.toString(validity, 'hex')
        );

        await writer3.msb.broadcastPartialTransaction(reqRemoveWriter);
        await tryToSyncWriters(admin, writer3, writer4, indexer);
        await waitForNodeState(writer3, writer2.wallet.address, {
            wk: writer2.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: false,
            isIndexer: false,
        });

        const validityAgain = await admin.msb.state.getIndexerSequenceState()
        const reqRemoveWriterAgain = await PartialStateMessageOperations.assembleRemoveWriterMessage(
            writer2.wallet,
            b4a.toString(writer2.msb.state.writingKey, 'hex'),
            b4a.toString(validityAgain, 'hex')
        );

        const signedLengthAdminBefore = admin.msb.state.getSignedLength();
        const signedLengthWriter3Before = writer3.msb.state.getSignedLength();

        await writer3.msb.broadcastPartialTransaction(reqRemoveWriterAgain);
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

test('handleApplyRemoveWriterOperation (apply) - Append removeWriter payload into the base - indexer will NOT be removed', async (t) => {
    // writer1 is not a writer.
    // writer2 is not a writer
    // writer3 is already a writer.
    // writer4 is already a writer.
    // indexer is already an indexer.
    try {
        const validityAgain = await admin.msb.state.getIndexerSequenceState()
        const reqRemoveWriter = await PartialStateMessageOperations.assembleRemoveWriterMessage(
            indexer.wallet,
            b4a.toString(indexer.msb.state.writingKey, 'hex'),
            b4a.toString(validityAgain, 'hex')
        );

        await writer3.msb.broadcastPartialTransaction(reqRemoveWriter);
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

        t.ok(indexersEntry, 'Indexers entry should not be null');
        t.ok(indexersEntry.find(({ key }) => b4a.equals(key, indexer.msb.state.writingKey)))
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
    const toClose = []
    if (admin?.msb) toClose.push(admin.msb.close());
    if (writer1?.msb) toClose.push(writer1.msb.close());
    if (writer2?.msb) toClose.push(writer2.msb.close());
    if (writer3?.msb) toClose.push(writer3.msb.close());
    if (writer4?.msb) toClose.push(writer4.msb.close());
    if (indexer?.msb) toClose.push(indexer.msb.close());
    await Promise.all(toClose)
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
})
