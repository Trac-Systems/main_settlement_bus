import b4a from 'b4a';
import { test, hook } from '../../helpers/wrapper.js';

import {
    setupMsbAdmin,
    setupMsbPeer,
    setupWhitelist,
    fundPeer,
    initTemporaryDirectory,
    removeTemporaryDirectory,
    randomBytes,
    setupMsbIndexer,
    setupMsbWriter,
    tryToSyncWriters,
    waitForNodeState,
    waitWritable
} from '../../helpers/setupApplyTests.js';
import {
    testKeyPair1,
    testKeyPair2,
    testKeyPair3,
    testKeyPair4,
    testKeyPair5,
    testKeyPair6
} from '../../fixtures/apply.fixtures.js';
import { applyStateMessageFactory } from '../../../src/messages/state/applyStateMessageFactory.js';
import { safeEncodeApplyOperation } from '../../../src/utils/protobuf/operationHelpers.js';
import {ZERO_WK} from '../../../src/utils/buffer.js';
import { $TNK } from '../../../src/core/state/utils/balance.js';
import { config } from '../../helpers/config.js';

const sendAddWriter = async (invoker, broadcaster) => {
    const validity = await invoker.msb.state.getIndexerSequenceState()
    const req = await applyStateMessageFactory(invoker.wallet, config)
        .buildPartialAddWriterMessage(
            invoker.wallet.address,
            b4a.toString(invoker.msb.state.writingKey, 'hex'),
            b4a.toString(validity, 'hex'),
            'json'
        );

    const rawPayload = await applyStateMessageFactory(broadcaster.wallet, config)
        .buildCompleteAddWriterMessage(
            req.address,
            b4a.from(req.rao.tx, 'hex'),
            b4a.from(req.rao.txv, 'hex'),
            b4a.from(req.rao.iw, 'hex'),
            b4a.from(req.rao.in, 'hex'),
            b4a.from(req.rao.is, 'hex')
        );
    return await broadcaster.msb.state.append(safeEncodeApplyOperation(rawPayload))
}

let admin, writer1, writer2, writer3, writer4, indexer1, tmpDirectory;

