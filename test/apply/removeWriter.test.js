import { test, hook } from 'brittle';
import { tick, setupMsbAdmin as setupMsbAdmin, setupMsbPeer, setupWhitelist, initTemporaryDirectory, removeTemporaryDirectory } from '../utils/setupApplyTests.js';
import { testKeyPair1, testKeyPair2 } from '../fixtures/apply.fixtures.js';
import MsgUtils from '../../src/utils/msgUtils.js';
import { sleep } from '../../src/utils/functions.js';

let admin, writer, tmpDirectory;

hook('Initialize nodes for addWriter tests', async t => {
    tmpDirectory = await initTemporaryDirectory()
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, {});
    writer = await setupMsbPeer('writer', testKeyPair2, tmpDirectory, admin.options);

    // set up whitelist
    const whitelistKeys = [writer.wallet.publicKey];
    await setupWhitelist(admin, whitelistKeys);
    await tick();
})

test('Apply function removeWriter - happy path', async (t) => {
    try {
        const reqAddWriter = await MsgUtils.assembleAddWriterMessage(
            writer.wallet,
            writer.msb.state.writingKey,
        );

        // add writer to base
        await admin.msb.state.append(reqAddWriter); // Send `add writer` request to admin apply function
        await tick();

        // request writer removal
        const reqRemoveWriter = await MsgUtils.assembleRemoveWriterMessage(
            writer.wallet,
            writer.msb.state.writingKey,
        );

        await admin.msb.state.append(reqRemoveWriter);
        await tick();
        await sleep(5000); // wait for both peers to sync state
        const resultRemoveWriter = await writer.msb.state.get(reqRemoveWriter.key); // check if the writer entry was removed successfully in the base

        // check the result
        t.ok(resultRemoveWriter, 'Result should not be null');
        t.is(resultRemoveWriter.pub, writer.wallet.publicKey, 'Result value.pub should match writer public key');
        t.is(resultRemoveWriter.wk, writer.msb.state.writingKey, 'Result writing key should match writer writing key');
        t.is(resultRemoveWriter.isWriter, false, 'Node should not be a writer anymore');
        t.is(resultRemoveWriter.isIndexer, false, 'Result should not indicate that the peer is an indexer');
    }
    catch (error) {
        t.fail(error.message);
    }

});

hook('Clean up addIndexer setup', async t => {
    // close msbBoostrap and remove temp directory
    if (admin.msb) await admin.msb.close();
    if (writer.msb) await writer.msb.close();
    console.log('Removing temporary directory:', tmpDirectory);
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
})
