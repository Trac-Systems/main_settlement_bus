import test from 'brittle';
import { tick, setupAdmin, setupMsbPeer, setupWhitelist } from '../utils/setupApplyTests.js';
import { testKeyPair1, testKeyPair2 } from '../fixtures/apply.fixtures.js';
import MsgUtils from '../../src/utils/msgUtils.js';
import { sleep } from '../../src/utils/functions.js';

test('Apply function removeWriter - happy path', async (t) => {
    try {
        const admin = await setupAdmin(testKeyPair1, {});
        const writer = await setupMsbPeer('writer', testKeyPair2, admin.options);

        // set up whitelist
        const whitelistKeys = [writer.wallet.publicKey]
        await setupWhitelist(admin, whitelistKeys);

        const reqAddWriter = await MsgUtils.assembleAddWriterMessage(
            writer.wallet,
            writer.msb.writingKey,
        );

        // add writer to base
        await admin.msb.base.append(reqAddWriter); // Send `add writer` request to admin apply function
        await tick();

        // request writer removal
        const reqRemoveWriter = await MsgUtils.assembleRemoveWriterMessage(
            writer.wallet,
            writer.msb.writingKey,
        );

        await admin.msb.base.append(reqRemoveWriter);
        await tick();
        await sleep(5000); // wait for both peers to sync state
        const resultRemoveWriter = await writer.msb.get(reqRemoveWriter.key); // check if the writer entry was removed successfully in the base

        // release resources
        await writer.msb.close();
        await admin.msb.close();

        // check the result
        t.ok(resultRemoveWriter, 'Result should not be null');
        t.is(resultRemoveWriter.pub, writer.wallet.publicKey, 'Result value.pub should match writer public key');
        t.is(resultRemoveWriter.wk, writer.msb.writingKey, 'Result writing key should match writer writing key');
        t.is(resultRemoveWriter.isWriter, false, 'Node should not be a writer anymore');
        t.is(resultRemoveWriter.isIndexer, false, 'Result should not indicate that the peer is an indexer');
    }
    catch (error) {
        t.fail(error.message);
    }

});