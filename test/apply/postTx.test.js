import {hook, test, solo} from 'brittle';
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
    waitDemotion
} from '../utils/setupApplyTests.js';
import {safeDecodeApplyOperation, safeEncodeApplyOperation} from '../../src/utils/protobuf/operationHelpers.js'
import {testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4, testKeyPair5, testKeyPair6, testKeyPair7, testKeyPair8, testKeyPair9, testKeyPair10, testKeyPair11} from '../fixtures/apply.fixtures.js';
import {OperationType} from "../../src/utils/constants.js";
import {addressToBuffer} from "../../src/core/state/utils/address.js";
import { sleep } from '../../src/utils/helpers.js';
import { $TNK } from '../../src/core/state/utils/balance.js';
import CompleteStateMessageOperations from '../../src/messages/completeStateMessages/CompleteStateMessageOperations.js';

let tmpDirectory, admin, writer, externalNode, externalBootstrap;

hook('Initialize nodes', async t => {
    const randomChannel = randomBytes(32).toString('hex');

    const baseOptions = {
        enable_txlogs: false,
        enable_interactive_mode: false,
        enable_role_requester: false,
        enable_validator_observer: true,
        channel: randomChannel,
    }

    tmpDirectory = await initTemporaryDirectory();
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);
    writer = await setupMsbWriter(admin, 'writer1', testKeyPair2, tmpDirectory, admin.options);
    externalNode = await setupMsbPeer('reader1', testKeyPair4, tmpDirectory, admin.options);
    await fundPeer(admin, externalNode, $TNK(1n)) // we fund it since it will deploy stuff
    externalBootstrap = await deployExternalBootstrap(writer, externalNode)
    await tryToSyncWriters(writer, admin)
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
        const maliciousWriter = await setupMsbWriter(admin, 'malicious1', testKeyPair3, tmpDirectory, admin.options);
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
        await maliciousWriter.msb.close()
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
        const maliciousWriter = await setupMsbWriter(admin, 'malicious2', testKeyPair5, tmpDirectory, admin.options);
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
        await maliciousWriter.msb.close()
    });


    t.test('handleApplyTxOperation (apply) - invalid postTx signature (adversary signature - peer signature)', async t => {
        const maliciousWriter = await setupMsbWriter(admin, 'malicious3', testKeyPair6, tmpDirectory, admin.options);
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
        await maliciousWriter.msb.close()
    });

    t.test('handleApplyTxOperation (apply) - invalid txo sub-values', async t => {
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

        const decodedPostTx = safeDecodeApplyOperation(rawTx);
        // is and vs is already covered
        const testCases = [
            { writer: testKeyPair5, name: 'modified tx', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, tx: maliciousValue }; } },
            { writer: testKeyPair6, name: 'modified incoming writingKey', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, iw: maliciousValue }; } },
            { writer: testKeyPair7, name: 'modified incoming nonce', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, in: maliciousValue }; } },
            { writer: testKeyPair8, name: 'modified content hash', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, ch: maliciousValue }; } },
            { writer: testKeyPair9, name: 'modified external bootstrap', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, bs: maliciousValue }; } },
            { writer: testKeyPair10, name: 'modified MSB bootstrap', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, mbs: maliciousValue }; } },
            { writer: testKeyPair11, name: 'modified validator nonce', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, vn: maliciousValue }; } },
        ];

        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i]
            const maliciousWriter = await setupMsbWriter(admin, `subMaliciousWriter${i}`, testCase.writer, tmpDirectory, admin.options);
            // all of these values are buffers 32 bytes long
            const maliciousValue = randomBytes(32);

            const modifiedTxo = testCase.mod(decodedPostTx, maliciousValue);
            const modifiedPostTx = {
                ...decodedPostTx,
                txo: modifiedTxo
            };
            const encodedMaliciousPostTx = safeEncodeApplyOperation(modifiedPostTx);

            await waitDemotion(maliciousWriter, async () => {
                await maliciousWriter.msb.state.append(encodedMaliciousPostTx);
            })

            if (testCase.name === 'modified tx') {
                const result = await admin.msb.state.get(maliciousValue.toString('hex'));
                t.absent(result, `post tx with ${testCase.name} should not be added to the base`);
            } else {
                const result = await admin.msb.state.get(txHash);
                t.absent(result, `post tx with ${testCase.name} should not be added to the base`);
            }

            // should be penalized
            const node = await maliciousWriter.msb.state.getUnsignedNodeEntry(maliciousWriter.wallet.address)
            t.ok(node, 'Result should not be null');
            t.is(node.isWriter, false, 'Result should indicate that the peer is not a writer');
            // clean up after
            await maliciousWriter.msb.close()
        }
    });

    t.test('handleApplyTxOperation (apply) - oversized transaction', async t => {
        const maliciousWriter = await setupMsbWriter(admin, 'malicious4', testKeyPair3, tmpDirectory, admin.options);
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
        await maliciousWriter.msb.close()
    });

    t.test('handleApplyTxOperation (apply) - invalid postTx address (malicious node replaces address)', async t => {
        const maliciousWriter = await setupMsbWriter(admin, 'malicious5', testKeyPair3, tmpDirectory, admin.options);
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
        await maliciousWriter.msb.close()
    });

    t.test('handleApplyTxOperation (apply) - invalid postTx txo.ia (malicious node replaces ia)', async t => {
        const maliciousWriter = await setupMsbWriter(admin, 'malicious6', testKeyPair3, tmpDirectory, admin.options);
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
        await maliciousWriter.msb.close()
    });
})

hook('Clean up postTx setup', async t => {
    // close msbBoostrap and remove temp directory
    if (admin && admin.msb) await admin.msb.close();
    if (writer && writer.msb) await writer.msb.close();
    if (externalNode && externalNode.msb) await externalNode.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});