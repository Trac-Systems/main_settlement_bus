import {test, hook, solo} from 'brittle';
import { applyStateMessageFactory } from '../../../src/messages/state/applyStateMessageFactory.js';
import { safeEncodeApplyOperation } from '../../../src/utils/protobuf/operationHelpers.js';
import {
    initTemporaryDirectory,
    removeTemporaryDirectory,
    setupMsbAdmin,
    setupMsbWriter,
    randomBytes,
    setupMsbPeer,
    setupWhitelist, waitForNodeState, tryToSyncWriters, waitIndexer
} from '../../helpers/setupApplyTests.js';
import {
    testKeyPair1,
    testKeyPair2,
    testKeyPair3,
    testKeyPair4,
    testKeyPair5,
    testKeyPair6,
    testKeyPair7
} from '../../fixtures/apply.fixtures.js';
import b4a from 'b4a';
import { config } from '../../helpers/config.js';

let tmpDirectory, admin, indexer1, indexer2, reader1, reader2, indexer3, writer;

hook('Initialize nodes for addIndexer tests', async t => {
    const randomChannel = randomBytes(32).toString('hex');
    const baseOptions = {
        enableTxApplyLogs: false,
        enableInteractiveMode: false,
        enableRoleRequester: false,
        enableValidatorObserver: false,
        channel: randomChannel,
    }

    tmpDirectory = await initTemporaryDirectory()
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);

    indexer1 = await setupMsbWriter(admin, 'indexer1', testKeyPair2, tmpDirectory, admin.options);
    indexer2 = await setupMsbWriter(admin, 'indexer2', testKeyPair3, tmpDirectory, admin.options);
    indexer3 = await setupMsbWriter(admin, 'indexer3', testKeyPair4, tmpDirectory, admin.options);

    reader1 = await setupMsbPeer('reader1', testKeyPair5, tmpDirectory, admin.options);
    reader2 = await setupMsbPeer('reader2', testKeyPair6, tmpDirectory, admin.options);
    await setupWhitelist(admin, [reader2.wallet.address]);

    writer = await setupMsbWriter(admin, 'writer', testKeyPair7, tmpDirectory, admin.options);
});

test('handleApplyAddIndexerOperation (apply) - Append addIndexer payload into the base - happy path', async t => {
    // indexer1 is already a writer -> this writer will become an indexer
    // indexer2 is already a writer.
    // reader1 is just a reading node.
    // reader2 is just a reading node.
    // indexer3 is just a writer.
    const oldIndexersEntry = await admin.msb.state.getIndexersEntry();
    const validity = await admin.msb.state.getIndexerSequenceState()
    const assembledAddIndexerMessage = safeEncodeApplyOperation(
        await applyStateMessageFactory(admin.wallet, config)
            .buildCompleteAddIndexerMessage(admin.wallet.address, indexer1.wallet.address, validity)
    );
    await waitIndexer(indexer1, async () => await admin.msb.state.append(assembledAddIndexerMessage))

    await waitForNodeState(admin, indexer1.wallet.address, {
        wk: indexer1.msb.state.writingKey,
        isWhitelisted: true,
        isWriter: true,
        isIndexer: true,
    })

    const nodeInfo = await admin.msb.state.getNodeEntry(indexer1.wallet.address);
    const indexersEntry = await admin.msb.state.getIndexersEntry();

    t.is(indexersEntry.length, oldIndexersEntry.length + 1, 'Indexers entry count should be 2');
    t.is(!!indexersEntry.find(({ key }) => b4a.equals(key, indexer1.msb.state.writingKey)), true, 'Indexer address should not be included in the indexers entry');
    t.is(nodeInfo.isIndexer, true, 'Node info should indicate that the node is an indexer');
});

