import {test, hook, solo} from 'brittle';
import b4a from 'b4a';

import {
    setupMsbAdmin,
    setupMsbPeer,
    setupWhitelist,
    fundPeer,
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
import PartialStateMessageOperations from "../../src/messages/partialStateMessages/PartialStateMessageOperations.js";
import CompleteStateMessageOperations from '../../src/messages/completeStateMessages/CompleteStateMessageOperations.js';
import {ZERO_WK} from '../../src/utils/buffer.js';
import { $TNK } from '../../src/core/state/utils/balance.js';

let admin, writer1, writer2, writer3, writer4, indexer1, tmpDirectory;

hook('Initialize nodes for addWriter tests', async t => {

    const randomChannel = randomBytes(32).toString('hex');
    const baseOptions = {
        enable_txlogs: false,
        enable_interactive_mode: false,
        enable_role_requester: false,
        channel: randomChannel,
        enable_validator_observer: true
    }
    tmpDirectory = await initTemporaryDirectory();
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);
    writer1 = await setupMsbPeer('writer1', testKeyPair2, tmpDirectory, admin.options); // just a peer, not a writer yet
    await fundPeer(admin, writer1, $TNK(10n))
    writer2 = await setupMsbPeer('writer2', testKeyPair3, tmpDirectory, admin.options); // just a peer, not a writer yet
    await fundPeer(admin, writer2, $TNK(10n))
    writer3 = await setupMsbPeer('writer3', testKeyPair4, tmpDirectory, admin.options); // just a peer, not a writer yet
    await fundPeer(admin, writer3, $TNK(10n))
    writer4 = await setupMsbPeer('writer4', testKeyPair5, tmpDirectory, admin.options); // just a peer, not a writer yet
    indexer1 = await setupMsbWriter(admin, 'indexer1', testKeyPair6, tmpDirectory, admin.options);
    await fundPeer(admin, indexer1, $TNK(10n))

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
        await writer1.msb.state.append(null);
        const validity = await writer1.msb.state.getIndexerSequenceState()
        const req = await PartialStateMessageOperations.assembleAddWriterMessage(
            writer1.wallet,
            b4a.toString(writer1.msb.state.writingKey, 'hex'),
            b4a.toString(validity, 'hex')
        );

        await writer1.msb.broadcastPartialTransaction(req); // Send `add writer` request to apply function

        await tryToSyncWriters(writer1, admin, indexer1);

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

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - doesnt change the signed length', async (t) => {
    try {
        // writer1 is already a writer.
        // writer2 is not a writer yet, but it is whitelisted -> It will become a writer after the operation.
        // writer3 is not a writer yet, but it is whitelisted.
        // writer4 is reader
        // indexer1 is already an indexer.
        await writer2.msb.state.append(null);
        const validity = await writer2.msb.state.getIndexerSequenceState()
        const reqAddWriter = await PartialStateMessageOperations.assembleAddWriterMessage(
            writer2.wallet,
            b4a.toString(writer2.msb.state.writingKey, 'hex'),
            b4a.toString(validity, 'hex')
        );

        await writer2.msb.broadcastPartialTransaction(reqAddWriter); // Send `add writer` request to apply function

        await tryToSyncWriters(writer2, admin, indexer1);

        await waitForNodeState(writer2, writer2.wallet.address, {
            wk: writer2.msb.state.writingKey,
            isWhitelisted: true,
            isWriter: true,
            isIndexer: false
        });

        const signedLengthAdminBefore = admin.msb.state.getSignedLength();
        const signedLengthWriter2Before = writer2.msb.state.getSignedLength();

        const validity2 = await writer2.msb.state.getIndexerSequenceState()
        const reqAddWriterAgain = await PartialStateMessageOperations.assembleAddWriterMessage(
            writer2.wallet,
            b4a.toString(writer2.msb.state.writingKey, 'hex'),
            b4a.toString(validity2, 'hex')
        );

        await writer2.msb.broadcastPartialTransaction(reqAddWriterAgain);

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

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - ZERO_WK', async (t) => {
    try {
        // writer1 is already a writer.
        // writer2 is already a writer.
        // writer3 is not a writer yet, but it is whitelisted and won't become a writer.
        // writer4 is reader
        // indexer1 is already an indexer.
        await writer3.msb.state.append(null);
        const validity = await writer3.msb.state.getIndexerSequenceState()
        const reqAddWriter = await PartialStateMessageOperations.assembleAddWriterMessage(
            writer3.wallet,
            b4a.toString(ZERO_WK, 'hex'),
            b4a.toString(validity, 'hex')
        );

        const signedLengthAdminBefore = admin.msb.state.getSignedLength();
        const signedLengthWriter1Before = writer1.msb.state.getSignedLength();
        await writer3.msb.broadcastPartialTransaction(reqAddWriter);
        await tryToSyncWriters(writer3, admin, writer1, writer2, indexer1);

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
        await indexer1.msb.state.append(null);
        const validity = await indexer1.msb.state.getIndexerSequenceState()
        const reqAddWriter = await PartialStateMessageOperations.assembleAddWriterMessage(
            indexer1.wallet,
            b4a.toString(indexer1.msb.state.writingKey, 'hex'),
            b4a.toString(validity, 'hex')
        );

        const signedLengthAdminBefore = admin.msb.state.getSignedLength();
        const signedLengthIndexer1Before = indexer1.msb.state.getSignedLength();

        await indexer1.msb.broadcastPartialTransaction(reqAddWriter); // Send `add writer` request to apply function
        await tryToSyncWriters(indexer1, admin, writer1, writer2);

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

solo('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - non-whitelisted peer', async (t) => {
    try {
        // writer1 is already a writer
        // writer2 is already a writer
        // writer3 is already a writer
        // writer4 is reader -> this node will not become a writer.
        // indexer1 is already an indexer

        await writer4.msb.state.append(null);
        const validity = await writer3.msb.state.getIndexerSequenceState()
        const reqAddWriter = await PartialStateMessageOperations.assembleAddWriterMessage(
            writer4.wallet,
            b4a.toString(writer4.msb.state.writingKey, 'hex'),
            b4a.toString(validity, 'hex')
        );
        const signedLengthAdminBefore = admin.msb.state.getSignedLength();

        await writer4.msb.broadcastPartialTransaction(reqAddWriter); // Send `add writer` request to apply function
        await tryToSyncWriters(writer4, writer1, writer2, writer3, indexer1);
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

test('handleApplyAddWriterOperation (apply) - validator and invoker are the same', async (t) => {
    // TODO: Implement when apply tests are fixed
    t.pass('Skipping test: Placeholder. To be implemented later.');
});

hook('Clean up addWriter setup', async t => {
    const toClose = []
    // close msb instances and remove temp directory
    if (admin?.msb) toClose.push(admin.msb.close());
    if (writer1?.msb) toClose.push(writer1.msb.close());
    if (writer2?.msb) toClose.push(writer2.msb.close());
    if (writer3?.msb) toClose.push(writer3.msb.close());
    if (writer4?.msb) toClose.push(writer4.msb.close());
    if (indexer1?.msb) toClose.push(indexer1.msb.close());

    await Promise.all(toClose)
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
})
