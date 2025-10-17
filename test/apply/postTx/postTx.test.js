import {hook, test} from '../../utils/wrapper.js';
import b4a from "b4a";
import {
    generatePostTx,
    initTemporaryDirectory,
    randomBytes,
    removeTemporaryDirectory,
    setupMsbAdmin,
    setupMsbPeer,
    setupMsbWriter,
    tick,
    fundPeer,
    deployExternalBootstrap,
    tryToSyncWriters,
    waitForHash,
    waitDemotion,
    promoteToWriter
} from '../../utils/setupApplyTests.js';
import {safeDecodeApplyOperation, safeEncodeApplyOperation} from '../../../src/utils/protobuf/operationHelpers.js'
import {testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4, testKeyPair5} from '../../fixtures/apply.fixtures.js';
import {OperationType} from "../../../src/utils/constants.js";
import {addressToBuffer} from "../../../src/core/state/utils/address.js";
import { sleep } from '../../../src/utils/helpers.js';
import { $TNK } from '../../../src/core/state/utils/balance.js';
import CompleteStateMessageOperations from '../../../src/messages/completeStateMessages/CompleteStateMessageOperations.js';

let tmpDirectory, admin, writer, externalNode, externalBootstrap, maliciousPeer;

const close = async node => {
    // await node.msb.state.base.flush()
    await node.msb.close()
}

hook('Initialize nodes', async t => {
    const randomChannel = randomBytes(32).toString('hex');

    const baseOptions = {
        enable_txlogs: false,
        enable_interactive_mode: false,
        enable_role_requester: false,
        enable_validator_observer: false,
        channel: randomChannel,
    }

    tmpDirectory = await initTemporaryDirectory();
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);
    writer = await setupMsbWriter(admin, 'writer1', testKeyPair2, tmpDirectory, admin.options);
    externalNode = await setupMsbPeer('reader1', testKeyPair4, tmpDirectory, admin.options);
    await fundPeer(admin, externalNode, $TNK(1n)) // we fund it since it will deploy stuff
    externalBootstrap = await deployExternalBootstrap(writer, externalNode)
    await tryToSyncWriters(writer, admin)
    maliciousPeer = await setupMsbPeer('maliciousWriter', testKeyPair5, tmpDirectory, admin.options);
    await fundPeer(admin, maliciousPeer, $TNK(10n))
});

test('handleApplyTxOperation (apply) - Append POST_TX into the base - Happy path', async t => {
    const {postTx, txHash} = await generatePostTx(writer, externalNode, externalBootstrap)
    const rawTx = await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
        writer.msb.wallet,
        postTx.address,
        b4a.from(postTx.txo.tx, 'hex'),
        b4a.from(postTx.txo.txv, 'hex'),
        b4a.from(postTx.txo.iw, 'hex'),
        b4a.from(postTx.txo.in, 'hex'),
        b4a.from(postTx.txo.ch, 'hex'),
        b4a.from(postTx.txo.is, 'hex'),
        b4a.from(postTx.txo.bs, 'hex'),
        b4a.from(postTx.txo.mbs, 'hex')
    );
    await writer.msb.state.append(rawTx)
    await waitForHash(writer, txHash)
    await tick();

    const result = await writer.msb.state.get(txHash);
    t.ok(result, 'post tx added to the base');
})

