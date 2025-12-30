import {test, hook} from '../../helpers/wrapper.js';

import { createApplyStateMessageFactory } from '../../../src/messages/state/applyStateMessageFactory.js';
import { safeEncodeApplyOperation } from '../../../src/utils/protobuf/operationHelpers.js';
import { config } from '../../helpers/config.js';
import {
    initTemporaryDirectory,
    removeTemporaryDirectory,
    setupMsbAdmin,
    setupMsbWriter,
    randomBytes,
    setupMsbIndexer, waitForNodeState, tryToSyncWriters
} from '../../helpers/setupApplyTests.js';
import {testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4} from '../../fixtures/apply.fixtures.js';
import b4a from 'b4a'

let tmpDirectory, admin, indexer1, indexer2, writer;

hook('Initialize nodes for addIndexer tests', async t => {
    const randomChannel = randomBytes(32).toString('hex');
    const baseOptions = {
        enableTxApplyLogs: false,
        enableInteractiveMode: false,
        enableRoleRequester: false,
        enableValidatorObserver: false,
        channel: randomChannel,
    }
    tmpDirectory = await initTemporaryDirectory();

    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);
    indexer1 = await setupMsbWriter(admin, 'indexer1', testKeyPair2, tmpDirectory, admin.options);
    indexer1 = await setupMsbIndexer(indexer1, admin);

    indexer2 = await setupMsbWriter(admin, 'indexer2', testKeyPair3, tmpDirectory, admin.options);
    indexer2 = await setupMsbIndexer(indexer2, admin);

    writer = await setupMsbWriter(admin, 'writer', testKeyPair4, tmpDirectory, admin.options);
});

test('handleApplyRemoveIndexerOperation (apply) - Append removeIndexer payload into the base - happy path', async t => {
    // indexer1 is already an indexer -> this indexer will lose its indexer status and will become a writer.
    // indexer2 is already an indexer
    // writer is already a writer
    const indexersEntryBefore = await writer.msb.state.getIndexersEntry();
    const validity = await admin.msb.state.getIndexerSequenceState()
    const assembledRemoveIndexerMessage = safeEncodeApplyOperation(
        await createApplyStateMessageFactory(admin.wallet, config)
            .buildCompleteRemoveIndexerMessage(admin.wallet.address, indexer1.wallet.address, validity)
    );
    await admin.msb.state.append(assembledRemoveIndexerMessage);
    await tryToSyncWriters(admin, indexer1, indexer2);
    await waitForNodeState(indexer1, indexer1.wallet.address, {
        wk: indexer1.msb.state.writingKey,
        isWhitelisted: true,
        isWriter: true,
        isIndexer: false,
    })

    const indexersEntry = await indexer1.msb.state.getIndexersEntry();
    const nodeEntryIndexer1 = await indexer1.msb.state.getNodeEntry(indexer1.wallet.address);

    t.is(indexersEntry.length, indexersEntryBefore.length - 1, `Indexers entry count should be still ${indexersEntryBefore.length - 1}`);
    t.is(!!indexersEntry.find(({ key }) => b4a.equals(key, indexer1.msb.state.writingKey)), false, 'Indexer address should not be included in the indexers entry');
    t.is(nodeEntryIndexer1.isWriter, true, 'Node info should indicate that the node is a writer');
    t.is(nodeEntryIndexer1.isIndexer, false, 'Node info should indicate that the node is not an indexer');
});