test('handleApplyAddIndexerOperation (apply) - Append addIndexer payload into the base - idempotence', async t => {
    // indexer1 is already an indexer.
    // indexer2 is already a writer -> this writer will become an indexer
    // writer is already a writer.
    // reader1 is just a reading node.
    // reader2 is just a reading node.
    // indexer3 is just a writer.
    const indexersEntryBefore = await admin.msb.state.getIndexersEntry();
    const assembledAddIndexerMessage = safeEncodeApplyOperation(
        await applyStateMessageFactory(admin.wallet, config)
            .buildCompleteAddIndexerMessage(
                admin.wallet.address,
                indexer2.wallet.address,
                await admin.msb.state.getIndexerSequenceState()
            )
    );
    await waitIndexer(indexer2, async () => await admin.msb.state.append(assembledAddIndexerMessage))

    await waitForNodeState(admin, indexer2.wallet.address, {
        wk: indexer2.msb.state.writingKey,
        isWhitelisted: true,
        isWriter: true,
        isIndexer: true,
    })

    await tryToSyncWriters(admin, indexer1, indexer2);

    const adminSignedLengthBefore = admin.msb.state.getSignedLength();
    const reqAddIndexerMessageAgain = safeEncodeApplyOperation(
        await applyStateMessageFactory(admin.wallet, config)
            .buildCompleteAddIndexerMessage(
                admin.wallet.address,
                indexer2.wallet.address,
                await admin.msb.state.getIndexerSequenceState()
            )
    );

    await admin.msb.state.append(reqAddIndexerMessageAgain);

    await waitForNodeState(admin, indexer2.wallet.address, {
        wk: indexer2.msb.state.writingKey,
        isWhitelisted: true,
        isWriter: true,
        isIndexer: true,
    })

    await waitForNodeState(indexer2, indexer2.wallet.address, {
        wk: indexer2.msb.state.writingKey,
        isWhitelisted: true,
        isWriter: true,
        isIndexer: true,
    })

    const adminSignedLengthAfter = admin.msb.state.getSignedLength();
    const indexersEntry = await admin.msb.state.getIndexersEntry();

    t.is(indexersEntry.length, indexersEntryBefore.length + 1, `Indexers entry count should be ${indexersEntry.length}`);
    t.is(adminSignedLengthBefore, adminSignedLengthAfter, 'Admin signed length should not change');
});

test('handleApplyAddIndexerOperation (apply) - Append addIndexer payload into the base - candidate is not a writer', async t => {
    // indexer1 is already an indexer.
    // indexer2 is already an indexer.
    // reader1 is just a reading node -> will not become an indexer it will still a reader.
    // reader2 is just a reading node.
    // indexer3 is just a writer.
    const indexersEntryBefore = await indexer1.msb.state.getIndexersEntry();
    const validity = await admin.msb.state.getIndexerSequenceState()
    const reqAddReader = safeEncodeApplyOperation(
        await applyStateMessageFactory(admin.wallet, config)
            .buildCompleteAddIndexerMessage(admin.wallet.address, reader1.wallet.address, validity)
    );

    const adminSignedLengthBefore = admin.msb.state.getSignedLength()
    const indexer1SignedLengthBefore = indexer1.msb.state.getSignedLength();
    const indexer2SignedLengthBefore = indexer2.msb.state.getSignedLength();

    await admin.msb.state.append(reqAddReader);
    await tryToSyncWriters(admin, indexer1, indexer2);
    const adminSignedLengthAfter = admin.msb.state.getSignedLength();
    const indexer1SignedLengthAfter = indexer1.msb.state.getSignedLength();
    const indexer2SignedLengthAfter = indexer2.msb.state.getSignedLength();

    const indexersEntry = await admin.msb.state.getIndexersEntry();
    const nodeInfo = await admin.msb.state.getNodeEntry(reader1.wallet.address);

    t.is(indexersEntry.length, indexersEntryBefore.length, `Indexers entry count should be ${indexersEntry.length}`);
    t.is(!!indexersEntry.find(({ key }) => b4a.equals(key, reader1.msb.state.writingKey)), false, 'Reader address should not be included in the indexers entry');
    t.is(nodeInfo, null, 'Node info should be null for reader');
    t.is(adminSignedLengthBefore, adminSignedLengthAfter, 'Admin signed length should not change');
    t.is(indexer1SignedLengthBefore, indexer1SignedLengthAfter, 'Indexer1 signed length should not change');
    t.is(indexer2SignedLengthBefore, indexer2SignedLengthAfter, 'Indexer2 signed length should not change');
});

