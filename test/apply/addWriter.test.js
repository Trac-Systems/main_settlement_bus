import {test, hook} from 'brittle';
import b4a from 'b4a';

import {
    setupMsbAdmin,
    setupMsbPeer,
    setupWhitelist,
    initTemporaryDirectory,
    removeTemporaryDirectory,
    randomBytes,
    setupMsbIndexer,
    setupMsbWriter,
    tryToSyncWriters,
    waitForNodeState
} from '../utils/setupApplyTests.js';
import {
    testKeyPair1,
    testKeyPair2,
    testKeyPair3,
    testKeyPair4,
    testKeyPair5,
    testKeyPair6
} from '../fixtures/apply.fixtures.js';
import StateMessageOperations from '../../src/messages/stateMessages/StateMessageOperations.js';
import {ZERO_WK} from '../../src/utils/buffer.js';

let admin, writer1, writer2, writer3, writer4, indexer1, tmpDirectory;

hook('Initialize nodes for addWriter tests', async t => {

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
    writer1 = await setupMsbPeer('writer1', testKeyPair2, tmpDirectory, admin.options); // just a peer, not a writer yet
    writer2 = await setupMsbPeer('writer2', testKeyPair3, tmpDirectory, admin.options); // just a peer, not a writer yet
    writer3 = await setupMsbPeer('writer3', testKeyPair4, tmpDirectory, admin.options); // just a peer, not a writer yet
    writer4 = await setupMsbPeer('writer4', testKeyPair5, tmpDirectory, admin.options); // just a peer, not a writer yet
    indexer1 = await setupMsbWriter(admin, 'indexer1', testKeyPair6, tmpDirectory, admin.options);

    const whitelistKeys = [writer1.wallet.address, writer2.wallet.address, writer3.wallet.address, indexer1.wallet.address];
    await setupWhitelist(admin, whitelistKeys);
    indexer1 = await setupMsbIndexer(indexer1, admin);

});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - happy path for peer', async (t) => {
    try {
        // writer1 is not a writer yet, but it is whitelisted -> It will become a writer after the operation.
        // writer2 is not a writer yet, but it is whitelisted.
        // writer3 is not a writer yet, but it is whitelisted.
        // writer4 is reader
        // indexer1 is already an indexer.
        const req = await StateMessageOperations.assembleAddWriterMessage(
            writer1.wallet,
            writer1.msb.state.writingKey,
        );

        await admin.msb.state.append(req); // Send `add writer` request to apply function

        await tryToSyncWriters(admin, indexer1);

        await waitForNodeState(admin, writer1.wallet.address, {
            wk: writer1.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: true,
            isIndexer: false
        });

        const result = await admin.msb.state.getNodeEntry(writer1.wallet.address); // check if the writer entry was added successfully in the base

        t.ok(result, 'Result should not be null');
        t.ok(b4a.equals(result.wk, writer1.msb.state.writingKey), 'Result writing key should match writer writing key');
        t.ok(result.isWriter, 'Result should indicate that the peer is a valid writer');
        t.is(result.isIndexer, false, 'Result should not indicate that the peer is an indexer');
    } catch (error) {
        t.fail('Failed to add writer: ' + error.message);
    }

});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - idempotence', async (t) => {
    try {
        // writer1 is already a writer.
        // writer2 is not a writer yet, but it is whitelisted -> It will become a writer after the operation.
        // writer3 is not a writer yet, but it is whitelisted.
        // writer4 is reader
        // indexer1 is already an indexer.


        const reqAddWriter = await StateMessageOperations.assembleAddWriterMessage(
            writer2.wallet,
            writer2.msb.state.writingKey,
        );

        await admin.msb.state.append(reqAddWriter);

        await tryToSyncWriters(admin, writer2, indexer1);

        await waitForNodeState(writer2, writer2.wallet.address, {
            wk: writer2.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: true,
            isIndexer: false
        });

        const signedLengthAdminBefore = admin.msb.state.getSignedLength();
        const signedLengthWriter2Before = writer2.msb.state.getSignedLength();

        const reqAddWriterAgain = await StateMessageOperations.assembleAddWriterMessage(
            writer2.wallet,
            writer2.msb.state.writingKey,
        );
        await admin.msb.state.append(reqAddWriterAgain);

        await tryToSyncWriters(admin, writer2, indexer1);
        await waitForNodeState(writer2, writer2.wallet.address, {
            wk: writer2.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: true,
            isIndexer: false
        });


        const signedLengthAdminAfter = admin.msb.state.getSignedLength();
        const signedLengthWriter2After = writer2.msb.state.getSignedLength();

        t.is(signedLengthAdminBefore, signedLengthAdminAfter, 'Admin signed length should not change');
        t.is(signedLengthWriter2Before, signedLengthWriter2After, 'Writer2 signed length should not change');
    } catch (error) {
        t.fail('Failed to add writer: ' + error.message);
    }

});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base by non admin node', async (t) => {
    try {
        // writer1 is already a writer.
        // writer2 is already a writer.
        // writer3 is not a writer yet, but it is whitelisted and won't become a writer.
        //writer4 is reader
        // indexer1 is already an indexer.


        const reqAddWriter = await StateMessageOperations.assembleAddWriterMessage(
            writer3.wallet,
            writer3.msb.state.writingKey,
        );

        const signedLengthWriter1Before = writer1.msb.state.getSignedLength();

        await writer1.msb.state.append(reqAddWriter); // Send `add writer` request to apply function

        await tryToSyncWriters(admin, writer1, indexer1);
        await waitForNodeState(writer1, writer3.wallet.address, {
            wk: ZERO_WK,
            isWhitelisted: true,
            isWriter: false,
            isIndexer: false
        });

        const writer1Result = await writer1.msb.state.getNodeEntry(writer3.wallet.address);

        const signedLengthWriter1After = writer1.msb.state.getSignedLength();


        t.is(signedLengthWriter1Before, signedLengthWriter1After, 'Writer1 signed length should not change');
        t.ok(writer1Result, 'Result should not be null - writer2 is whitelisted but not a writer');
        t.ok(!b4a.equals(writer1Result.wk, writer3.msb.state.writingKey), 'Result writing key should not match writer writing key');
        t.ok(b4a.equals(writer1Result.wk, ZERO_WK), 'Result writing key should be ZERO_WK');
        t.is(writer1Result.isWriter, false, 'Result should indicate that the peer is not a writer');


    } catch (error) {
        t.fail('Failed to add writer: ' + error.message);
    }
});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - ZERO_WK', async (t) => {
    try {
        // writer1 is already a writer.
        // writer2 is already a writer.
        // writer3 is not a writer yet, but it is whitelisted and won't become a writer.
        // writer4 is reader
        // indexer1 is already an indexer.

        const reqAddWriter = await StateMessageOperations.assembleAddWriterMessage(
            writer3.wallet,
            ZERO_WK,
        );

        const signedLengthAdminBefore = admin.msb.state.getSignedLength();
        const signedLengthWriter1Before = writer1.msb.state.getSignedLength();
        await admin.msb.state.append(reqAddWriter);
        await tryToSyncWriters(admin, writer1, writer2, indexer1);

        const result = await writer1.msb.state.getNodeEntry(writer3.wallet.address);

        const signedLengthAdminAfter = admin.msb.state.getSignedLength();
        const signedLengthWriter1After = writer1.msb.state.getSignedLength();

        t.is(signedLengthAdminBefore, signedLengthAdminAfter, 'admin signed length should not change');
        t.is(signedLengthWriter1Before, signedLengthWriter1After, 'Writer1 signed length should not change');
        t.ok(result, 'Result should not be null');
        t.ok(!b4a.equals(result.wk, writer3.msb.state.writingKey), 'Result writing key should not match writer writing key');
        t.ok(b4a.equals(result.wk, ZERO_WK), 'Result writing key should be ZERO_WK');
        t.is(result.isWriter, false, 'Result should indicate that the peer is not a writer');
        //t.is(writer3.msb.state.isWritable(), false, 'peer should not be writable');


    } catch (error) {
        t.fail('Failed to add writer: ' + error.message);
    }
});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - node is already an indexer', async (t) => {
    // writer1 is already a writer.
    // writer2 is already a writer.
    // writer3 is not a writer, but it is whitelisted.
    // writer4 is reader
    // indexer1 is already an indexer.
    try {
        const reqAddWriter = await StateMessageOperations.assembleAddWriterMessage(
            indexer1.wallet,
            indexer1.msb.state.writingKey,
        );

        const signedLengthAdminBefore = admin.msb.state.getSignedLength();
        const signedLengthIndexer1Before = indexer1.msb.state.getSignedLength();

        await admin.msb.state.append(reqAddWriter); // Send `add writer` request to apply function
        await tryToSyncWriters(admin, writer1, writer2, indexer1);

        const result = await admin.msb.state.getNodeEntry(indexer1.wallet.address); // check if the writer entry was added successfully in the base

        const signedLengthAdminAfter = admin.msb.state.getSignedLength();
        const signedLengthIndexer1After = indexer1.msb.state.getSignedLength();

        t.is(signedLengthAdminBefore, signedLengthAdminAfter, 'Admin signed length should not change');
        t.is(signedLengthIndexer1Before, signedLengthIndexer1After, 'Indexer1 signed length should not change');
        t.ok(result, 'Result should not be null');
        t.ok(b4a.equals(result.wk, indexer1.msb.state.writingKey), 'Result writing key should match writer writing key');
        t.is(result.isWriter, true, 'Result should indicate that the peer is a writer');
        t.is(result.isIndexer, true, 'Result should indicate that the peer is an indexer');

        t.is(indexer1.msb.state.isWritable(), true, 'peer should still be writable');
        t.is(indexer1.msb.state.isIndexer(), true, 'peer should still be an indexer');

    } catch (error) {
        t.fail('Failed to add writer: ' + error.message);
    }
});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - banned writer', async (t) => {
    // writer1 is already a writer
    // writer2 is already a writer
    // writer3 is not a writer -> this node will become a writer -> this node will be banned -> this node will become writer again.
    // writer4 is reader
    // indexer1 is already an indexer

    try {
        const reqAddWriter = await StateMessageOperations.assembleAddWriterMessage(
            writer3.wallet,
            writer3.msb.state.writingKey,
        );

        await admin.msb.state.append(reqAddWriter); // Send `add writer` request to apply function

        await waitForNodeState(writer3, writer3.wallet.address, {
            wk: writer3.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: true,
            isIndexer: false
        });
        await waitForNodeState(writer2, writer3.wallet.address, {
            wk: writer3.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: true,
            isIndexer: false
        });

        await tryToSyncWriters(admin, writer1, writer2, writer3, indexer1);

        const result = await writer3.msb.state.getNodeEntry(writer3.wallet.address);

        t.ok(writer3.msb.state.isWritable(), 'writer3 should be writable');
        t.ok(result, 'Result should not be null');
        t.ok(b4a.equals(result.wk, writer3.msb.state.writingKey), 'Result writing key should match writer writing key');
        t.ok(result.isWriter, 'Result should indicate that the peer is a valid writer');

        const reqBanWriter = await StateMessageOperations.assembleBanWriterMessage(
            admin.wallet,
            writer3.wallet.address,
        );

        await admin.msb.state.append(reqBanWriter);
        await tryToSyncWriters(admin, writer1, writer2, indexer1);

        await waitForNodeState(writer2, writer3.wallet.address, {
            wk: writer3.msb.state.writingKey,
            isWhitelisted: false,
            isWriter: false,
            isIndexer: false
        });

        const resultAfterBan = await writer2.msb.state.getNodeEntry(writer3.wallet.address);
        t.is(resultAfterBan.isWhitelisted, false, 'Result after ban should indicate that the peer is not whitelisted');
        t.is(resultAfterBan.isWriter, false, 'Result after ban should indicate that the peer is not a valid writer');
        t.is(writer3.msb.state.isWritable(), false, 'writer3 should not be writable');


        const whitelistKeys = [writer3.wallet.address];
        await setupWhitelist(admin, whitelistKeys);
        await tryToSyncWriters(admin, writer1, writer2, indexer1);
        await waitForNodeState(writer1, writer3.wallet.address, {
            wk: writer3.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: false,
            isIndexer: false
        });
        const resultAfterWhitelising = await writer1.msb.state.getNodeEntry(writer3.wallet.address);
        t.is(resultAfterWhitelising.isWhitelisted, true, 'Result after whitelisting should indicate that the peer is not whitelisted');

        const reqAddWriterAgain = await StateMessageOperations.assembleAddWriterMessage(
            writer3.wallet,
            writer3.msb.state.writingKey,
        );


        await admin.msb.state.append(reqAddWriterAgain);
        await waitForNodeState(writer3, writer3.wallet.address, {
            wk: writer3.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: true,
            isIndexer: false
        });
        await waitForNodeState(writer2, writer3.wallet.address, {
            wk: writer3.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: true,
            isIndexer: false
        });
        await tryToSyncWriters(admin, writer1, writer2, writer3, indexer1);


        const resultAfterAddWriter3 = await writer2.msb.state.getNodeEntry(writer3.wallet.address);

        t.is(resultAfterAddWriter3.isWhitelisted, true, 'Result should indicate that the peer is whitelisted');
        t.is(resultAfterAddWriter3.isWriter, true, 'Result should indicate that the peer is a valid writer');
    } catch (error) {
        t.fail('Failed to add writer: ' + error.message);
    }
});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - non-whitelisted peer', async (t) => {
    try {
        // writer1 is already a writer
        // writer2 is already a writer
        // writer3 is already a writer
        // writer4 is reader -> this node will not become a writer.
        // indexer1 is already an indexer

        const reqAddWriter = await StateMessageOperations.assembleAddWriterMessage(
            writer4.wallet,
            writer4.msb.state.writingKey,
        );
        const signedLengthAdminBefore = admin.msb.state.getSignedLength();

        await admin.msb.state.append(reqAddWriter); // Send `add writer` request to apply function
        await tryToSyncWriters(admin, writer1, writer2, writer3, indexer1);
        const result = await writer2.msb.state.getNodeEntry(writer4.wallet.address); // check if the writer entry was added successfully in the base

        const signedLengthAdminAfter = admin.msb.state.getSignedLength();

        t.is(signedLengthAdminBefore, signedLengthAdminAfter, 'Admin signed length should not change');
        t.is(writer4.msb.state.isWritable(), false, 'peer should not be writable');
        t.is(writer4.msb.state.isIndexer(), false, 'peer should not be an indexer');
        t.is(result, null, 'Result should be null');

    } catch (error) {
        t.fail('Failed to add writer: ' + error.message);
    }
});

hook('Clean up addWriter setup', async t => {
    // close msb instances and remove temp directory
    if (admin && admin.msb) await admin.msb.close();
    if (writer1 && writer1.msb) await writer1.msb.close();
    if (writer2 && writer2.msb) await writer2.msb.close();
    if (writer3 && writer3.msb) await writer3.msb.close();
    if (writer4 && writer4.msb) await writer4.msb.close();
    if (indexer1 && indexer1.msb) await indexer1.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
})
