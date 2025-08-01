import {hook, test} from 'brittle';
import {
    generatePostTx,
    initTemporaryDirectory,
    randomBytes,
    removeTemporaryDirectory,
    setupMsbAdmin,
    setupMsbPeer,
    setupMsbWriter,
    tick
} from '../utils/setupApplyTests.js';
import {safeDecodeApplyOperation, safeEncodeApplyOperation} from '../../src/utils/protobuf/operationHelpers.js'
import {testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4} from '../fixtures/apply.fixtures.js';
import b4a from "b4a";
import {OperationType} from "../../src/utils/constants.js";
import {addressToBuffer} from "../../src/core/state/utils/address.js";

let tmpDirectory, admin, writer, maliciousWriter, externalNode;

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
    writer = await setupMsbWriter(admin, 'writer', testKeyPair2, tmpDirectory, admin.options);
    maliciousWriter = await setupMsbWriter(admin, 'malicious', testKeyPair3, tmpDirectory, admin.options);
    externalNode = await setupMsbPeer('reader', testKeyPair4, tmpDirectory, admin.options);

});

test('handleApplyTxOperation (apply) - Append POST_TX into the base - Happy path', async t => {
    const {postTx, txHash} = await generatePostTx(writer, externalNode)
    await writer.msb.state.append(postTx);
    await tick();
    await tick();

    const result = await writer.msb.state.get(txHash);
    t.ok(result, 'post tx added to the base');
})

