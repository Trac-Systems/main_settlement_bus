import { test, hook } from 'brittle';
import { tick, initMsbAdmin, initTemporaryDirectory, removeTemporaryDirectory } from '../utils/setupApplyTests.js';
import { testKeyPair1 } from '../fixtures/apply.fixtures.js';
import MsgUtils from '../../src/utils/msgUtils.js';
import { EntryType } from '../../src/utils/constants.js';

let admin, tmpDirectory;

hook('Initialize nodes for addWriter tests', async t => {
    tmpDirectory = await initTemporaryDirectory();
    admin = await initMsbAdmin(testKeyPair1, tmpDirectory, {});
    await admin.msb.ready();
})

test('Apply function addAdmin for the first time - happy path', async (t) => {
    try {
        const adminEntryBefore = await admin.msb.get(EntryType.ADMIN);
        t.is(adminEntryBefore, null, 'Admin entry should be null before adding a new admin');

        const addAdminMessage = await MsgUtils.assembleAdminMessage(
            adminEntryBefore,
            admin.msb.writingKey,
            admin.wallet,
            admin.options.bootstrap
        );

        // add admin to base
        await admin.msb.base.append(addAdminMessage); // Send `add admin` request to apply function
        await tick();
        const adminEntryAfter = await admin.msb.get(EntryType.ADMIN); // check if the admin entry was added successfully in the base

        // check the result
        t.ok(adminEntryAfter, 'Result should not be null');
        t.is(adminEntryAfter.tracPublicKey, admin.wallet.publicKey, 'Admin pubkey in base should match admin wallet public key');
        t.is(adminEntryAfter.wk, admin.msb.writingKey, 'Admin writing key in base should match admin MSB writing key');
        t.is(adminEntryAfter.wk, admin.options.bootstrap, 'Admin writing key in base should match bootstrap key');
        t.ok(admin.msb.base.writable, 'Admin should be a writer');
        t.ok(admin.msb.base.isIndexer, 'Admin should be an indexer');

    } catch (error) {
        t.fail(error.message);
    }
});

// TODO: Implement test for admin recovery (need to setup at least 2 indexers and 1 writer)

hook('Clean up addAdmin setup', async t => {
    // close msb intances and remove temp directory
    if (admin.msb) await admin.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
})