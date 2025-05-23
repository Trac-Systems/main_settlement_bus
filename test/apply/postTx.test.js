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

const bootstrapKeyPair = {
    publicKey: '82f6c1f684f4e251dfe092155b8861a0625b596991810b2b80b9c65ccbec5ad3',
    secretKey: '734aa8a4ff1506a502054f537c235d3fbe70452926bad869c3ab57e90d06df7382f6c1f684f4e251dfe092155b8861a0625b596991810b2b80b9c65ccbec5ad3',
    mnemonic: 'slight wedding permit mention subject mask hawk awkward sniff leopard spider scatter close neutral deny apple wide category sick love sorry pupil then legal'
}

const peerKeyPair = {
    publicKey: "8f17ec2862c7b3e4dbbedaf88a68a9b74d76e9d6acca6ca4a5fafb1b6c474616",
    secretKey: "21b7f3c56eaa4d8114530258c79b8086bcca3e61d6c9edee589e8ca2f48688e98f17ec2862c7b3e4dbbedaf88a68a9b74d76e9d6acca6ca4a5fafb1b6c474616",
    mnemonic: "century category maze cover student upset trip cup purchase area turtle keen minimum flee diagram romance stool absorb umbrella phone valve avocado fade window"
}

const adversaryKeyPair = {
    publicKey: "3341b586cad305908b4ac0cf9176851d90c64a7b7d3ff74100262e383d63c6b8",
    secretKey: "25178b87c194c3e84358323a2ec43069610a5b48fdd4ca88689155bbc5c180b13341b586cad305908b4ac0cf9176851d90c64a7b7d3ff74100262e383d63c6b8",
    mnemonic: "inner pond duty corn danger board tragic penalty mad lounge excite lottery great current high exercise spin noble true curtain airport trend when decade"
}
let tmp, bootstrapKeyPairPath, peerKeyPath,advKeyPath, msbBootstrap, boostrapPeerWallet, peerWallet, adversaryWallet

const tick = () => new Promise(resolve => setImmediate(resolve))

const generatePostTx = async (msbBootstrap, boostrapPeerWallet, peerWallet) => {

    const peerBootstrap = randomBytes(32).toString('hex');
    const validatorPubKey = msbBootstrap.getTracPublicKey();
    const peerWriterLocalKey = randomBytes(32).toString('hex');
    const peerPublicKey = peerWallet.publicKey;

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
        is: peerWallet.sign(Buffer.from(preTxHash + nonce)),
        wp: validatorPubKey,
        i: peerWriterLocalKey,
        ipk: peerPublicKey,
        ch: contentHash,
        in: nonce,
        bs: peerBootstrap,
        mbs: msbBootstrap.bootstrap
    };

    const postTxSig = boostrapPeerWallet.sign(
        b4a.from(parsedPreTx.tx + nonce),
        b4a.from(boostrapPeerWallet.secretKey, 'hex')
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
            wp: boostrapPeerWallet.publicKey,
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

    bootstrapKeyPairPath = path.join(corestoreDbDirectory, 'keypair.json');
    await fs.writeFile(bootstrapKeyPairPath, JSON.stringify(bootstrapKeyPair, null, 2));

    peerKeyPath = path.join(corestoreDbDirectory, 'keypair2.json');
    await fs.writeFile(peerKeyPath, JSON.stringify(peerKeyPair, null, 2));

    advKeyPath = path.join(corestoreDbDirectory, 'keypair3.json');
    await fs.writeFile(advKeyPath, JSON.stringify(adversaryKeyPair, null, 2));

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
    boostrapPeerWallet = new PeerWallet();
    await boostrapPeerWallet.initKeyPair(bootstrapKeyPairPath);

    peerWallet = new PeerWallet();
    await peerWallet.initKeyPair(peerKeyPath);

    adversaryWallet = new PeerWallet();
    await adversaryWallet.initKeyPair(advKeyPath);
})

test('Apply function POST_TX operation - Append transaction into the base', async t => {
    t.plan(1)

    const { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet, peerWallet)
    await msbBootstrap.base.append(postTx);
    await tick();
    await tick();

    const result = await msbBootstrap.base.view.get(preTxHash);
    t.ok(result, 'post tx added to the base');
})

test('Apply function POST_TX operation - negative)', async t => {
    t.test('sanitizePostTx - placeholder name', async t => {
        //sanitizePostTx is already tested in /test/check/postTx.test.js
        let { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet, peerWallet)
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
        let { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet, peerWallet)
        postTx = {
            ...postTx,
            value: {
                ...postTx.value,
                op: 'invalidOp',
            }
        }
        await msbBootstrap.base.append(postTx);
        await tick();

        t.absent(await msbBootstrap.base.view.get(preTxHash), 'post tx with incorrect operation type should not be added to the base');
    })

    t.test('replay attack - placeholder name', async t => {
        const { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet, peerWallet);
        await msbBootstrap.base.append(postTx);
        await tick();
        const firstRes = await msbBootstrap.base.view.get(preTxHash);

        await msbBootstrap.base.append(postTx);
        await tick();

        const secondRes = await msbBootstrap.base.view.get(preTxHash);


        t.is(firstRes.seq, secondRes.seq, 'post tx should not be added to the base twice');
    })

    t.test('invalid key hash and tx hash does not match - placeholder name', async t => {
        let { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet, peerWallet);
        postTx = {
            ...postTx,
            key: randomBytes(32).toString('hex'),
        }
        await msbBootstrap.base.append(postTx);
        await tick();
        const result = await msbBootstrap.base.view.get(preTxHash);
        t.absent(result, 'post tx with invalid key hash should not be added to the base');

    })

    t.test('adversary prepared fake preTx signature (peer signature) - placeholder name', async t => {
        let { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet, peerWallet);

        const adversarySignature = adversaryWallet.sign(
            Buffer.from(postTx.value.tx + postTx.value.in)
        );

        postTx.value.is = adversarySignature.toString('hex');

        await msbBootstrap.base.append(postTx);
        await tick();

        const result = await msbBootstrap.base.view.get(preTxHash);
        t.absent(result, 'adversary prepared fake preTx signature (third key pair) should be rejected');
    });

    t.test('adversary prepared fake postTx signature (writer signature) - placeholder name', async t => {
        let { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet, peerWallet);
 

        const adversarySignature = adversaryWallet.sign(
            Buffer.from(postTx.value.tx + postTx.value.in)
        );

        postTx.ws = adversarySignature.toString('hex');

        await msbBootstrap.base.append(postTx);
        await tick();

        const result = await msbBootstrap.base.view.get(preTxHash);
        t.absent(result, 'adversary prepared fake postTx signature (third key pair) should be rejected');
    });

    //todo add cases with nonces, try to fake generateTx and try to send huge sized tx
    // fake contentHash or maybe it should be empty?
})

hook('Clean up postTx setup', async t => {
    // close msbBoostrap and remove temp directory
    if (msbBootstrap) await msbBootstrap.close()
    if (tmp) await fs.rm(tmp, { recursive: true, force: true })
})