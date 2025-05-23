import { test, hook } from 'brittle'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { MainSettlementBus } from '../../src/index.js'
import { OperationType } from '../../src/utils/constants.js'
import { createHash } from '../../src/utils/functions.js'
import b4a from 'b4a'
import { randomBytes } from 'crypto'
import PeerWallet from "trac-wallet"

// add test with invalid data - should not pass. Many cases 
// should not be possible to perform replay attack

const testKeyPair = {
    publicKey: '82f6c1f684f4e251dfe092155b8861a0625b596991810b2b80b9c65ccbec5ad3',
    secretKey: '734aa8a4ff1506a502054f537c235d3fbe70452926bad869c3ab57e90d06df7382f6c1f684f4e251dfe092155b8861a0625b596991810b2b80b9c65ccbec5ad3',
    mnemonic: 'slight wedding permit mention subject mask hawk awkward sniff leopard spider scatter close neutral deny apple wide category sick love sorry pupil then legal'
}

const testKeyPair2 = {
    publicKey: "8f17ec2862c7b3e4dbbedaf88a68a9b74d76e9d6acca6ca4a5fafb1b6c474616",
    secretKey: "21b7f3c56eaa4d8114530258c79b8086bcca3e61d6c9edee589e8ca2f48688e98f17ec2862c7b3e4dbbedaf88a68a9b74d76e9d6acca6ca4a5fafb1b6c474616",
    mnemonic: "century category maze cover student upset trip cup purchase area turtle keen minimum flee diagram romance stool absorb umbrella phone valve avocado fade window"
}
let tmp, keyPath, keyPath2, msbBootstrap, boostrapPeerWallet1, peerWallet2

const tick = () => new Promise(resolve => setImmediate(resolve))

const generatePostTx = async (msbBootstrap, boostrapPeerWallet1, peerWallet2) => {
    
    const peerBootstrap = randomBytes(32).toString('hex');
    const validatorPubKey = msbBootstrap.getTracPublicKey();
    const peerWriterLocalKey = randomBytes(32).toString('hex');
    const peerPublicKey = peerWallet2.publicKey;

    const testObj = {
        type: 'deployTest',
        value: {
            op: 'deploy',
            tick: Math.random().toString(),
            max: '21000000',
            lim: '1000',
            dec: 18
        }
    };

    const contentHash = await createHash('sha256', JSON.stringify(testObj));
    const nonce = PeerWallet.generateNonce().toString('hex');

    const preTxHash = await msbBootstrap.generateTx(
        peerBootstrap,
        msbBootstrap.bootstrap,
        validatorPubKey,
        peerWriterLocalKey,
        peerPublicKey,
        contentHash,
        nonce
    );

    const parsedPreTx = {
        op: 'pre-tx',
        tx: preTxHash,
        is: peerWallet2.sign(Buffer.from(preTxHash + nonce)),
        wp: validatorPubKey,
        i: peerWriterLocalKey,
        ipk: peerPublicKey,
        ch: contentHash,
        in: nonce,
        bs: peerBootstrap,
        mbs: msbBootstrap.bootstrap
    };

    const postTxSig = boostrapPeerWallet1.sign(
        b4a.from(parsedPreTx.tx + nonce),
        b4a.from(boostrapPeerWallet1.secretKey, 'hex')
    );

    const postTx = {
        type: OperationType.TX,
        key: preTxHash,
        value: {
            op: OperationType.POST_TX,
            tx: preTxHash,
            is: parsedPreTx.is,
            w: msbBootstrap.bootstrap,
            i: parsedPreTx.i,
            ipk: parsedPreTx.ipk,
            ch: parsedPreTx.ch,
            in: parsedPreTx.in,
            bs: parsedPreTx.bs,
            mbs: parsedPreTx.mbs,
            ws: postTxSig.toString('hex'),
            wp: boostrapPeerWallet1.publicKey,
            wn: nonce
        }
    };

    return { postTx, preTxHash };

}

hook('Initialize nodes', async t => {
    //init mocked directory structure
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tempTestStore-'))
    const storesDirectory = tmp + '/stores/';
    const storeName = 'testStore/';
    const corestoreDbDirectory = path.join(storesDirectory, storeName, 'db');
    await fs.mkdir(corestoreDbDirectory, { recursive: true });
    keyPath = path.join(corestoreDbDirectory, 'keypair.json');
    await fs.writeFile(keyPath, JSON.stringify(testKeyPair, null, 2));

    keyPath2 = path.join(corestoreDbDirectory, 'keypair2.json');
    await fs.writeFile(keyPath2, JSON.stringify(testKeyPair2, null, 2));

    const msbInit = new MainSettlementBus({
        stores_directory: storesDirectory,
        store_name: storeName,
        channel: randomBytes(32).toString('hex'),
        bootstrap: randomBytes(32).toString('hex'),
        enable_txlogs: false,
        enableValidatorObserver: false,
        enableRoleRequester: false,
        replicate: false,
    });

    await msbInit.ready();
    const bootstrap = msbInit.writingKey;
    await msbInit.close();

    msbBootstrap = new MainSettlementBus({
        stores_directory: storesDirectory,
        store_name: storeName,
        channel: randomBytes(32).toString('hex'),
        bootstrap: bootstrap,
        enable_txlogs: false,
        enableValidatorObserver: false,
        enableRoleRequester: false,
        replicate: false,
    });

    await msbBootstrap.ready();

    // Initialization peerWallet1 (validator) and peerWallet2 (subnetwork writer) wallets for testing purposes
    boostrapPeerWallet1 = new PeerWallet();
    await boostrapPeerWallet1.initKeyPair(keyPath);

    peerWallet2 = new PeerWallet();
    await peerWallet2.initKeyPair(keyPath2);
})

test('Apply function POST_TX operation - Append transaction into the base', async t => {
    t.plan(1)

    const { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet1, peerWallet2)
    await msbBootstrap.base.append(postTx);
    await tick();
    await tick();

    const result = await msbBootstrap.base.view.get(preTxHash);
    t.ok(result, 'post tx added to the base');
})

test('Apply function POST_TX operation - negative)', async t => {
    t.test('sanitizePostTx - placeholder name', async t => {
        //sanitizePostTx is already tested in /test/check/postTx.test.js
        let { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet1, peerWallet2)
        postTx = {
            ...postTx,
            foo: 'bar',
        }
        await msbBootstrap.base.append(postTx);
        await tick();

        t.absent(await msbBootstrap.base.view.get(preTxHash), 'post tx with neasted object should not be added to the base');
        postTx = {
            ...postTx,
            value: {
                ...postTx.value,
                foo: 'bar',
            }
        }
        await msbBootstrap.base.append(postTx);
        await tick();
        t.absent(await msbBootstrap.base.view.get(preTxHash), 'post tx with neasted object in value property should not be added to the base');

    })

    t.test('different operation type - placeholder name', async t => {
        let { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet1, peerWallet2)
        postTx = {
            ...postTx,
            value: {
                ...postTx.value,
                op: 'invalidOp',}
        }
        await msbBootstrap.base.append(postTx);
        await tick();

        t.absent(await msbBootstrap.base.view.get(preTxHash), 'post tx with incorrect operation type should not be added to the base');
    })

    
})

hook('Clean up postTx setup', async t => {
    // close msbBoostrap and remove temp directory
    if (msbBootstrap) await msbBootstrap.close()
    if (tmp) await fs.rm(tmp, { recursive: true, force: true })
})