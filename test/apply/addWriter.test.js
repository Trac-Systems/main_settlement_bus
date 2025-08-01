import { test, hook } from 'brittle';
import b4a from 'b4a';

import { tick, setupMsbAdmin, setupMsbPeer, setupWhitelist, initTemporaryDirectory, removeTemporaryDirectory, randomBytes, setupMsbIndexer , setupMsbWriter} from '../utils/setupApplyTests.js';
import { testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4, testKeyPair5 } from '../fixtures/apply.fixtures.js';
import { sleep } from '../../src/utils/helpers.js';
import StateMessageOperations from '../../src/messages/stateMessages/StateMessageOperations.js';
import { ZERO_WK } from '../../src/utils/buffer.js';

let admin, writer1, writer2, writer3, indexer1, tmpDirectory;

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
    writer1 = await setupMsbPeer('writer1', testKeyPair2, tmpDirectory, admin.options);
    writer2 = await setupMsbPeer('writer2', testKeyPair3, tmpDirectory, admin.options);
    writer3 = await setupMsbPeer('writer3', testKeyPair4, tmpDirectory, admin.options);
    indexer1 = await setupMsbWriter(admin, 'indexer1', testKeyPair5, tmpDirectory, admin.options);

    // set up whitelist
    const whitelistKeys = [writer1.wallet.address, writer2.wallet.address, indexer1.wallet.address];
    await setupWhitelist(admin, whitelistKeys);
    indexer1 = await setupMsbIndexer(indexer1, admin);
});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base', async (t) => {
    try {
        const req = await StateMessageOperations.assembleAddWriterMessage(
            writer1.wallet,
            writer1.msb.state.writingKey,
        );

        // add writer to base
        await admin.msb.state.append(req); // Send `add writer` request to apply function
        await tick();
        await sleep(5000); // wait for both peers to sync state
        const result = await writer1.msb.state.getNodeEntry(writer1.wallet.address); // check if the writer entry was added successfully in the base

        // check the result
        t.ok(writer1.msb.state.isWritable(), 'peer should be writable');
        t.ok(result, 'Result should not be null');
        t.ok(b4a.equals(result.wk, writer1.msb.state.writingKey), 'Result writing key should match writer writing key');
        t.ok(result.isWriter, 'Result should indicate that the peer is a valid writer');
        t.is(result.isIndexer, false, 'Result should not indicate that the peer is an indexer');
    }
    catch (error) {
        t.fail('Failed to add writer: ' + error.message);
    }

});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - idempotence', async (t) => {
    try {
        // writer1 is already added, so we try to add it again
        const reqAddWriter = await StateMessageOperations.assembleAddWriterMessage(
            writer1.wallet,
            writer1.msb.state.writingKey,
        );

        const signedLengthAdminBefore = admin.msb.state.getSignedLength();
        const signedLengthWriter1Before = writer1.msb.state.getSignedLength();

        // add writer to base
        await admin.msb.state.append(reqAddWriter); // Send `add writer` request to apply function
        await tick();
        await sleep(5000); // wait for both peers to sync state

        const signedLengthAdminAfter = admin.msb.state.getSignedLength();
        const signedLengthWriter1After = writer1.msb.state.getSignedLength();

        // The operation should not have changed the signed length, because it was rejected and not signed
        t.is(signedLengthAdminBefore, signedLengthAdminAfter, 'Admin signed length should not change');
        t.is(signedLengthWriter1Before, signedLengthWriter1After, 'Writer1 signed length should not change');
    }
    catch (error) {
        t.fail('Failed to add writer: ' + error.message);
    }

});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base by non admin node', async (t) => {
    try {
        // writer1 is already added, so we try to add it again
        // writer2 is not a writer atm, but it is whitelisted.
        const reqAddWriter = await StateMessageOperations.assembleAddWriterMessage(
            writer2.wallet,
            writer2.msb.state.writingKey,
        );

        const signedLengthAdminBefore = admin.msb.state.getSignedLength();
        const signedLengthWriter1Before = writer1.msb.state.getSignedLength();
        const signedLengthWriter2Before = writer2.msb.state.getSignedLength();

        // add writer to base
        await writer1.msb.state.append(reqAddWriter); // Send `add writer` request to apply function
        await tick();
        await sleep(5000); // wait for both peers to sync state

        const result = await writer1.msb.state.getNodeEntry(writer2.wallet.address); // check if the writer entry was added successfully in the base

        const signedLengthAdminAfter = admin.msb.state.getSignedLength();
        const signedLengthWriter1After = writer1.msb.state.getSignedLength();
        const signedLengthWriter2After = writer2.msb.state.getSignedLength();

        // The operation should not have changed the signed length, because it was rejected and not signed
        t.is(signedLengthAdminBefore, signedLengthAdminAfter, 'Admin signed length should not change');
        t.is(signedLengthWriter1Before, signedLengthWriter1After, 'Writer1 signed length should not change');
        t.is(signedLengthWriter2Before, signedLengthWriter2After, 'Writer2 signed length should not change');
        t.ok(result, 'Result should not be null');
        t.ok(!b4a.equals(result.wk, writer2.msb.state.writingKey), 'Result writing key should not match writer writing key');
        t.ok(b4a.equals(result.wk, ZERO_WK), 'Result writing key should be ZERO_WK');
        t.is(result.isWriter, false, 'Result should indicate that the peer is not a writer');
        t.is(writer2.msb.state.isWritable(), false, 'peer should not be writable');


    }
    catch (error) {
        t.fail('Failed to add writer: ' + error.message);
    }
});


