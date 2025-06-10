import { test, hook } from 'brittle';
import { tick, setupMsbAdmin, initTemporaryDirectory, removeTemporaryDirectory, setupMsbWriter } from '../utils/setupApplyTests.js';
import { testKeyPair1, testKeyPair2 } from '../fixtures/apply.fixtures.js';
import MsgUtils from '../../src/utils/msgUtils.js';
import { sleep } from '../../src/utils/functions.js';

let admin, writer, tmpDirectory;

hook('Initialize nodes for removeWriter tests', async t => {
    tmpDirectory = await initTemporaryDirectory()
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, {});
    writer = await setupMsbWriter(admin, 'writer', testKeyPair2, tmpDirectory, admin.options);
})

test('Apply function removeWriter - happy path', async (t) => {
    try {
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
        t.fail('Failed to remove writer: ' + error.message);
    }

});

hook('Clean up removeWriter setup', async t => {
    // close msb instances and remove temp directory
    if (admin && admin.msb) await admin.msb.close();
    if (writer && writer.msb) await writer.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
})
