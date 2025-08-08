import {test, hook} from 'brittle';

import {
    initTemporaryDirectory,
    removeTemporaryDirectory,
    setupMsbWriter,
    setupMsbIndexer,
    setupMsbAdmin,
    tryToSyncWriters
} from '../utils/setupApplyTests.js';
import {randomBytes} from '../utils/setupApplyTests.js';
import StateMessageOperations from '../../src/messages/stateMessages/StateMessageOperations.js';
import {testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4} from '../fixtures/apply.fixtures.js';
import {formatIndexersEntry, sleep} from '../../src/utils/helpers.js';

let admin;
let indexer, writer1, writer2;
let tmpDirectory;

hook('Initialize nodes for banValidator tests', async () => {
    const randomChannel = randomBytes(32).toString('hex');
    const baseOptions = {
        enable_txlogs: false,
        enable_interactive_mode: false,
        enable_role_requester: false,
        channel: randomChannel,
        enable_validator_observer: false,

    }
    tmpDirectory = await initTemporaryDirectory();
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);

    indexer = await setupMsbWriter(admin, 'indexer', testKeyPair2, tmpDirectory, admin.options);
    indexer = await setupMsbIndexer(indexer, admin);

    writer1 = await setupMsbWriter(admin, 'writer1', testKeyPair3, tmpDirectory, admin.options);
    writer2 = await setupMsbWriter(admin, 'writer2', testKeyPair4, tmpDirectory, admin.options);
});

test('handleApplyBanValidatorOperation (apply) - Append banValidator payload - ban indexer', async t => {
    try {

        const assembledBanWriter = await StateMessageOperations.assembleBanWriterMessage(admin.wallet, indexer.wallet.address);
        await admin.msb.state.append(assembledBanWriter);
        await tryToSyncWriters(admin, indexer, writer1, writer2);

        const indexersEntry = await indexer.msb.state.getIndexersEntry();
        const formattedIndexersEntry = formatIndexersEntry(indexersEntry);
        const nodeInfo = await indexer.msb.state.getNodeEntry(indexer.wallet.address);

        t.is(formattedIndexersEntry.count, 2, 'Indexers entry count should be 2');
        t.is(formattedIndexersEntry.addresses.includes(indexer.wallet.address), true, 'Indexer address should be still included in the indexers entry');
        t.is(nodeInfo.isIndexer, true, 'Node info should indicate that the node is still an indexer');
    } catch (error) {
        t.fail('Failed to ban indexer: ' + error.message);
    }
});

test('handleApplyBanValidatorOperation (apply) - Append banValidator payload into the base by non-admin node', async t => {
    try {
        const assembledBanWriter = await StateMessageOperations.assembleBanWriterMessage(writer1.wallet, writer2.wallet.address);
        await writer1.msb.state.append(assembledBanWriter);
        await sleep(5000); // wait for both peers to sync state
        await tryToSyncWriters(admin);


        const nodeInfo = await writer2.msb.state.getNodeEntry(writer2.wallet.address);

        t.is(nodeInfo.isWriter, true, 'Node info should indicate that the node is still a writer');
        t.is(nodeInfo.isWhitelisted, true, 'Node info should indicate that the node is still whitelisted');
    } catch (error) {
        t.fail('Failed to add indexer: ' + error.message);
    }
});


test('handleApplyBanValidatorOperation (apply) - Append banValidator payload into the base - happy path', async t => {
    try {
        const assembledBanWriter = await StateMessageOperations.assembleBanWriterMessage(admin.wallet, writer1.wallet.address);
        await admin.msb.state.append(assembledBanWriter);
        await sleep(5000); // wait for both peers to sync state

        const nodeInfo = await writer1.msb.state.getNodeEntry(writer1.wallet.address);

        t.is(nodeInfo.isWriter, false, 'Node info should indicate that the node is not a writer anymore');
        t.is(nodeInfo.isWhitelisted, false, 'Node info should indicate that the node is not whitelisted anymore');
        t.is(writer1.msb.state.isWritable(), false, 'Writer1 should not be a writer anymore');
    } catch (error) {
        t.fail('Failed to add indexer: ' + error.message);
    }
});

test('handleApplyBanValidatorOperation (apply) - Append banValidator payload into the base - idempotence', async t => {
    try {
        const assembledBanWriter = await StateMessageOperations.assembleBanWriterMessage(admin.wallet, writer2.wallet.address);
        await admin.msb.state.append(assembledBanWriter);
        await sleep(5000); // wait for both peers to sync state

        const nodeInfo = await writer2.msb.state.getNodeEntry(writer2.wallet.address);

        const assembledBanWriter2 = await StateMessageOperations.assembleBanWriterMessage(admin.wallet, writer2.wallet.address);
        await admin.msb.state.append(assembledBanWriter2);
        await sleep(5000); // wait for both peers to sync state

        t.is(nodeInfo.isIndexer, false, 'Node info should indicate that the node is not a writer anymore');
        t.is(nodeInfo.isWriter, false, 'Node info should indicate that the node is not a writer anymore');
        t.is(nodeInfo.isWhitelisted, false, 'Node info should indicate that the node is not whitelisted anymore');
        t.is(writer1.msb.state.isWritable(), false, 'Writer2 should not be a writer anymore');
        t.is(writer1.msb.state.isIndexer(), false, 'Writer2 should not be a writer anymore');
    } catch (error) {
        t.fail('Failed to add indexer: ' + error.message);
    }
});

hook('Clean up banValidator setup', async t => {
    // close msb instances and remove temp directory
    if (admin && admin.msb) await admin.msb.close();
    if (indexer && indexer.msb) await indexer.msb.close();
    if (writer1 && writer1.msb) await writer1.msb.close();
    if (writer2 && writer2.msb) await writer2.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
})