test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - ZERO_WK', async (t) => {
    try {
        // writer2 is not a writer atm, but it is whitelisted.
        const reqAddWriter = await StateMessageOperations.assembleAddWriterMessage(
            writer2.wallet,
            ZERO_WK,
        );

        const signedLengthAdminBefore = admin.msb.state.getSignedLength();
        const signedLengthWriter2Before = writer2.msb.state.getSignedLength();

        // add writer to base
        await admin.msb.state.append(reqAddWriter); // Send `add writer` request to apply function
        await tick();
        await sleep(5000); // wait for both peers to sync state

        const result = await writer1.msb.state.getNodeEntry(writer2.wallet.address); // check if the writer entry was added successfully in the base

        const signedLengthAdminAfter = admin.msb.state.getSignedLength();
        const signedLengthWriter2After = writer2.msb.state.getSignedLength();

        // The operation should not have changed the signed length, because it was rejected and not signed
        t.is(signedLengthAdminBefore, signedLengthAdminAfter, 'Admin signed length should not change');
        t.is(signedLengthWriter2Before, signedLengthWriter2After, 'Writer2 signed length should not change');
        t.ok(result, 'Result should not be null');
        t.ok(!b4a.equals(result.wk, writer2.msb.state.writingKey), 'Result writing key should not match writer writing key');
        t.ok(b4a.equals(result.wk, ZERO_WK), 'Result writing key should be ZERO_WK');
        t.is(result.isWriter, false, 'Result should indicate that the peer is not a writer');
        t.is(writer2.msb.state.isWritable(), false, 'peer should not be writable');


    }
    catch (error) {
        t.fail('Failed to add writer: ' + error.message);
    }
});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - node is already an indexer', async (t) => {
    try {
        const reqAddWriter = await StateMessageOperations.assembleAddWriterMessage(
            indexer1.wallet,
            indexer1.msb.state.writingKey,
        );

        const signedLengthAdminBefore = admin.msb.state.getSignedLength();
        const signedLengthIndexer1Before = indexer1.msb.state.getSignedLength();

        // add writer to base
        await admin.msb.state.append(reqAddWriter); // Send `add writer` request to apply function
        await tick();
        await sleep(5000); // wait for both peers to sync state

        const result = await admin.msb.state.getNodeEntry(indexer1.wallet.address); // check if the writer entry was added successfully in the base

        const signedLengthAdminAfter = admin.msb.state.getSignedLength();
        const signedLengthIndexer1After = indexer1.msb.state.getSignedLength();

        // The operation should not have changed the signed length, because it was rejected and not signed
        t.is(signedLengthAdminBefore, signedLengthAdminAfter, 'Admin signed length should not change');
        t.is(signedLengthIndexer1Before, signedLengthIndexer1After, 'Indexer1 signed length should not change');
        t.ok(result, 'Result should not be null');
        console.log("result.wk", result.wk, "indexer1.msb.state.writingKey", indexer1.msb.state.writingKey)
        t.ok(b4a.equals(result.wk, indexer1.msb.state.writingKey), 'Result writing key should match writer writing key');
        t.is(result.isWriter, true, 'Result should indicate that the peer is a writer');
        t.is(result.isIndexer, true, 'Result should indicate that the peer is an indexer');

        t.is(indexer1.msb.state.isWritable(), true, 'peer should still be writable');
        t.is(indexer1.msb.state.isIndexer(), true, 'peer should still be an indexer');

    }
    catch (error) {
        t.fail('Failed to add writer: ' + error.message);
    }
});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - banned writer', async (t) => {
    try {
        const reqAddWriter = await StateMessageOperations.assembleAddWriterMessage(
            writer2.wallet,
            writer2.msb.state.writingKey,
        );

        // add writer to base
        await admin.msb.state.append(reqAddWriter); // Send `add writer` request to apply function
        await tick();
        await sleep(5000); // wait for both peers to sync state
        const result = await writer2.msb.state.getNodeEntry(writer2.wallet.address); // check if the writer entry was added successfully in the base

        // check the result
        t.ok(writer2.msb.state.isWritable(), 'peer should be writable');
        t.ok(result, 'Result should not be null');
        t.ok(b4a.equals(result.wk, writer2.msb.state.writingKey), 'Result writing key should match writer writing key');
        t.ok(result.isWriter, 'Result should indicate that the peer is a valid writer');

        const reqBanWriter = await StateMessageOperations.assembleBanWriterMessage(
            admin.wallet,
            writer2.wallet.address,
        );

        await admin.msb.state.append(reqBanWriter);
        await tick();
        await sleep(5000);

        const reqAddWriter2 = await StateMessageOperations.assembleAddWriterMessage(
            writer2.wallet,
            writer2.msb.state.writingKey,
        );

        await admin.msb.state.append(reqAddWriter2);
        await tick();
        await sleep(5000);

        const bannedResult = await writer2.msb.state.getNodeEntry(writer2.wallet.address);
        t.is(writer2.msb.state.isWritable(), false, 'peer should not be writable');
        t.ok(bannedResult, 'Result should not be null');
        t.is(bannedResult.isWhitelisted, false, 'Result should indicate that the peer is not whitelisted');
        t.is(bannedResult.isWriter, false, 'Result should indicate that the peer is not a valid writer');

    }
    catch (error) {
        t.fail('Failed to add writer: ' + error.message);
    }
});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - non-whitelisted peer', async (t) => {
    try {
        const reqAddWriter = await StateMessageOperations.assembleAddWriterMessage(
            writer3.wallet,
            writer3.msb.state.writingKey,
        );

        // add writer to base
        await admin.msb.state.append(reqAddWriter); // Send `add writer` request to apply function
        await tick();

        await sleep(5000); // wait for both peers to sync state
        const result = await writer3.msb.state.getNodeEntry(writer3.wallet.address); // check if the writer entry was added successfully in the base

        // check the result
        t.is(writer3.msb.state.isWritable(), false, 'peer should not be writable');
        t.is(writer3.msb.state.isIndexer(), false, 'peer should not be an indexer');
        t.is(result, null, 'Result should be null');
    }
    catch (error) {
        t.fail('Failed to add writer: ' + error.message);
    }
});

hook('Clean up addWriter setup', async t => {
    // close msb instances and remove temp directory
    if (admin && admin.msb) await admin.msb.close();
    if (writer1 && writer1.msb) await writer1.msb.close();
    if (writer2 && writer2.msb) await writer2.msb.close();
    if (writer3 && writer3.msb) await writer3.msb.close();
    if (indexer1 && indexer1.msb) await indexer1.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
})