hook('Initialize nodes for addWriter tests', async t => {
    const randomChannel = randomBytes(32).toString('hex');
    const baseOptions = {
        enableTxApplyLogs: false,
        enableInteractiveMode: false,
        enableRoleRequester: false,
        channel: randomChannel,
        enableValidatorObserver: false
    }
    tmpDirectory = await initTemporaryDirectory();
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);
    writer1 = await setupMsbPeer('writer1', testKeyPair2, tmpDirectory, admin.options); // just a peer, not a writer yet
    await fundPeer(admin, writer1, $TNK(10n))
    writer2 = await setupMsbPeer('writer2', testKeyPair3, tmpDirectory, admin.options); // just a peer, not a writer yet
    await fundPeer(admin, writer2, $TNK(10n))
    writer3 = await setupMsbPeer('writer3', testKeyPair4, tmpDirectory, admin.options); // just a peer, not a writer yet
    await fundPeer(admin, writer3, $TNK(10n))
    writer4 = await setupMsbPeer('writer4', testKeyPair5, tmpDirectory, admin.options); // just a peer, not a writer yet
    indexer1 = await setupMsbWriter(admin, 'indexer1', testKeyPair6, tmpDirectory, admin.options); // writer and cannot be funded

    const whitelistKeys = [writer1.wallet.address, writer2.wallet.address, writer3.wallet.address, indexer1.wallet.address];
    await setupWhitelist(admin, whitelistKeys);
    indexer1 = await setupMsbIndexer(indexer1, admin);
});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - happy path for peer', async (t) => {
    // writer1 is not a writer yet, but it is whitelisted -> It will become a writer after the operation.
    // writer2 is not a writer yet, but it is whitelisted.
    // writer3 is not a writer yet, but it is whitelisted.
    // writer4 is reader
    // indexer1 is already an indexer.
    await admin.msb.state.append(null);
    await waitWritable(admin, writer1, async () => await sendAddWriter(writer1, admin))
    await waitForNodeState(admin, writer1.wallet.address, {
        wk: writer1.msb.state.writingKey,
        isWhitelisted: true,
        isWriter: true,
        isIndexer: false
    });
    await tryToSyncWriters(writer1, indexer1);

    const result = await admin.msb.state.getNodeEntry(writer1.wallet.address); // check if the writer entry was added successfully in the base

    t.ok(result, 'Result should not be null');
    t.ok(b4a.equals(result.wk, writer1.msb.state.writingKey), 'Result writing key should match writer writing key');
    t.ok(result.isWriter, 'Result should indicate that the peer is a valid writer');
    t.is(result.isIndexer, false, 'Result should not indicate that the peer is an indexer');
});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - doesnt change the signed length', async (t) => {
    // writer1 is already a writer.
    // writer2 is not a writer yet, but it is whitelisted -> It will become a writer after the operation.
    // writer3 is not a writer yet, but it is whitelisted.
    // writer4 is reader
    // indexer1 is already an indexer.
    await admin.msb.state.append(null);
    await waitWritable(admin, writer2, async () => await sendAddWriter(writer2, admin))
    await tryToSyncWriters(writer2, admin, indexer1);

    await waitForNodeState(writer2, writer2.wallet.address, {
        wk: writer2.msb.state.writingKey,
        isWhitelisted: true,
        isWriter: true,
        isIndexer: false
    });

    const signedLengthAdminBefore = admin.msb.state.getSignedLength();
    const signedLengthWriter2Before = writer2.msb.state.getSignedLength();

    await sendAddWriter(writer2, admin)

    await tryToSyncWriters(admin, writer2, indexer1);
    await waitForNodeState(writer2, writer2.wallet.address, {
        wk: writer2.msb.state.writingKey,
        isWhitelisted: true,
        isWriter: true,
        isIndexer: false
    });

    const signedLengthAdminAfter = admin.msb.state.getSignedLength();
    const signedLengthWriter2After = writer2.msb.state.getSignedLength();

    t.is(signedLengthAdminBefore, signedLengthAdminAfter, 'Admin signed length should not change');
    t.is(signedLengthWriter2Before, signedLengthWriter2After, 'Writer2 signed length should not change');
});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - ZERO_WK', async (t) => {
    // writer1 is already a writer.
    // writer2 is already a writer.
    // writer3 is not a writer yet, but it is whitelisted and won't become a writer.
    // writer4 is reader
    // indexer1 is already an indexer.
    const signedLengthAdminBefore = admin.msb.state.getSignedLength();
    const signedLengthWriter1Before = writer1.msb.state.getSignedLength();

    const validity = await writer3.msb.state.getIndexerSequenceState()
    const req = await applyStateMessageFactory(writer3.wallet, config)
        .buildPartialAddWriterMessage(
            writer3.wallet.address,
            b4a.toString(ZERO_WK, 'hex'),
            b4a.toString(validity, 'hex'),
            'json'
        );

    const rawPayload = await applyStateMessageFactory(admin.wallet, config)
        .buildCompleteAddWriterMessage(
            admin.wallet.address,
            b4a.from(req.rao.tx, 'hex'),
            b4a.from(req.rao.txv, 'hex'),
            b4a.from(req.rao.iw, 'hex'),
            b4a.from(req.rao.in, 'hex'),
            b4a.from(req.rao.is, 'hex')
        );
    await admin.msb.state.append(safeEncodeApplyOperation(rawPayload))
    await tryToSyncWriters(writer3, admin, writer1, writer2, indexer1);

    const result = await writer1.msb.state.getNodeEntry(writer3.wallet.address);
    const signedLengthAdminAfter = admin.msb.state.getSignedLength();
    const signedLengthWriter1After = writer1.msb.state.getSignedLength();

    t.is(signedLengthAdminBefore, signedLengthAdminAfter, 'admin signed length should not change');
    t.is(signedLengthWriter1Before, signedLengthWriter1After, 'Writer1 signed length should not change');
    t.ok(result, 'Result should not be null');
    t.ok(!b4a.equals(result.wk, writer3.msb.state.writingKey), 'Result writing key should not match writer writing key');
    t.ok(b4a.equals(result.wk, ZERO_WK), 'Result writing key should be ZERO_WK');
    t.is(result.isWriter, false, 'Result should indicate that the peer is not a writer');
    //t.is(writer3.msb.state.isWritable(), false, 'peer should not be writable');
});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - node is already an indexer', async (t) => {
    // writer1 is already a writer.
    // writer2 is already a writer.
    // writer3 is not a writer, but it is whitelisted.
    // writer4 is reader
    // indexer1 is already an indexer.
    const resultBefore = await admin.msb.state.getNodeEntry(indexer1.wallet.address);
    await indexer1.msb.state.append(null);
    const signedLengthAdminBefore = admin.msb.state.getSignedLength();
    const signedLengthIndexer1Before = indexer1.msb.state.getSignedLength();

    await sendAddWriter(indexer1, admin)
    await tryToSyncWriters(indexer1, admin, writer1, writer2);

    const result = await admin.msb.state.getNodeEntry(indexer1.wallet.address); // check if the writer entry was added successfully in the base
    const signedLengthAdminAfter = admin.msb.state.getSignedLength();
    const signedLengthIndexer1After = indexer1.msb.state.getSignedLength();

    t.is(signedLengthAdminBefore, signedLengthAdminAfter, 'Admin signed length should not change');
    t.is(signedLengthIndexer1Before, signedLengthIndexer1After, 'Indexer1 signed length should not change');
    t.ok(result, 'Result should not be null');
    t.ok(b4a.equals(result.wk, indexer1.msb.state.writingKey), 'Result writing key should match writer writing key');
    t.is(result.isWriter, true, 'Result should indicate that the peer is a writer');
    t.is(result.isIndexer, true, 'Result should indicate that the peer is an indexer');
    t.is(indexer1.msb.state.isWritable(), true, 'peer should still be writable');
    t.is(indexer1.msb.state.isIndexer(), true, 'peer should still be an indexer');
});

