import { test, hook } from 'brittle';
import { tick, setupAdmin, setupMsbPeer, setupWhitelist, initTemporaryDirectory, removeTemporaryDirectory } from '../utils/setupApplyTests.js';
import { testKeyPair1, testKeyPair2 } from '../fixtures/apply.fixtures.js';
import MsgUtils from '../../src/utils/msgUtils.js';
import { sleep } from '../../src/utils/functions.js';

let admin, writer, tmpDirectory;

hook('Initialize nodes for addWriter tests', async t => {
    tmpDirectory = await initTemporaryDirectory()
    admin = await setupAdmin(testKeyPair1, tmpDirectory, {});
    writer = await setupMsbPeer('writer', testKeyPair2, tmpDirectory, admin.options);

    // set up whitelist
    const whitelistKeys = [writer.wallet.publicKey];
    await setupWhitelist(admin, whitelistKeys);
})

test('Apply function addWriter - happy path', async (t) => {
    try {
        const req = await MsgUtils.assembleAddWriterMessage(
            writer.wallet,
            writer.msb.state.writingKey,
        );

        // add writer to base
        await admin.msb.state.append(req); // Send `add writer` request to apply function
        await tick();
        await sleep(5000); // wait for both peers to sync state
        const result = await writer.msb.state.get(req.key); // check if the writer entry was added successfully in the base

        // check the result
        t.ok(writer.msb.state.isWritable(), 'peer should be writable');
        t.ok(result, 'Result should not be null');
        t.is(result.pub, writer.wallet.publicKey, 'Result pub should match writer public key');
        t.is(result.wk, writer.msb.state.writingKey, 'Result writing key should match writer writing key');
        t.ok(result.isWriter, 'Result should indicate that the peer is a valid writer');
        t.is(result.isIndexer, false, 'Result should not indicate that the peer is an indexer');
    }
    catch (error) {
        t.fail(error.message);
    }

});

hook('Clean up addWriter setup', async t => {
    // close msb instances and remove temp directory
    if (admin.msb) await admin.msb.close();
    if (writer.msb) await writer.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
})