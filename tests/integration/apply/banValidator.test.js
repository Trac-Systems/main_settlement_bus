import { test, hook } from '../../helpers/wrapper.js';

import {
    initTemporaryDirectory,
    removeTemporaryDirectory,
    setupMsbWriter,
    setupMsbIndexer,
    setupMsbAdmin,
    tryToSyncWriters
} from '../../helpers/setupApplyTests.js';
import { randomBytes } from '../../helpers/setupApplyTests.js';
import { applyStateMessageFactory } from '../../../src/messages/state/applyStateMessageFactory.js';
import { safeEncodeApplyOperation } from '../../../src/utils/protobuf/operationHelpers.js';

import { testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4 } from '../../fixtures/apply.fixtures.js';
import { sleep } from '../../../src/utils/helpers.js';
import b4a from 'b4a'
import { config } from '../../helpers/config.js';

let admin;
let indexer, writer1, writer2;
let tmpDirectory;

hook('Initialize nodes for banValidator tests', async () => {
    const randomChannel = randomBytes(32).toString('hex');
    const baseOptions = {
        enableTxApplyLogs: false,
        enableInteractiveMode: false,
        enableRoleRequester: false,
        channel: randomChannel,
        enableValidatorObserver: false,
    }
    tmpDirectory = await initTemporaryDirectory();
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);

    indexer = await setupMsbWriter(admin, 'indexer', testKeyPair2, tmpDirectory, admin.options);
    indexer = await setupMsbIndexer(indexer, admin);

    writer1 = await setupMsbWriter(admin, 'writer1', testKeyPair3, tmpDirectory, admin.options);
    writer2 = await setupMsbWriter(admin, 'writer2', testKeyPair4, tmpDirectory, admin.options);
});

test('handleApplyBanValidatorOperation (apply) - Append banValidator payload - ban indexer', async t => {
    const validity = await admin.msb.state.getIndexerSequenceState()
    const assembledBanWriter = safeEncodeApplyOperation(
        await applyStateMessageFactory(admin.wallet, config)
            .buildCompleteBanWriterMessage(admin.wallet.address, indexer.wallet.address, validity)
    );
    await admin.msb.state.append(assembledBanWriter);
    await tryToSyncWriters(admin, indexer, writer1, writer2);

    const indexersEntry = await indexer.msb.state.getIndexersEntry();
    const nodeInfo = await indexer.msb.state.getNodeEntry(indexer.wallet.address);

    t.is(indexersEntry.length, 2, 'Indexers entry count should be 2');
    t.is(!!indexersEntry.find(({ key }) => b4a.equals(key, indexer.msb.state.writingKey)), true, 'Indexer address should be still included in the indexers entry');
    t.is(nodeInfo.isIndexer, true, 'Node info should indicate that the node is still an indexer');
});

test('handleApplyBanValidatorOperation (apply) - Append banValidator payload into the base by non-admin node', async t => {
    const validity = await admin.msb.state.getIndexerSequenceState()
    const assembledBanWriter = safeEncodeApplyOperation(
        await applyStateMessageFactory(writer1.wallet, config)
            .buildCompleteBanWriterMessage(writer1.wallet.address, writer2.wallet.address, validity)
    );
    await writer1.msb.state.append(assembledBanWriter);
    await sleep(5000); // wait for both peers to sync state
    await tryToSyncWriters(admin);

    const nodeInfo = await writer2.msb.state.getNodeEntry(writer2.wallet.address);

    t.is(nodeInfo.isWriter, true, 'Node info should indicate that the node is still a writer');
    t.is(nodeInfo.isWhitelisted, true, 'Node info should indicate that the node is still whitelisted');
});


test('handleApplyBanValidatorOperation (apply) - Append banValidator payload into the base - happy path', async t => {
    const validity = await admin.msb.state.getIndexerSequenceState()
    const assembledBanWriter = safeEncodeApplyOperation(
        await applyStateMessageFactory(admin.wallet, config)
            .buildCompleteBanWriterMessage(admin.wallet.address, writer1.wallet.address, validity)
    );
    await admin.msb.state.append(assembledBanWriter);
    await sleep(5000); // wait for both peers to sync state

    const nodeInfo = await writer1.msb.state.getNodeEntry(writer1.wallet.address);

    t.is(nodeInfo.isWriter, false, 'Node info should indicate that the node is not a writer anymore');
    t.is(nodeInfo.isWhitelisted, false, 'Node info should indicate that the node is not whitelisted anymore');
    t.is(writer1.msb.state.isWritable(), false, 'Writer1 should not be a writer anymore');
});

test('handleApplyBanValidatorOperation (apply) - Append banValidator payload into the base - idempotence', async t => {
    const validity = await admin.msb.state.getIndexerSequenceState()
    const assembledBanWriter = safeEncodeApplyOperation(
        await applyStateMessageFactory(admin.wallet, config)
            .buildCompleteBanWriterMessage(admin.wallet.address, writer2.wallet.address, validity)
    );
    await admin.msb.state.append(assembledBanWriter);
    await sleep(5000); // wait for both peers to sync state

    const nodeInfo = await writer2.msb.state.getNodeEntry(writer2.wallet.address);

    const validity2 = await admin.msb.state.getIndexerSequenceState()
    const assembledBanWriter2 = safeEncodeApplyOperation(
        await applyStateMessageFactory(admin.wallet, config)
            .buildCompleteBanWriterMessage(admin.wallet.address, writer2.wallet.address, validity2)
    );
    await admin.msb.state.append(assembledBanWriter2);
    await sleep(5000); // wait for both peers to sync state

    t.is(nodeInfo.isIndexer, false, 'Node info should indicate that the node is not a writer anymore');
    t.is(nodeInfo.isWriter, false, 'Node info should indicate that the node is not a writer anymore');
    t.is(nodeInfo.isWhitelisted, false, 'Node info should indicate that the node is not whitelisted anymore');
    t.is(writer1.msb.state.isWritable(), false, 'Writer2 should not be a writer anymore');
    t.is(writer1.msb.state.isIndexer(), false, 'Writer2 should not be a writer anymore');
});

hook('Clean up banValidator setup', async t => {
    const toClose = [];
    if (admin?.msb) toClose.push(admin.msb.close());
    if (indexer?.msb) toClose.push(indexer.msb.close());
    if (writer1?.msb) toClose.push(writer1.msb.close());
    if (writer2?.msb) toClose.push(writer2.msb.close());
    await Promise.all(toClose);
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});