test('handleApplyAddWriterOperation (apply) - Append addWriter payload into the base - non-whitelisted peer', async (t) => {
    // writer1 is already a writer
    // writer2 is already a writer
    // writer3 is already a writer
    // writer4 is reader -> this node will not become a writer.
    // indexer1 is already an indexer
    await writer4.msb.state.append(null);
    const signedLengthAdminBefore = admin.msb.state.getSignedLength();

    await sendAddWriter(writer4, admin)
    await tryToSyncWriters(writer4, writer1, writer2, writer3, indexer1);

    const result = await writer2.msb.state.getNodeEntry(writer4.wallet.address); // check if the writer entry was added successfully in the base
    const signedLengthAdminAfter = admin.msb.state.getSignedLength();

    t.is(signedLengthAdminBefore, signedLengthAdminAfter, 'Admin signed length should not change');
    t.is(writer4.msb.state.isWritable(), false, 'peer should not be writable');
    t.is(writer4.msb.state.isIndexer(), false, 'peer should not be an indexer');
    t.is(result, null, 'Result should be null');
});

test('handleApplyAddWriterOperation (apply) - validator and invoker are the same', async (t) => {
    // TODO: Implement when apply tests are fixed
    t.pass('Skipping test: Placeholder. To be implemented later.');
});

hook('Clean up addWriter setup', async t => {
    const toClose = []
    // close msb instances and remove temp directory
    if (admin?.msb) toClose.push(admin.msb.close());
    if (writer1?.msb) toClose.push(writer1.msb.close());
    if (writer2?.msb) toClose.push(writer2.msb.close());
    if (writer3?.msb) toClose.push(writer3.msb.close());
    if (writer4?.msb) toClose.push(writer4.msb.close());
    if (indexer1?.msb) toClose.push(indexer1.msb.close());

    await Promise.all(toClose)
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
})
