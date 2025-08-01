import { test, hook } from 'brittle';
import { tick, initMsbAdmin, initTemporaryDirectory, removeTemporaryDirectory, setupMsbPeer, setupMsbWriter, setupMsbIndexer } from '../utils/setupApplyTests.js';
import { randomBytes } from '../utils/setupApplyTests.js';
import StateMessageOperations from '../../src/messages/stateMessages/StateMessageOperations.js';
import { testKeyPair1 } from '../fixtures/apply.fixtures.js';
import { sleep } from '../../src/utils/helpers.js';
import b4a from 'b4a';

let admin, newAdmin;
let indexer1, indexer2, writer;
let tmpDirectory;

hook('Initialize nodes for addAdmin tests', async () => {
    const randomChannel = randomBytes(32).toString('hex');
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

test('Apply function addAdmin - happy path', async (t) => {
    t.test('Apply function addAdmin for the first time - happy path', async (k) => {
        try {
            const adminEntryBefore = await admin.msb.state.getAdminEntry();
            k.is(adminEntryBefore, null, 'Admin entry should be null before adding a new admin');

            const addAdminMessage = await StateMessageOperations.assembleAddAdminMessage(
                admin.msb.state.writingKey,
                admin.wallet,
            );

            console.log(addAdminMessage);
            // add admin to base
            await admin.msb.state.append(addAdminMessage); // Send `add admin` request to apply function
            await tick();
            const adminEntryAfter = await admin.msb.state.getAdminEntry(); // check if the admin entry was added successfully in the base
            // check the result
            k.ok(adminEntryAfter, 'Result should not be null');
            k.ok(adminEntryAfter.address === admin.wallet.address, 'Admin address in base should match admin wallet address');
            k.ok(b4a.equals(adminEntryAfter.wk,admin.msb.state.writingKey), 'Admin writing key in base should match admin MSB writing key');
            k.ok(b4a.equals(adminEntryAfter.wk,admin.options.bootstrap), 'Admin writing key in base should match bootstrap key');
            k.ok(admin.msb.state.isWritable(), 'Admin should be a writer');
            k.ok(admin.msb.state.isIndexer(), 'Admin should be an indexer');

        } catch (error) {
            k.fail(error.message);
        }
    });

    if (!admin || !admin.msb) {
        throw new Error('Admin instance is not initialized');
    }

    try {
        // Setup all peers as writers
        writer = await setupMsbWriter(admin, 'writer', null, tmpDirectory, admin.options);

        indexer1 = await setupMsbWriter(admin, 'indexer1', null, tmpDirectory, admin.options);
        indexer2 = await setupMsbWriter(admin, 'indexer2', null, tmpDirectory, admin.options);
        await sleep(5000); // wait for the peers to sync with admin

        // Initialize indexers
        indexer1 = await setupMsbIndexer(indexer1, admin);
        indexer2 = await setupMsbIndexer(indexer2, admin);
        await sleep(5000); // wait for the indexers and writer to sync with admin
    }
    catch (error) {
        console.error('Error initializing special nodes for addAdmin recovery tests:', error);
        throw error;
    }

    t.test('Apply function addAdmin for recovery - happy path', async (k) => {
        try {
            const adminEntryBefore = await admin.msb.state.getAdminEntry();
            const admI1 = await indexer1.msb.state.getAdminEntry();
            const admI2 = await indexer2.msb.state.getAdminEntry();
            const admW = await writer.msb.state.getAdminEntry();

            k.ok(adminEntryBefore !== null, 'Admin entry should not be null before recovery');

            k.ok(b4a.equals(adminEntryBefore.wk, admin.options.bootstrap), 'Admin writing key in base should match bootstrap key');
            k.ok(b4a.equals(adminEntryBefore.wk, admI1.wk), 'Admin entry writer key the same as indexer');
            k.ok(b4a.equals(admI1.wk, admI2.wk), 'Admin entry should be the same for both indexers');
            k.ok(b4a.equals(admI1.wk, admW.wk), 'Admin entry should be the same for writer');
            k.ok(adminEntryBefore.address === admI1.address, 'Admin entry address the same as indexer');
            k.ok(admI1.address === admI2.address, 'Admin address should be the same for both indexers');
            k.ok(admI1.address === admW.address, 'Admin address should be the same for writer');

            await admin.msb.close(); // close the admin instance to simulate recovery

            // Simulate recovery by creating a new admin instance
            newAdmin = await setupMsbPeer('newAdmin', testKeyPair1, tmpDirectory, admin.options);
            await newAdmin.msb.ready();

            const addAdminMessage = await StateMessageOperations.assembleAddAdminMessage(
                newAdmin.msb.state.writingKey,
                newAdmin.wallet,
            );

            // add admin to base
            await writer.msb.state.append(addAdminMessage); // Send `add admin` request to apply function
            await sleep(5000); // wait for the new admin to sync with indexers
            const adminEntryAfter = await newAdmin.msb.state.getAdminEntry(); // check if the admin entry was added successfully in the base

            // check the result
            k.ok(adminEntryAfter, 'Result should not be null');
            k.ok(adminEntryAfter.address === newAdmin.wallet.address, 'New Admin address in base should match new admin wallet address');
            k.ok(admin.wallet.address === newAdmin.wallet.address, 'New Admin wallet address should be the same as old admin wallet address');
            k.ok(b4a.equals(adminEntryAfter.wk, newAdmin.msb.state.writingKey), 'New Admin writing key in base should match new admin MSB writing key');
            k.ok(!b4a.equals(adminEntryBefore.wk , adminEntryAfter.wk), 'New Admin writing key in base should have changed');
            k.ok(!b4a.equals(adminEntryAfter.wk , newAdmin.options.bootstrap), 'New Admin should not be bootstrap anymore');
            k.ok(newAdmin.msb.state.isWritable(), 'New Admin should be a writer');
            // t.ok(newAdmin.msb.state.isIndexer(), 'New Admin should be an indexer'); // wait until holepunch team will fix bug with rotation.
        } catch (error) {
            k.fail(error.message);
        }
    });
});

hook('Clean up addAdmin setup', async () => {
    // close msb intances and remove temp directory
    if (admin && admin.msb) await admin.msb.close();
    if (newAdmin && newAdmin.msb) await newAdmin.msb.close();
    if (indexer1 && indexer1.msb) await indexer1.msb.close();
    if (indexer2 && indexer2.msb) await indexer2.msb.close();
    if (writer && writer.msb) await writer.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});
