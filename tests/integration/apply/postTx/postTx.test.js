import {hook, test} from '../../../helpers/wrapper.js';
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
} from '../../../helpers/setupApplyTests.js';
import {safeDecodeApplyOperation, safeEncodeApplyOperation} from '../../../../src/utils/protobuf/operationHelpers.js'
import {testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4, testKeyPair5} from '../../../fixtures/apply.fixtures.js';
import {OperationType} from "../../../../src/utils/constants.js";
import {addressToBuffer} from "../../../../src/core/state/utils/address.js";
import { $TNK } from '../../../../src/core/state/utils/balance.js';
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';

let tmpDirectory, admin, writer, externalNode, externalBootstrap, maliciousPeer;

const close = async node => {
    await node.msb.close()
}

hook('Initialize nodes', async t => {
    const randomChannel = randomBytes(32).toString('hex');

    const baseOptions = {
        enable_tx_apply_logs: false,
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
    await writer.msb.state.append(postTx)
    await waitForHash(writer, txHash)
    await tick();

    const result = await writer.msb.state.get(txHash);
    t.ok(result, 'post tx added to the base');
})

// Negative cases

// TODO: This test has been disabled because we got rid of JSON schema validation in favor of protobuf validation. To enable this test again, we need to write a fake protobuf schema for postTx (maybe also for other operations) and forge an invalid payload.

// test('nested object in postTx', async t => {
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

test('handleApplyTxOperation (apply) - different operation type', async t => {
    const maliciousWriter = await promoteToWriter(admin, maliciousPeer)
    const {postTx, txHash} = await generatePostTx(writer, externalNode, externalBootstrap)
    const replaceByte = (input, index, replacement) => {
        const bufferHex = b4a.from(input, 'hex');
        bufferHex[index] = replacement;
        return b4a.from(bufferHex, 'hex');
    }

    const replacedPostTx = replaceByte(b4a.toString(postTx, 'hex'), 1, OperationType.ADD_ADMIN);

    await waitDemotion(maliciousWriter, async () => {
        await maliciousWriter.msb.state.append(replacedPostTx);
    })
    await tick();

    t.absent(await writer.msb.state.get(txHash), 'post tx with incorrect operation type should not be added to the base');
})

test('handleApplyTxOperation (apply) - invalid postTx signature (adversary signature - writer signature)', async t => {
    const maliciousWriter = await promoteToWriter(admin, maliciousPeer)
    const {postTx, txHash} = await generatePostTx(writer, externalNode, externalBootstrap)
    let decodedPostTx = safeDecodeApplyOperation(postTx);

    decodedPostTx.txo.vs = maliciousWriter.wallet.sign(
        b4a.concat([decodedPostTx.txo.tx, decodedPostTx.txo.vn])
    );
    const encodedMaliciousPostTx = safeEncodeApplyOperation(decodedPostTx);
    await waitDemotion(maliciousWriter, async () => {
        await maliciousWriter.msb.state.append(encodedMaliciousPostTx);
    })

    const result = await admin.msb.state.get(txHash);
    t.absent(result, 'adversary\'s fake signature should not be added to the base');
});


test('handleApplyTxOperation (apply) - invalid postTx signature (adversary signature - peer signature)', async t => {
    const maliciousWriter = await promoteToWriter(admin, maliciousPeer)
    const {postTx, txHash} = await generatePostTx(writer, externalNode, externalBootstrap)

    let decodedPostTx = safeDecodeApplyOperation(postTx);

    decodedPostTx.txo.is = maliciousWriter.wallet.sign(
        decodedPostTx.txo.tx
    );
    const encodedMaliciousPostTx = safeEncodeApplyOperation(decodedPostTx);
    await waitDemotion(maliciousWriter, async () => {
        await maliciousWriter.msb.state.append(encodedMaliciousPostTx);
    })

    const result = await writer.msb.state.get(txHash);
    t.absent(result, 'adversary prepared fake postTx signature (third key pair) should not be added to the base');
});

test('handleApplyTxOperation (apply) - oversized transaction', async t => {
    const maliciousWriter = await promoteToWriter(admin, maliciousPeer)
    const {postTx, txHash} = await generatePostTx(writer, externalNode, externalBootstrap)
    let decodedPostTx = safeDecodeApplyOperation(postTx);

    decodedPostTx.txo.vn = randomBytes(5000);
    const encodedMaliciousPostTx = safeEncodeApplyOperation(decodedPostTx);

    await waitDemotion(maliciousWriter, async () => {
        await maliciousWriter.msb.state.append(encodedMaliciousPostTx);
    })
    const result = await admin.msb.state.get(txHash);
    t.absent(result, 'oversized post tx should not be added to the base');
});

test('handleApplyTxOperation (apply) - invalid postTx address (malicious node replaces address)', async t => {
    const maliciousWriter = await promoteToWriter(admin, maliciousPeer)
    const {postTx, txHash} = await generatePostTx(writer, externalNode, externalBootstrap)
    let decodedPostTx = safeDecodeApplyOperation(postTx);
    decodedPostTx.address = addressToBuffer(maliciousWriter.wallet.address, TRAC_NETWORK_MSB_MAINNET_PREFIX);
    const encodedMaliciousPostTx = safeEncodeApplyOperation(decodedPostTx);
    await maliciousWriter.msb.state.append(encodedMaliciousPostTx);
    await waitDemotion(maliciousWriter, async () => {
        await maliciousWriter.msb.state.append(encodedMaliciousPostTx);
    })
    const result = await admin.msb.state.get(txHash);
    t.absent(result, 'post tx with malicious address should not be added to the base');
});

test('handleApplyTxOperation (apply) - invalid postTx txo.ia (malicious node replaces ia)', async t => {
    const maliciousWriter = await promoteToWriter(admin, maliciousPeer)
    const {postTx, txHash} = await generatePostTx(writer, externalNode, externalBootstrap)
    let decodedPostTx = safeDecodeApplyOperation(postTx);
    decodedPostTx.txo.ia = addressToBuffer(maliciousWriter.wallet.address, TRAC_NETWORK_MSB_MAINNET_PREFIX);
    const encodedMaliciousPostTx = safeEncodeApplyOperation(decodedPostTx);
    await waitDemotion(maliciousWriter, async () => {
        await maliciousWriter.msb.state.append(encodedMaliciousPostTx);
    })
    const result = await admin.msb.state.get(txHash);
    t.absent(result, 'post tx with malicious txo.ia should not be added to the base');
});

hook('Clean up postTx setup', async t => {
    // close msbBoostrap and remove temp directory
    if (writer?.msb) await close(writer)
    if (externalNode?.msb) await close(externalNode)
    if (admin?.msb) await close(admin)
    if (maliciousPeer?.msb) await close(maliciousPeer)
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});