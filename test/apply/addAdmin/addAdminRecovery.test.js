import {test, hook} from '../../utils/wrapper.js';
import {
    initTemporaryDirectory, removeTemporaryDirectory, setupMsbPeer, setupMsbWriter, setupMsbIndexer,
    tryToSyncWriters, waitForAdminEntry, setupMsbAdmin
} from '../../utils/setupApplyTests.js';

import {randomBytes} from '../../utils/setupApplyTests.js';
import CompleteStateMessageOperations from '../../../src/messages/completeStateMessages/CompleteStateMessageOperations.js';
import PartialStateMessageOperations from '../../../src/messages/partialStateMessages/PartialStateMessageOperations.js'
import {testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4} from '../../fixtures/apply.fixtures.js';
import b4a from 'b4a';
import { decode as decodeAdmin } from '../../../src/core/state/utils/adminEntry.js';
import { EntryType } from '../../../src/utils/constants.js';
//TODO: ADD TEST WHEN NON-ADMIN NODE FORGES ADD ADMIN OPERATION AND BROADCASTS IT TO THE STATE -  SHOULD BE REJECTED

let admin, newAdmin;
let indexer1, indexer2, writer;
let tmpDirectory;
let randomChannel;

hook('Initialize admin for addAdmin tests', async () => {
    randomChannel = randomBytes(32).toString('hex');
    const baseOptions = {
        enable_tx_apply_logs: false,
        enable_interactive_mode: false,
        enable_role_requester: false,
        channel: randomChannel,
        enable_validator_observer: false,
    }
    tmpDirectory = await initTemporaryDirectory()
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);

    // Setup nodes
    writer = await setupMsbWriter(admin, 'writer', testKeyPair2, tmpDirectory, admin.options);
    indexer1 = await setupMsbWriter(admin, 'indexer1', testKeyPair3, tmpDirectory, admin.options);
    indexer2 = await setupMsbWriter(admin, 'indexer2', testKeyPair4, tmpDirectory, admin.options);

    // Setup indexers after network is stable
    indexer1 = await setupMsbIndexer(indexer1, admin);
    indexer2 = await setupMsbIndexer(indexer2, admin);
});

test('Apply function addAdmin for recovery - happy path', async (k) => {
    const formerBootstrap = admin.options.bootstrap
    await tryToSyncWriters(admin, writer, indexer1, indexer2);

    const adminEntryBefore = await admin.msb.state.getAdminEntry();
    const admI1 = await indexer1.msb.state.getAdminEntry();
    const admI2 = await indexer2.msb.state.getAdminEntry();
    const admW = await writer.msb.state.getAdminEntry();

    await waitForAdminEntry(admin, {
        address: admin.wallet.address,
        wk: admin.msb.state.writingKey
    })

    await waitForAdminEntry(indexer1, {
        address: admin.wallet.address,
        wk: admin.msb.state.writingKey
    })

    await waitForAdminEntry(indexer2, {
        address: admin.wallet.address,
        wk: admin.msb.state.writingKey
    })

    await waitForAdminEntry(writer, {
        address: admin.wallet.address,
        wk: admin.msb.state.writingKey
    })

    // waitForIndexersConnection

    k.ok(adminEntryBefore !== null, 'Admin entry should not be null before recovery');
    k.ok(b4a.equals(adminEntryBefore.wk, admin.options.bootstrap), 'Admin writing key in base should match bootstrap key');
    k.ok(b4a.equals(adminEntryBefore.wk, admI1.wk), 'Admin entry writer key the same as indexer');
    k.ok(b4a.equals(admI1.wk, admI2.wk), 'Admin entry should be the same for both indexers');
    k.ok(b4a.equals(admI1.wk, admW.wk), 'Admin entry should be the same for writer');
    k.ok(adminEntryBefore.address === admI1.address, 'Admin entry address the same as indexer');
    k.ok(admI1.address === admI2.address, 'Admin address should be the same for both indexers');
    k.ok(admI1.address === admW.address, 'Admin address should be the same for writer');
    const adminAddressBeforeRecovery = admin.wallet.address
    
    // Simulate recovery by creating a new admin instance
    newAdmin = await setupMsbPeer('newAdmin', testKeyPair1, tmpDirectory, admin.options);
    await admin.msb.close(); // close the admin instance to simulate recovery
    await newAdmin.msb.ready();
    await newAdmin.msb.state.append(null);
    const validity = b4a.toString(await newAdmin.msb.state.getIndexerSequenceState(), 'hex')
    const addAdminMessage = await PartialStateMessageOperations.assembleAdminRecoveryMessage(
        newAdmin.wallet,
        b4a.toString(newAdmin.msb.state.writingKey, 'hex'),
        validity
    );

    const rawTx = await CompleteStateMessageOperations.assembleAdminRecoveryMessage(
        writer.wallet,
        addAdminMessage.address,
        b4a.from(addAdminMessage.rao.tx, 'hex'),
        b4a.from(addAdminMessage.rao.txv, 'hex'),
        b4a.from(addAdminMessage.rao.iw, 'hex'),
        b4a.from(addAdminMessage.rao.in, 'hex'),
        b4a.from(addAdminMessage.rao.is, 'hex')
    )
    await writer.msb.state.append(rawTx)
    await tryToSyncWriters(writer, indexer1, indexer2, newAdmin);
    const adminEntryAfter = decodeAdmin(await writer.msb.state.get(EntryType.ADMIN)); // check if the admin entry was added successfully in the base
    k.ok(adminEntryAfter, 'Result should not be null');
    k.ok(adminEntryAfter.address === newAdmin.wallet.address, 'New Admin address in base should match new admin wallet address');
    k.ok(adminAddressBeforeRecovery === newAdmin.wallet.address, 'New Admin wallet address should be the same as old admin wallet address');
    k.ok(b4a.equals(adminEntryAfter.wk, newAdmin.msb.state.writingKey), 'New Admin writing key in base should match new admin MSB writing key');
    k.ok(!b4a.equals(adminEntryBefore.wk, adminEntryAfter.wk), 'New Admin writing key in base should have changed');
    k.ok(!b4a.equals(adminEntryAfter.wk, formerBootstrap), 'New Admin should not be bootstrap anymore');
    //k.ok(newAdmin.msb.state.isWritable(), 'New Admin should be a writer');
    // k.ok(newAdmin.msb.state.isIndexer(), 'New Admin should be an indexer'); // wait until holepunch team will fix bug with rotation.
});

hook('Clean up addAdmin recovery setup', async () => {
    if (admin && admin.msb) await admin.msb.close();
    if (newAdmin && newAdmin.msb) await newAdmin.msb.close();
    if (indexer1 && indexer1.msb) await indexer1.msb.close();
    if (indexer2 && indexer2.msb) await indexer2.msb.close();
    if (writer && writer.msb) await writer.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});
