import {hook, test} from '../../../helpers/wrapper.js';
import {
    generatePostTx,
    initTemporaryDirectory,
    randomBytes,
    removeTemporaryDirectory,
    setupMsbAdmin,
    setupMsbPeer,
    setupMsbWriter,
    fundPeer,
    deployExternalBootstrap,
    tryToSyncWriters,
    waitDemotion,
    promoteToWriter
} from '../../../helpers/setupApplyTests.js';
import {safeDecodeApplyOperation, safeEncodeApplyOperation} from '../../../../src/utils/protobuf/operationHelpers.js'
import {testKeyPair1, testKeyPair2, testKeyPair4, testKeyPair5} from '../../../fixtures/apply.fixtures.js';
import { $TNK } from '../../../../src/core/state/utils/balance.js';
import { decode as decodeNodeEntry } from '../../../../src/core/state/utils/nodeEntry.js';

let tmpDirectory, admin, writer, externalNode, externalBootstrap, maliciousPeer;
// is and vs is already covered
const testCases = [
  { name: 'modified tx', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, tx: maliciousValue }; } },
  { name: 'modified incoming writingKey', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, iw: maliciousValue }; } },
  { name: 'modified incoming nonce', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, in: maliciousValue }; } },
  { name: 'modified content hash', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, ch: maliciousValue }; } },
  { name: 'modified external bootstrap', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, bs: maliciousValue }; } },
  { name: 'modified MSB bootstrap', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, mbs: maliciousValue }; } },
  { name: 'modified validator nonce', mod: (txPayload, maliciousValue) => { return { ...txPayload.txo, vn: maliciousValue }; } },
];

const close = async node => {
    await node.msb.close()
}

hook('Initialize nodes', async t => {
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
    writer = await setupMsbWriter(admin, 'writer1', testKeyPair2, tmpDirectory, admin.options);
    externalNode = await setupMsbPeer('reader1', testKeyPair4, tmpDirectory, admin.options);
    await fundPeer(admin, externalNode, $TNK(1n)) // we fund it since it will deploy stuff
    externalBootstrap = await deployExternalBootstrap(writer, externalNode)
    await tryToSyncWriters(writer, admin)
    maliciousPeer = await setupMsbPeer('maliciousWriter', testKeyPair5, tmpDirectory, admin.options);
    await fundPeer(admin, maliciousPeer, $TNK(10n))
});

test('handleApplyTxOperation (apply) - invalid txo sub-values', async t => {
  const {postTx, txHash} = await generatePostTx(writer, externalNode, externalBootstrap)
  const decodedPostTx = safeDecodeApplyOperation(postTx);
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i]

    const maliciousWriter = await promoteToWriter(admin, maliciousPeer)
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
    const node = decodeNodeEntry(await maliciousWriter.msb.state.get(maliciousWriter.wallet.address))
    t.ok(node, 'Result should not be null');
    t.is(node.isWriter, false, 'Result should indicate that the peer is not a writer');
  }
});

hook('Clean up postTx setup', async t => {
  // close msbBoostrap and remove temp directory
  if (writer?.msb) await close(writer)
  if (externalNode?.msb) await close(externalNode)
  if (admin?.msb) await close(admin)
  if (maliciousPeer?.msb) await close(maliciousPeer)
  if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});