test('handleApplyTxOperation (apply) - negative', t => {
    // TODO: This test has been disabled because we got rid of JSON schema validation in favor of protobuf validation. To enable this test again, we need to write a fake protobuf schema for postTx (maybe also for other operations) and forge an invalid payload.

    // t.test('nested object in postTx', async t => {
    //     //is already tested in /test/check/postTx.test.js
    //     let { postTx, preTxHash: txHash } = await generatePostTx(admin.msb, admin.wallet, legitWallet)
    //     postTx = {
    //         ...postTx,
    //         foo: 'bar',
    //     }
    //     await admin.msb.state.append(postTx);
    //     await tick();
    
    //     t.absent(await admin.msb.state.get(txHash), 'post tx with nested object should not be added to the base');
    //     postTx = {
    //         ...postTx,
    //         value: {
    //             ...postTx.value,
    //             foo: 'bar',
    //         }
    //     }
    //     await admin.msb.state.append(postTx);
    //     await tick();
    //     t.absent(await admin.msb.state.get(txHash), 'post tx with nested object in value property should not be added to the base');
    
    // })

    t.test('handleApplyTxOperation (apply) - different operation type', async t => {
        const maliciousWriter = await promoteToWriter(admin, maliciousPeer)
        const {postTx, txHash} = await generatePostTx(writer, externalNode, externalBootstrap)
        const rawTx = await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
            writer.msb.wallet,
            postTx.address,
            b4a.from(postTx.txo.tx, 'hex'),
            b4a.from(postTx.txo.txv, 'hex'),
            b4a.from(postTx.txo.iw, 'hex'),
            b4a.from(postTx.txo.in, 'hex'),
            b4a.from(postTx.txo.ch, 'hex'),
            b4a.from(postTx.txo.is, 'hex'),
            b4a.from(postTx.txo.bs, 'hex'),
            b4a.from(postTx.txo.mbs, 'hex')
        );

        const replaceByte = (input, index, replacement) => {
            const bufferHex = b4a.from(input, 'hex');
            bufferHex[index] = replacement;
            return b4a.from(bufferHex, 'hex');
        }

        const replacedPostTx = replaceByte(b4a.toString(rawTx, 'hex'), 1, OperationType.ADD_ADMIN);

        await waitDemotion(maliciousWriter, async () => {
            await maliciousWriter.msb.state.append(replacedPostTx);
        })
        await tick();

        t.absent(await writer.msb.state.get(txHash), 'post tx with incorrect operation type should not be added to the base');
    })

    // t.test('handleApplyTxOperation (apply) - replay attack', async t => {
    //     const {postTx, txHash} = await generatePostTx(writer, externalNode, externalBootstrap)
    //     const rawTx = await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
    //         writer.msb.wallet,
    //         postTx.address,
    //         b4a.from(postTx.txo.tx, 'hex'),
    //         b4a.from(postTx.txo.txv, 'hex'),
    //         b4a.from(postTx.txo.iw, 'hex'),
    //         b4a.from(postTx.txo.in, 'hex'),
    //         b4a.from(postTx.txo.ch, 'hex'),
    //         b4a.from(postTx.txo.is, 'hex'),
    //         b4a.from(postTx.txo.bs, 'hex'),
    //         b4a.from(postTx.txo.mbs, 'hex')
    //     );
    //     await writer.msb.state.append(rawTx);
    //     await tick();
    //     await sleep(500)
    //     const firstRes = await writer.msb.state.base.view.get(txHash);

    //     await writer.msb.state.append(rawTx);
    //     await sleep(500)
    //     await tick();
    //     const secondRes = await writer.msb.state.base.view.get(txHash);

    //     t.is(firstRes.seq, secondRes.seq, 'post tx should not be added to the base twice');
    // })

    t.test('handleApplyTxOperation (apply) - invalid postTx signature (adversary signature - writer signature)', async t => {
        const maliciousWriter = await promoteToWriter(admin, maliciousPeer)
        const {postTx, txHash} = await generatePostTx(writer, externalNode, externalBootstrap)
        const rawTx = await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
            writer.msb.wallet,
            postTx.address,
            b4a.from(postTx.txo.tx, 'hex'),
            b4a.from(postTx.txo.txv, 'hex'),
            b4a.from(postTx.txo.iw, 'hex'),
            b4a.from(postTx.txo.in, 'hex'),
            b4a.from(postTx.txo.ch, 'hex'),
            b4a.from(postTx.txo.is, 'hex'),
            b4a.from(postTx.txo.bs, 'hex'),
            b4a.from(postTx.txo.mbs, 'hex')
        );

        let decodedPostTx = safeDecodeApplyOperation(rawTx);

        decodedPostTx.txo.vs = maliciousWriter.wallet.sign(
            b4a.concat([decodedPostTx.txo.tx, decodedPostTx.txo.vn])
        );
        const encodedMaliciousPostTx = safeEncodeApplyOperation(decodedPostTx);

        await maliciousWriter.msb.state.append(encodedMaliciousPostTx);
        await tick();

        const result = await admin.msb.state.get(txHash);
        t.absent(result, 'adversary\'s fake signature should not be added to the base');
    });


    t.test('handleApplyTxOperation (apply) - invalid postTx signature (adversary signature - peer signature)', async t => {
        const maliciousWriter = await promoteToWriter(admin, maliciousPeer)
        const {postTx, txHash} = await generatePostTx(writer, externalNode, externalBootstrap)
        const rawTx = await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
            writer.msb.wallet,
            postTx.address,
            b4a.from(postTx.txo.tx, 'hex'),
            b4a.from(postTx.txo.txv, 'hex'),
            b4a.from(postTx.txo.iw, 'hex'),
            b4a.from(postTx.txo.in, 'hex'),
            b4a.from(postTx.txo.ch, 'hex'),
            b4a.from(postTx.txo.is, 'hex'),
            b4a.from(postTx.txo.bs, 'hex'),
            b4a.from(postTx.txo.mbs, 'hex')
        );

        let decodedPostTx = safeDecodeApplyOperation(rawTx);

        decodedPostTx.txo.is = maliciousWriter.wallet.sign(
            decodedPostTx.txo.tx
        );
        const encodedMaliciousPostTx = safeEncodeApplyOperation(decodedPostTx);
        await maliciousWriter.msb.state.append(encodedMaliciousPostTx);
        await sleep(500)
        await tick();

        const result = await writer.msb.state.get(txHash);
        t.absent(result, 'adversary prepared fake postTx signature (third key pair) should not be added to the base');
    });

    t.test('handleApplyTxOperation (apply) - oversized transaction', async t => {
        const maliciousWriter = await promoteToWriter(admin, maliciousPeer)
        const {postTx, txHash} = await generatePostTx(writer, externalNode, externalBootstrap)
        const rawTx = await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
            writer.msb.wallet,
            postTx.address,
            b4a.from(postTx.txo.tx, 'hex'),
            b4a.from(postTx.txo.txv, 'hex'),
            b4a.from(postTx.txo.iw, 'hex'),
            b4a.from(postTx.txo.in, 'hex'),
            b4a.from(postTx.txo.ch, 'hex'),
            b4a.from(postTx.txo.is, 'hex'),
            b4a.from(postTx.txo.bs, 'hex'),
            b4a.from(postTx.txo.mbs, 'hex')
        );
        let decodedPostTx = safeDecodeApplyOperation(rawTx);

        decodedPostTx.txo.vn = randomBytes(5000);
        const encodedMaliciousPostTx = safeEncodeApplyOperation(decodedPostTx);

        await maliciousWriter.msb.state.append(encodedMaliciousPostTx);
        await tick();
        await sleep(500)
        const result = await admin.msb.state.get(txHash);
        t.absent(result, 'oversized post tx should not be added to the base');
    });

    t.test('handleApplyTxOperation (apply) - invalid postTx address (malicious node replaces address)', async t => {
        const maliciousWriter = await promoteToWriter(admin, maliciousPeer)
        const {postTx, txHash} = await generatePostTx(writer, externalNode, externalBootstrap)
        const rawTx = await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
            writer.msb.wallet,
            postTx.address,
            b4a.from(postTx.txo.tx, 'hex'),
            b4a.from(postTx.txo.txv, 'hex'),
            b4a.from(postTx.txo.iw, 'hex'),
            b4a.from(postTx.txo.in, 'hex'),
            b4a.from(postTx.txo.ch, 'hex'),
            b4a.from(postTx.txo.is, 'hex'),
            b4a.from(postTx.txo.bs, 'hex'),
            b4a.from(postTx.txo.mbs, 'hex')
        );
        let decodedPostTx = safeDecodeApplyOperation(rawTx);
        decodedPostTx.address = addressToBuffer(maliciousWriter.wallet.address);
        const encodedMaliciousPostTx = safeEncodeApplyOperation(decodedPostTx);
        await maliciousWriter.msb.state.append(encodedMaliciousPostTx);
        await tick();
        await sleep(500)
        const result = await admin.msb.state.get(txHash);
        t.absent(result, 'post tx with malicious address should not be added to the base');
    });

    t.test('handleApplyTxOperation (apply) - invalid postTx txo.ia (malicious node replaces ia)', async t => {
        const maliciousWriter = await promoteToWriter(admin, maliciousPeer)
        const {postTx, txHash} = await generatePostTx(writer, externalNode, externalBootstrap)
        const rawTx = await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
            writer.msb.wallet,
            postTx.address,
            b4a.from(postTx.txo.tx, 'hex'),
            b4a.from(postTx.txo.txv, 'hex'),
            b4a.from(postTx.txo.iw, 'hex'),
            b4a.from(postTx.txo.in, 'hex'),
            b4a.from(postTx.txo.ch, 'hex'),
            b4a.from(postTx.txo.is, 'hex'),
            b4a.from(postTx.txo.bs, 'hex'),
            b4a.from(postTx.txo.mbs, 'hex')
        );
        let decodedPostTx = safeDecodeApplyOperation(rawTx);
        decodedPostTx.txo.ia = addressToBuffer(maliciousWriter.wallet.address);
        const encodedMaliciousPostTx = safeEncodeApplyOperation(decodedPostTx);
        await writer.msb.state.append(encodedMaliciousPostTx);
        await tick();
        const result = await admin.msb.state.get(txHash);
        t.absent(result, 'post tx with malicious txo.ia should not be added to the base');
    });
})

hook('Clean up postTx setup', async t => {
    // close msbBoostrap and remove temp directory
    if (writer?.msb) await close(writer)
    if (externalNode?.msb) await close(externalNode)
    if (admin?.msb) await close(admin)
    if (maliciousPeer?.msb) await close(maliciousPeer)
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});