test('handleApplyAddIndexerOperation (apply) - Append addIndexer payload into the base - candidate is not a writer, but whitelisted', async t => {
    // indexer1 is already an indexer.
    // indexer2 is already an indexer.
    // reader1 is just a reading node.
    // reader2 is just a reading node -> will be whitelisted -> wil try to become an indexer but will not be able to.
    // indexer3 is just a writer.

    const indexersEntryBeforeWhitelist = await admin.msb.state.getIndexersEntry();
    const adminSignedLengthBefore = admin.msb.state.getSignedLength();
    const validity = await admin.msb.state.getIndexerSequenceState()
    const reqAddIndexer2 = safeEncodeApplyOperation(
        await applyStateMessageFactory(admin.wallet, config)
            .buildCompleteAddIndexerMessage(
                admin.wallet.address,
                reader2.wallet.address,
                validity
            )
    );

    await admin.msb.state.append(reqAddIndexer2);
    await tryToSyncWriters(admin, indexer1, indexer2);


    const adminSignedLengthAfter = admin.msb.state.getSignedLength();

    const indexersEntryAfterWhitelist = await admin.msb.state.getIndexersEntry();
    const nodeEntry = await admin.msb.state.getNodeEntry(reader2.wallet.address);

    t.is(indexersEntryAfterWhitelist.length, indexersEntryBeforeWhitelist.length, `Indexers entry count should be ${indexersEntryAfterWhitelist.length}`);
    t.is(!!indexersEntryAfterWhitelist.find(({ key }) => b4a.equals(key, reader2.msb.state.writingKey)), false, 'Reader address should not be included in the indexers entry');
    t.is(nodeEntry.isIndexer, false, 'Node info should not indicate that the node is an indexer');
    t.is(adminSignedLengthBefore, adminSignedLengthAfter, 'Admin signed length should not change');
});

test('handleApplyAddIndexerOperation (apply) - Append addIndexer payload into the base by non admin node (writer)', async t => {
    // indexer1 is already an indexer.
    // indexer2 is already an indexer.
    // reader1 is just a reading node.
    // reader2 is just a reading node.
    // indexer3 is just a writer -> writer will try to add indexer3 as an indexer, however it won't be able to because it is not an admin.
    // writer is just a writer.
    const indexersEntryBefore = await writer.msb.state.getIndexersEntry();
    const adminSignedLengthBefore = admin.msb.state.getSignedLength();

    const validity = await admin.msb.state.getIndexerSequenceState()
    const assembledAddIndexerMessage = safeEncodeApplyOperation(
        await applyStateMessageFactory(admin.wallet, config)
            .buildCompleteAddIndexerMessage(
                admin.wallet.address,
                indexer3.wallet.address,
                validity
            )
    );

    await writer.msb.state.append(assembledAddIndexerMessage);
    await tryToSyncWriters(admin, writer, indexer1, indexer2);

    await waitForNodeState(writer, indexer3.wallet.address, {
        wk: indexer3.msb.state.writingKey,
        isWhitelisted: true,
        isWriter: true,
        isIndexer: false,
    })

    const adminSignedLengthAfter = admin.msb.state.getSignedLength();
    const indexersEntry = await writer.msb.state.getIndexersEntry();
    const nodeEntry = await writer.msb.state.getNodeEntry(indexer3.wallet.address);

    t.is(indexersEntry.length, indexersEntryBefore.length, `Indexers entry count should be ${indexersEntry.length}`);
    t.is(!!indexersEntry.find(({ key }) => b4a.equals(key, indexer3.msb.state.writingKey)), false, 'Indexer address should not be included in the indexers entry');
    t.is(nodeEntry.isIndexer, false, 'Node info should indicate that the node is not an indexer');
    t.is(adminSignedLengthBefore, adminSignedLengthAfter, 'Admin signed length should not change');
});


hook('Clean up addIndexer setup', async t => {
    const toClose = []
    if (admin?.msb) toClose.push(admin.msb.close());
    if (indexer1?.msb) toClose.push(indexer1.msb.close());
    if (indexer2?.msb) toClose.push(indexer2.msb.close());
    if (reader2?.msb) toClose.push(reader2.msb.close());
    if (reader1?.msb) toClose.push(reader1.msb.close());
    if (indexer3?.msb) toClose.push(indexer3.msb.close());
    await Promise.all(toClose)
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});
