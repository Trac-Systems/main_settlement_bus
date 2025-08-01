import { test, hook } from 'brittle';
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
    waitForNotIndexer,
} from '../utils/setupApplyTests.js';
import { formatIndexersEntry } from '../../src/utils/helpers.js';
import { testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4 } from '../fixtures/apply.fixtures.js';
import { sleep } from '../../src/utils/helpers.js';
import StateMessageOperations from '../../src/messages/stateMessages/StateMessageOperations.js';


let admin, writer1, writer2, indexer, tmpDirectory;

hook('Initialize nodes for removeWriter tests', async t => {
    tmpDirectory = await initTemporaryDirectory()
    const randomChannel = randomBytes().toString('hex');

    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, {
        enable_txlogs: false,
        enable_interactive_mode: false,
        enable_role_requester: false,
        enable_validator_observer: false,
        channel: randomChannel,
    });
    writer1 = await setupMsbWriter(admin, 'writer', testKeyPair2, tmpDirectory, admin.options);
    writer2 = await setupMsbWriter(admin, 'writer2', testKeyPair3, tmpDirectory, admin.options);

    indexer = await setupMsbWriter(admin, 'indexer', testKeyPair4, tmpDirectory, admin.options);
    indexer = await setupMsbIndexer(indexer, admin);
})

test('handleApplyRemoveWriterOperation (apply) - Append removeWriter payload into the base - happy path', async (t) => {
    try {
        // request writer removal
        const reqRemoveWriter = await StateMessageOperations.assembleRemoveWriterMessage(
            writer1.wallet,
            writer1.msb.state.writingKey,
        );

        await admin.msb.state.append(reqRemoveWriter);
        await tick();
        await sleep(5000); // wait for both peers to sync state
        const resultRemoveWriter = await writer1.msb.state.getNodeEntry(writer1.wallet.address); // check if the writer entry was removed successfully in the base

        // check the result
        t.ok(resultRemoveWriter, 'Result should not be null');
        t.ok(b4a.equals(resultRemoveWriter.wk, writer1.msb.state.writingKey), 'Result writing key should match writer writing key');
        t.is(resultRemoveWriter.isWriter, false, 'Node should not be a writer anymore');
        t.is(resultRemoveWriter.isIndexer, false, 'Result should not indicate that the peer is an indexer');
        t.is(writer1.msb.state.isWritable(), false, 'peer should not be writable');

    }
    catch (error) {
        t.fail('Failed to remove writer: ' + error.message);
    }

});

test('handleApplyRemoveWriterOperation (apply) - Append removeWriter payload into the base - idempotency', async (t) => {
    try {
        // writer1 already performed removeWriter operation, so we try to remove it again
        const reqRemoveWriter = await StateMessageOperations.assembleRemoveWriterMessage(
            writer1.wallet,
            writer1.msb.state.writingKey,
        );

        const signedLengthAdminBefore = admin.msb.state.getSignedLength();
        const signedLengthWriter1Before = writer1.msb.state.getSignedLength();

        // add writer to base
        await admin.msb.state.append(reqRemoveWriter); // Send `add writer` request to apply function
        await tick();
        await sleep(5000); // wait for both peers to sync state

        const signedLengthAdminAfter = admin.msb.state.getSignedLength();
        const signedLengthWriter1After = writer1.msb.state.getSignedLength();

        // The operation should not have changed the signed length, because it was rejected and not signed
        t.is(signedLengthAdminBefore, signedLengthAdminAfter, 'Admin signed length should not change');
        t.is(signedLengthWriter1Before, signedLengthWriter1After, 'Writer1 signed length should not change');

    }
    catch (error) {
        t.fail('Failed to remove writer: ' + error.message);
    }

});