test('handleApplyRemoveIndexerOperation (apply) - Append removeIndexer payload into the base - idempotence', async t => {
    // indexer1 is already a writer (after the previous test) -> let's test idempotence on this node.
    // indexer2 is already an indexer
    // writer is already a writer
    const adminSignedLengthBefore = admin.msb.state.getSignedLength();
    const indexer2SignedLengthBefore = indexer2.msb.state.getSignedLength();
    const writerSignedLengthBefore = writer.msb.state.getSignedLength();

    const indexersEntryBefore = await indexer1.msb.state.getIndexersEntry();
    const validity = await admin.msb.state.getIndexerSequenceState()
    const assembledRemoveIndexerMessage = safeEncodeApplyOperation(
        await createApplyStateMessageFactory(admin.wallet, config)
            .buildCompleteRemoveIndexerMessage(admin.wallet.address, indexer1.wallet.address, validity)
    );
    await admin.msb.state.append(assembledRemoveIndexerMessage);
    await tryToSyncWriters(admin, indexer2, writer);

    const adminSignedLengthAfter = admin.msb.state.getSignedLength();
    const indexer2SignedLengthAfter = indexer2.msb.state.getSignedLength();
    const writerSignedLengthAfter = writer.msb.state.getSignedLength();

    const indexersEntry = await indexer1.msb.state.getIndexersEntry();
    const nodeInfo = await indexer1.msb.state.getNodeEntry(indexer1.wallet.address);

    t.is(indexersEntry.length, indexersEntryBefore.length, `Indexers entry count should remain ${indexersEntryBefore.length}`);
    t.is(!!indexersEntry.find(({ key }) => b4a.equals(key, indexer1.msb.state.writingKey)), false, 'Indexer address should not be included in the indexers entry');
    t.is(nodeInfo.isWriter, true, 'Node info should indicate that the node is a writer');
    t.is(nodeInfo.isIndexer, false, 'Node info should indicate that the node is not an indexer');
    t.is(adminSignedLengthBefore, adminSignedLengthAfter, 'Admin signed length should not change');
    t.is(indexer2SignedLengthBefore, indexer2SignedLengthAfter, 'Indexer2 signed length should not change');
    t.is(writerSignedLengthBefore, writerSignedLengthAfter, 'Writer signed length should not change');
});

test('handleApplyAddIndexerOperation (apply) - Append removeIndexer payload into the base by non-admin node', async t => {
    // indexer1 is already a writer.
    // indexer2 is already an indexer -> should still be an indexer after the operation.
    // writer is already a writer -> will try to remove indexer2 as a non-admin node, however it should not be allowed.
    const indexersEntryBefore = await indexer2.msb.state.getIndexersEntry();
    const writerSignedLengthBefore = admin.msb.state.getSignedLength();
    const indexer2SignedLengthBefore = indexer2.msb.state.getSignedLength();

    const validity = await admin.msb.state.getIndexerSequenceState()
    const assembledRemoveIndexerMessage = safeEncodeApplyOperation(
        await createApplyStateMessageFactory(admin.wallet, config)
            .buildCompleteRemoveIndexerMessage(admin.wallet.address, indexer2.wallet.address, validity)
    );
    await writer.msb.state.append(assembledRemoveIndexerMessage);
    await tryToSyncWriters(admin, indexer2, writer);

    const writerSignedLengthAfter = writer.msb.state.getSignedLength();
    const indexer2SignedLengthAfter = indexer2.msb.state.getSignedLength();

    const indexersEntry = await indexer2.msb.state.getIndexersEntry();
    const nodeInfo = await indexer2.msb.state.getNodeEntry(indexer2.wallet.address);

    t.is(indexersEntry.length, indexersEntryBefore.length, `Indexers entry count should be still ${indexersEntryBefore.length}`);
    t.is(!!indexersEntry.find(({ key }) => b4a.equals(key, indexer2.msb.state.writingKey)), true, 'Indexer address should not be included in the indexers entry');
    t.is(nodeInfo.isIndexer, true, 'Node info should indicate that the node is an indexer');
    t.is(writerSignedLengthBefore, writerSignedLengthAfter, 'Writer signed length should not change');
    t.is(indexer2SignedLengthBefore, indexer2SignedLengthAfter, 'Indexer2 signed length should not change');
});

hook('Clean up removeIndexer setup', async t => {
    const toClose = []
    if (admin?.msb) toClose.push(admin.msb.close());
    if (indexer1?.msb) toClose.push(indexer1.msb.close());
    if (indexer2?.msb) toClose.push(indexer2.msb.close());
    if (writer?.msb) toClose.push(writer.msb.close());
    await Promise.all(toClose)
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});