test('handleApplyTxOperation (apply) - negative', async t => {
    // TODO: This test has been disabled because we got rid of JSON schema validation in favor of protobuf validation. To enable this test again, we need to write a fake protobuf schema for postTx (maybe also for other operations) and forge an invalid payload.

    // t.test('sanitizePostTx - nested object in postTx', async t => {
    //     //sanitizePostTx is already tested in /test/check/postTx.test.js
    //     let { postTx, preTxHash: txHash } = await generatePostTx(admin.msb, admin.wallet, legitWallet)
    //     postTx = {
    //         ...postTx,
    //         foo: 'bar',
    //     }
    //     await admin.msb.state.append(postTx);
    //     await tick();
    //
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
    //
    // })

    //
    t.test('handleApplyTxOperation (apply) - different operation type', async t => {
        const {postTx, txHash} = await generatePostTx(writer, externalNode)

        const replaceByte = (input, index, replacement) => {
            const bufferHex = b4a.from(input, 'hex');
            bufferHex[index] = replacement;
            return b4a.from(bufferHex, 'hex');
        }

        const replacedPostTx = replaceByte(postTx, 1, OperationType.ADD_ADMIN);

        await writer.msb.state.append(replacedPostTx);
        await tick();

        t.absent(await writer.msb.state.get(txHash), 'post tx with incorrect operation type should not be added to the base');
    })

    t.test('handleApplyTxOperation (apply) - replay attack', async t => {
        const {postTx, txHash} = await generatePostTx(writer, externalNode)
        await writer.msb.state.append(postTx);
        await tick();
        const firstRes = await writer.msb.state.get(txHash);

        await writer.msb.state.append(postTx);
        await tick();

        const secondRes = await writer.msb.state.get(txHash);


        t.is(firstRes.seq, secondRes.seq, 'post tx should not be added to the base twice');
    })

    t.test('handleApplyTxOperation (apply) - invalid postTx signature (adversary signature - writer signature)', async t => {
        const {postTx, txHash} = await generatePostTx(writer, externalNode)

        let decodedPostTx = safeDecodeApplyOperation(postTx);

        decodedPostTx.txo.vs = maliciousWriter.wallet.sign(
            b4a.concat([decodedPostTx.txo.tx, decodedPostTx.txo.vn])
        );
        const encodedMaliciousPostTx = safeEncodeApplyOperation(decodedPostTx);

        await writer.msb.state.append(encodedMaliciousPostTx);
        await tick();

        const result = await admin.msb.state.get(txHash);
        t.absent(result, 'adversary\'s fake signature should not be added to the base');
    });


    t.test('handleApplyTxOperation (apply) - invalid postTx signature (adversary signature - peer signature)', async t => {
        const {postTx, txHash} = await generatePostTx(writer, externalNode)

        let decodedPostTx = safeDecodeApplyOperation(postTx);

        decodedPostTx.txo.is = maliciousWriter.wallet.sign(
            decodedPostTx.txo.tx
        );
        const encodedMaliciousPostTx = safeEncodeApplyOperation(decodedPostTx);
        await writer.msb.state.append(encodedMaliciousPostTx);
        await tick();

        const result = await writer.msb.state.get(txHash);
        t.absent(result, 'adversary prepared fake postTx signature (third key pair) should not be added to the base');
    });

    t.test('handleApplyTxOperation (apply) - invalid txo sub-values', async t => {
        const {postTx, txHash} = await generatePostTx(writer, externalNode)
        const decodedPostTx = safeDecodeApplyOperation(postTx);
        // is and vs is already covered
        const testCases = [
            { name: 'modified tx', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, tx: maliciousValue }; } },
            // { name: 'modified incoming address', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, ia: maliciousValue }; } },
            { name: 'modified incoming writingKey', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, iw: maliciousValue }; } },
            { name: 'modified incoming nonce', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, in: maliciousValue }; } },
            { name: 'modified content hash', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, ch: maliciousValue }; } },
            { name: 'modified external bootstrap', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, bs: maliciousValue }; } },
            { name: 'modified MSB bootstrap', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, mbs: maliciousValue }; } },
            { name: 'modified validator nonce', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, vn: maliciousValue }; } },
        ];

        for (const testCase of testCases) {
            // all of these values are buffers 32 bytes long
            const maliciousValue = randomBytes(32);

            const modifiedTxo = testCase.mod(decodedPostTx, maliciousValue);
            const modifiedPostTx = {
                ...decodedPostTx,
                txo: modifiedTxo
            };
            const encodedMaliciousPostTx = safeEncodeApplyOperation(modifiedPostTx);

            await writer.msb.state.append(encodedMaliciousPostTx);
            await tick();

            if (testCase.name === 'modified tx') {
                const result = await admin.msb.state.get(maliciousValue.toString('hex'));
                t.absent(result, `post tx with ${testCase.name} should not be added to the base`);
            } else {
                const result = await admin.msb.state.get(txHash);
                t.absent(result, `post tx with ${testCase.name} should not be added to the base`);
            }
        }
    });

    t.test('handleApplyTxOperation (apply) - oversized transaction', async t => {
        const {postTx, txHash} = await generatePostTx(writer, externalNode)
        let decodedPostTx = safeDecodeApplyOperation(postTx);

        decodedPostTx.txo.vn = randomBytes(5000);
        const encodedMaliciousPostTx = safeEncodeApplyOperation(decodedPostTx);

        await writer.msb.state.append(encodedMaliciousPostTx);
        await tick();
        const result = await admin.msb.state.get(txHash);
        t.absent(result, 'oversized post tx should not be added to the base');
    });

    t.test('handleApplyTxOperation (apply) - invalid postTx address (malicious node replaces address)', async t => {
        const {postTx, txHash} = await generatePostTx(writer, externalNode)
        let decodedPostTx = safeDecodeApplyOperation(postTx);
        decodedPostTx.address = addressToBuffer(maliciousWriter.wallet.address);
        const encodedMaliciousPostTx = safeEncodeApplyOperation(decodedPostTx);
        await writer.msb.state.append(encodedMaliciousPostTx);
        await tick();
        const result = await admin.msb.state.get(txHash);
        t.absent(result, 'post tx with malicious address should not be added to the base');
    });

    t.test('handleApplyTxOperation (apply) - invalid postTx txo.ia (malicious node replaces ia)', async t => {
        const {postTx, txHash} = await generatePostTx(writer, externalNode)
        let decodedPostTx = safeDecodeApplyOperation(postTx);
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
    if (admin && admin.msb) await admin.msb.close();
    if (writer && writer.msb) await writer.msb.close();
    if (externalNode && externalNode.msb) await externalNode.msb.close();
    if (maliciousWriter && maliciousWriter.msb) await maliciousWriter.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});