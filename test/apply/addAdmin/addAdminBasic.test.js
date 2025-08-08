import {test, hook} from 'brittle';
import {
    initMsbAdmin, initTemporaryDirectory, removeTemporaryDirectory, setupMsbPeer, setupMsbWriter, setupMsbIndexer,
    tryToSyncWriters, waitForAdminEntry
} from '../../utils/setupApplyTests.js';

import {randomBytes} from '../../utils/setupApplyTests.js';
import StateMessageOperations from '../../../src/messages/stateMessages/StateMessageOperations.js';
import {testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4} from '../../fixtures/apply.fixtures.js';
import b4a from 'b4a';

//TODO: ADD TEST WHEN NON-ADMIN NODE FORGES ADD ADMIN OPERATION AND BROADCASTS IT TO THE STATE -  SHOULD BE REJECTED

let admin;
let tmpDirectory;
let randomChannel;

hook('Initialize admin for addAdmin tests', async () => {
    randomChannel = randomBytes(32).toString('hex');
    const baseOptions = {
        enable_txlogs: false,
        enable_interactive_mode: false,
        enable_role_requester: false,
        channel: randomChannel,
        enable_validator_observer: false,
    }
    tmpDirectory = await initTemporaryDirectory();
    admin = await initMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);
    await admin.msb.ready();
});

test('Apply function addAdmin for the first time - happy path', async (k) => {
    try {
        const adminEntryBefore = await admin.msb.state.getAdminEntry();
        k.is(adminEntryBefore, null, 'Admin entry should be null before adding a new admin');

        const addAdminMessage = await StateMessageOperations.assembleAddAdminMessage(
            admin.wallet,
            admin.msb.state.writingKey
        );

        // add admin to base
        await admin.msb.state.append(addAdminMessage); // Send `add admin` request to apply function
        await tryToSyncWriters(admin);
        const adminEntryAfter = await admin.msb.state.getAdminEntry(); // check if the admin entry was added successfully in the base
        // check the result
        k.ok(adminEntryAfter, 'Result should not be null');
        k.ok(adminEntryAfter.address === admin.wallet.address, 'Admin address in base should match admin wallet address');
        k.ok(b4a.equals(adminEntryAfter.wk, admin.msb.state.writingKey), 'Admin writing key in base should match admin MSB writing key');
        k.ok(b4a.equals(adminEntryAfter.wk, admin.options.bootstrap), 'Admin writing key in base should match bootstrap key');

    } catch (error) {
        k.fail(error.message);
    }
});

hook('Clean up addAdmin recovery setup', async () => {
    if (admin && admin.msb) await admin.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});
