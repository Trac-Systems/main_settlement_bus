import { test, hook } from 'brittle';
import b4a from 'b4a';

import { tick, setupMsbAdmin, setupMsbPeer, setupWhitelist, initTemporaryDirectory, removeTemporaryDirectory, randomBytes } from '../utils/setupApplyTests.js';
import { testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4 } from '../fixtures/apply.fixtures.js';
import { sleep } from '../../src/utils/helpers.js';
import StateMessageOperations from '../../src/messages/stateMessages/StateMessageOperations.js';


let admin, writer1, writer2, writer3, tmpDirectory;

hook('Initialize nodes for addWriter tests', async t => {

    const randomChannel = randomBytes().toString('hex');
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
    
    // set up whitelist
    const whitelistKeys = [writer1.wallet.address, writer2.wallet.address];
    await setupWhitelist(admin, whitelistKeys);
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

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - banned writer', async (t) => {
    try {
        const req = await StateMessageOperations.assembleAddWriterMessage(
            writer2.wallet,
            writer2.msb.state.writingKey,
        );

        // add writer to base
        await admin.msb.state.append(req); // Send `add writer` request to apply function
        await tick();
        await sleep(5000); // wait for both peers to sync state
        const result = await writer2.msb.state.getNodeEntry(writer2.wallet.address); // check if the writer entry was added successfully in the base

        // check the result
        t.ok(writer2.msb.state.isWritable(), 'peer should be writable');
        t.ok(result, 'Result should not be null');
        t.ok(b4a.equals(result.wk, writer2.msb.state.writingKey), 'Result writing key should match writer writing key');
        t.ok(result.isWriter, 'Result should indicate that the peer is a valid writer');
        t.is(result.isIndexer, false, 'Result should not indicate that the peer is an indexer');

        const banReq = await StateMessageOperations.assembleBanWriterMessage(
            admin.wallet,
            writer2.wallet.address,
        );

        await admin.msb.state.append(banReq);
        await tick();
        await sleep(5000);

        const req2 = await StateMessageOperations.assembleAddWriterMessage(
            writer2.wallet,
            writer2.msb.state.writingKey,
        );

        await admin.msb.state.append(req2);
        await tick();
        await sleep(5000);

        const bannedResult = await writer2.msb.state.getNodeEntry(writer2.wallet.address);
        t.is(writer2.msb.state.isWritable(), false, 'peer should not be writable');
        t.is(writer2.msb.state.isIndexer(), false, 'peer should not be an indexer');
        t.ok(bannedResult, 'Result should not be null');
        t.is(bannedResult.isWhitelisted, false, 'Result should indicate that the peer is not whitelisted');
        t.is(bannedResult.isWriter, false, 'Result should indicate that the peer is not a valid writer');
        t.is(bannedResult.isIndexer, false, 'Result should not indicate that the peer is an indexer');

    }
    catch (error) {
        t.fail('Failed to add writer: ' + error.message);
    }
});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - non-whitelisted peer', async (t) => {
    try {
        const req = await StateMessageOperations.assembleAddWriterMessage(
            writer3.wallet,
            writer3.msb.state.writingKey,
        );

        // add writer to base
        await admin.msb.state.append(req); // Send `add writer` request to apply function
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
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
})
