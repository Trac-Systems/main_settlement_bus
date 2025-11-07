import b4a from 'b4a';
import { test, hook } from '../utils/wrapper.js';
import {
    setupMsbAdmin,
    initTemporaryDirectory,
    randomBytes,
    setupMsbWriter,
    waitForHash,
    removeTemporaryDirectory
} from '../utils/setupApplyTests.js';
import {
    testKeyPair1,
    testKeyPair2,
    testKeyPair3,
    testKeyPair4
} from '../fixtures/apply.fixtures.js';
import PartialStateMessageOperations from "../../src/messages/partialStateMessages/PartialStateMessageOperations.js";
import CompleteStateMessageOperations from '../../src/messages/completeStateMessages/CompleteStateMessageOperations.js';
import { $TNK } from '../../src/core/state/utils/balance.js';

const buildTransfer = async (admin, from, to, amount) => {
    const txValidity = await from.msb.state.getIndexerSequenceState()
    const tx = await PartialStateMessageOperations.assembleTransferOperationMessage(from.wallet, to.wallet.address, b4a.toString(amount, 'hex'), b4a.toString(txValidity, 'hex'))
    return { 
        raw: await CompleteStateMessageOperations.assembleCompleteTransferOperationMessage(
            admin.wallet,
            tx.address,
            b4a.from(tx.tro.tx, 'hex'),
            b4a.from(tx.tro.txv, 'hex'),
            b4a.from(tx.tro.in, 'hex'),
            tx.tro.to,
            b4a.from(tx.tro.am, 'hex'),
            b4a.from(tx.tro.is, 'hex'),
        ),
        hash: tx.tro.tx
    }
}

let admin, writer1, writer2, writer3, tmpDirectory;

hook('Initialize nodes for addWriter tests', async t => {
    const randomChannel = randomBytes(32).toString('hex');
    const baseOptions = {
        enable_tx_apply_logs: false,
        enable_interactive_mode: false,
        enable_role_requester: false,
        channel: randomChannel,
        enable_validator_observer: false
    }
    tmpDirectory = await initTemporaryDirectory();
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);
    writer1 = await setupMsbWriter(admin, 'writer1', testKeyPair2, tmpDirectory, admin.options)
    writer2 = await setupMsbWriter(admin, 'writer2', testKeyPair3, tmpDirectory, admin.options)
    writer3 = await setupMsbWriter(admin, 'writer3', testKeyPair4, tmpDirectory, admin.options)
});

test('handleApplyTransferOperation (apply) - append two transfers', async t => {
    const first = await buildTransfer(admin, writer2, writer3, $TNK(1n))
    const second = await buildTransfer(admin, writer2, writer3, $TNK(1n))
    const raw = [first.raw, second.raw]
    await admin.msb.state.base.append(raw)
    await Promise.all(
        [await waitForHash(writer2, first.hash), await waitForHash(writer2, second.hash)]
    );

    const firstResult = await writer2.msb.state.get(first.hash)
    const secondResult = await writer2.msb.state.get(second.hash)
    t.ok(firstResult, 'First result should not be null');
    t.ok(secondResult, 'Second result should not be null');
})

hook('Clean up handleApplyTransferOperation setup', async t => {
    const toClose = []
    if (admin?.msb) toClose.push(admin.msb.close());
    if (writer1?.msb) toClose.push(writer1.msb.close());
    if (writer2?.msb) toClose.push(writer2.msb.close());
    if (writer3?.msb) toClose.push(writer3.msb.close());

    await Promise.all(toClose)
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});