import test from 'brittle';
import { tick, setupAdmin, setupMsbPeer, setupWhitelist } from '../utils/setupApplyTests.js';
import { testKeyPair1, testKeyPair2 } from '../fixtures/apply.fixtures.js';
import MsgUtils from '../../src/utils/msgUtils.js';
import { sleep } from '../../src/utils/functions.js';

test('Apply function addWriter - happy path', async (t) => {
    try {
        const admin = await setupAdmin(testKeyPair1, {});
        const writer = await setupMsbPeer('writer', testKeyPair2, admin.options);

        // set up whitelist
        const whitelistKeys = [writer.wallet.publicKey]
        await setupWhitelist(admin, whitelistKeys);

        const req = await MsgUtils.assembleAddWriterMessage(
            writer.wallet,
            writer.msb.writingKey,
        );

        // add writer to base
        await admin.msb.base.append(req); // Send `add writer` request to apply function
        await tick();
        await sleep(5000); // wait for both peers to sync state
        const result = await writer.msb.get(req.key); // check if the writer entry was added successfully in the base

        // release resources
        await writer.msb.close();
        await admin.msb.close();

        // check the result
        t.ok(result, 'Result should not be null');
        t.is(result.pub, writer.wallet.publicKey, 'Result pub should match writer public key');
        t.is(result.wk, writer.msb.writingKey, 'Result writing key should match writer writing key');
        t.ok(result.isWriter, 'Result should indicate that the peer is a valid writer');
        t.is(result.isIndexer, false, 'Result should not indicate that the peer is an indexer');
    }
    catch (error) {
        t.fail(error.message);
    }

});