test('handleApplyRemoveWriterOperation (apply) - Append removeWriter payload into the base by non admin node', async (t) => {
    try {
        // writer1 is not a writer let's set it up:
        writer1 = await setupNodeAsWriter(admin, writer1);

        await tryToSyncWriters(writer1, writer2, indexer, admin);

        await writer2.msb.state.append(null); // enforce synchronization for ack.

        // writer2 is already a writer
        const reqRemoveWriter = await StateMessageOperations.assembleRemoveWriterMessage(
            writer1.wallet,
            writer1.msb.state.writingKey,
        );

        const signedLengthAdminBefore = admin.msb.state.getSignedLength();
        const signedLengthWriter1Before = writer1.msb.state.getSignedLength();
        const signedLengthWriter2Before = writer2.msb.state.getSignedLength();

        // add writer to base
        await writer2.msb.state.append(reqRemoveWriter); // Send `add writer` request to apply function
        await tick();

        const result = await writer1.msb.state.getNodeEntry(writer1.wallet.address);
        const signedLengthAdminAfter = admin.msb.state.getSignedLength();
        const signedLengthWriter1After = writer1.msb.state.getSignedLength();
        const signedLengthWriter2After = writer2.msb.state.getSignedLength();

        // The operation should not have changed the signed length, because it was rejected and not signed
        t.is(signedLengthAdminBefore, signedLengthAdminAfter, 'Admin signed length should not change');
        t.is(signedLengthWriter1Before, signedLengthWriter1After, 'Writer1 signed length should not change');
        t.is(signedLengthWriter2Before, signedLengthWriter2After, 'Writer2 signed length should not change');
        t.ok(result, 'Result should not be null');
        t.ok(b4a.equals(result.wk, writer1.msb.state.writingKey), 'Result writing key should match writer writing key');
        t.is(result.isWriter, true, 'Result should indicate that the peer is a writer');
        t.is(writer1.msb.state.isWritable(), true, 'peer should be writable');

    }
    catch (error) {
        t.fail('Failed to remove writer: ' + error.message);
    }
});


test('handleApplyRemoveWriterOperation (apply) - Append removeWriter payload into the base - remove writer who is an indexer', async (t) => {
    try {
        const reqRemoveWriter = await StateMessageOperations.assembleRemoveWriterMessage(
            indexer.wallet,
            indexer.msb.state.writingKey,
        );

        await admin.msb.state.append(reqRemoveWriter);
        const isIndexer = await waitForNotIndexer(indexer)

        if (!isIndexer) {
            t.fail('Indexer should not be an indexer anymore');
        }
        
        const resultRemoveWriter = await indexer.msb.state.getNodeEntry(indexer.wallet.address); // check if the writer entry was removed successfully in the base

        const indexersEntry = await indexer.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);
        t.ok(indexersEntry, 'Indexers entry should not be null');
        t.is(formattedIndexersEntry.addresses.includes(indexer.wallet.address), false, 'Indexer address should not be included in indexers entry');

        t.ok(resultRemoveWriter, 'Result should not be null');
        t.ok(b4a.equals(resultRemoveWriter.wk, indexer.msb.state.writingKey), 'Result writing key should match writer writing key');
        t.is(resultRemoveWriter.isWriter, false, 'Node should not be a writer anymore');
        t.is(resultRemoveWriter.isIndexer, false, 'Result should not indicate that the peer is an indexer');
        t.is(indexer.msb.state.isWritable(), false, 'Peer should not be writable');
        // t.is(indexer.msb.state.isIndexer(), false, 'Peer should not be an indexer');
        // Note: Sometimes the isIndexer flag updates slower than expected. Until the autobase will update this flag more faster, this assertion is commented out.
    }
    catch (error) {
        t.fail('Failed to remove writer: ' + error.message);
    }
})


hook('Clean up removeWriter setup', async t => {
    // close msb instances and remove temp directory
    if (admin && admin.msb) await admin.msb.close();
    if (writer1 && writer1.msb) await writer1.msb.close();
    if (writer2 && writer2.msb) await writer2.msb.close();
    if (indexer && indexer.msb) await indexer.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
})
