import {test, hook} from '../../utils/wrapper.js';
import {
    initMsbAdmin, initTemporaryDirectory, removeTemporaryDirectory, setupMsbPeer, setupMsbWriter, setupMsbIndexer,
    tryToSyncWriters
} from '../../utils/setupApplyTests.js';
import {randomBytes} from '../../utils/setupApplyTests.js';
import CompleteStateMessageOperations from '../../../src/messages/completeStateMessages/CompleteStateMessageOperations.js';
import {testKeyPair1} from '../../fixtures/apply.fixtures.js';
import b4a from 'b4a';
import { ADMIN_INITIAL_BALANCE } from '../../../src/utils/constants.js';

//TODO: ADD TEST WHEN NON-ADMIN NODE FORGES ADD ADMIN OPERATION AND BROADCASTS IT TO THE STATE -  SHOULD BE REJECTED

let admin;
let tmpDirectory;
let randomChannel;

const sendAddAdmin = async (invoker) => {
    const validity = b4a.from(await admin.msb.state.getIndexerSequenceState(), 'hex')
    const addAdminMessage = await CompleteStateMessageOperations.assembleAddAdminMessage(
        admin.wallet,
        admin.msb.state.writingKey,
        validity
    );

    // add admin to base
    await invoker.msb.state.append(addAdminMessage); // Send `add admin` request to apply function
}

hook('Initialize admin for addAdmin tests', async () => {
    randomChannel = randomBytes(32).toString('hex');
    const baseOptions = {
        enable_tx_apply_logs: false,
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
    const writersLength = await admin.msb.state.getWriterLength();
    const adminEntryBefore = await admin.msb.state.getAdminEntry();
    k.is(adminEntryBefore, null, 'Admin entry should be null before adding a new admin');

    await sendAddAdmin(admin)
    await tryToSyncWriters(admin);
    const adminEntryAfter = await admin.msb.state.getAdminEntry(); // check if the admin entry was added successfully in the base
    const nodeAdminEntry = await admin.msb.state.getNodeEntry(adminEntryAfter.address)
    const newWritersLength = await admin.msb.state.getWriterLength();
    // check the result
    k.ok(adminEntryAfter, 'Result should not be null');
    k.ok(adminEntryAfter.address === admin.wallet.address, 'Admin address in base should match admin wallet address');
    k.ok(b4a.equals(adminEntryAfter.wk, admin.msb.state.writingKey), 'Admin writing key in base should match admin MSB writing key');
    k.ok(b4a.equals(adminEntryAfter.wk, admin.options.bootstrap), 'Admin writing key in base should match bootstrap key');
    k.is(nodeAdminEntry.isWriter, true, 'Admin should be writer');
    k.is(nodeAdminEntry.isIndexer, true, 'Admin should be indexer');
    k.ok(b4a.equals(nodeAdminEntry.balance, ADMIN_INITIAL_BALANCE), 'Admin should have an initial balance');
    k.is(newWritersLength, writersLength + 1,  'Admin should increase writers length');
});

hook('Clean up addAdmin recovery setup', async () => {
    if (admin && admin.msb) await admin.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});
