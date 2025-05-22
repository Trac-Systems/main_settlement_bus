import { test, hook } from 'brittle';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { MainSettlementBus } from '../../src/index.js';
import { randomBytes } from 'crypto';
import PeerWallet from "trac-wallet";
import { tick, generatePostTx } from '../utils/setupApplyTests.js';
import {testKeyPair1, testKeyPair2, testKeyPair3} from '../fixtures/apply.fixtures.js';
import { generateTx } from '../../src/utils/functions.js';

let tmpDirectory, bootstrapKeyPairPath, peerKeyPath;
let advKeyPath, msbBootstrap;
let boostrapPeerWallet, peerWallet, adversaryWallet;

hook('Initialize nodes', async t => {
    //init mocked directory structure
    tmpDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tempTestStore-'))
    const storesDirectory = tmpDirectory + '/stores/';
    const storeName = 'testStore/';
    const corestoreDbDirectory = path.join(storesDirectory, storeName, 'db');
    await fs.mkdir(corestoreDbDirectory, { recursive: true });

    bootstrapKeyPairPath = path.join(corestoreDbDirectory, 'keypair.json');
    await fs.writeFile(bootstrapKeyPairPath, JSON.stringify(testKeyPair1, null, 2));

    peerKeyPath = path.join(corestoreDbDirectory, 'keypair2.json');
    await fs.writeFile(peerKeyPath, JSON.stringify(testKeyPair2, null, 2));

    advKeyPath = path.join(corestoreDbDirectory, 'keypair3.json');
    await fs.writeFile(advKeyPath, JSON.stringify(testKeyPair3, null, 2));

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
    const bootstrap = msbInit.state.writingKey;
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

test('handleApplyTxOperation (apply) - Append transaction into the base', async t => {
    t.plan(1)

    const { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet, peerWallet)
    await msbBootstrap.state.append(postTx);
    await tick();
    await tick();

    const result = await msbBootstrap.state.get(preTxHash);

    t.ok(result, 'post tx added to the base');
})

test('handleApplyTxOperation (apply) - negative', async t => {
    t.test('sanitizePostTx - nested object in postTx', async t => {
        //sanitizePostTx is already tested in /test/check/postTx.test.js
        let { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet, peerWallet)
        postTx = {
            ...postTx,
            foo: 'bar',
        }
        await msbBootstrap.state.append(postTx);
        await tick();

        t.absent(await msbBootstrap.state.get(preTxHash), 'post tx with neasted object should not be added to the base');
        postTx = {
            ...postTx,
            value: {
                ...postTx.value,
                foo: 'bar',
            }
        }
        await msbBootstrap.state.append(postTx);
        await tick();
        t.absent(await msbBootstrap.state.get(preTxHash), 'post tx with neasted object in value property should not be added to the base');

    })

    t.test('different operation type in value', async t => {
        let { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet, peerWallet)
        postTx = {
            ...postTx,
            value: {
                ...postTx.value,
                op: 'invalidOp',
            }
        }
        await msbBootstrap.state.append(postTx);
        await tick();

        t.absent(await msbBootstrap.state.get(preTxHash), 'post tx with incorrect operation type should not be added to the base');
    })

    t.test('replay attack', async t => {
        const { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet, peerWallet);
        await msbBootstrap.state.append(postTx);
        await tick();
        const firstRes = await msbBootstrap.state.get(preTxHash);
        await msbBootstrap.state.append(postTx);
        await tick();

        const secondRes = await msbBootstrap.state.get(preTxHash);


        t.is(firstRes.seq, secondRes.seq, 'post tx should not be added to the base twice');
    })

    t.test('invalid key - key hash does not match tx hash', async t => {
        let { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet, peerWallet);
        postTx = {
            ...postTx,
            key: randomBytes(32).toString('hex'),
        }
        await msbBootstrap.state.append(postTx);
        await tick();
        const result = await msbBootstrap.state.get(preTxHash);
        t.absent(result, 'post tx with invalid key hash should not be added to the base');

    })

    t.test('invalid postTx signature - adversary signature (peer signature)', async t => {
        let { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet, peerWallet);

        const adversarySignature = adversaryWallet.sign(
            Buffer.from(postTx.value.tx + postTx.value.in)
        );

        postTx.value.is = adversarySignature.toString('hex');

        await msbBootstrap.state.append(postTx);
        await tick();

        const result = await msbBootstrap.state.get(preTxHash);
        t.absent(result, 'adversary prepared fake preTx signature (third key pair) should not be added to the base');
    });

    t.test('invalid postTx signature - adversary signature (writer signature)', async t => {
        let { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet, peerWallet);


        const adversarySignature = adversaryWallet.sign(
            Buffer.from(postTx.value.tx + postTx.value.in)
        );

        postTx.ws = adversarySignature.toString('hex');

        await msbBootstrap.state.append(postTx);
        await tick();

        const result = await msbBootstrap.state.get(preTxHash);
        t.absent(result, 'adversary prepared fake postTx signature (third key pair) should not be added to the base');
    });

    t.test('invalid generateTx (all inputs)', async t => {
        const { postTx } = await generatePostTx(msbBootstrap, boostrapPeerWallet, peerWallet);

        const testCases = [
            { name: 'modified peer bootstrap', mod: (tx, maliciousValue) => { return { ...tx.value, bs: maliciousValue }; } },
            { name: 'modified msb bootstrap', mod: (tx, maliciousValue) => { return { ...tx.value, mbs: maliciousValue }; } },
            { name: 'modified validator pub key', mod: (tx, maliciousValue) => { return { ...tx.value, wp: maliciousValue }; } },
            { name: 'modified writer key', mod: (tx, maliciousValue) => { return { ...tx.value, i: maliciousValue }; } },
            { name: 'modified peer pub key', mod: (tx, maliciousValue) => { return { ...tx.value, ipk: maliciousValue }; } },
            { name: 'modified content hash', mod: (tx, maliciousValue) => { return { ...tx.value, ch: maliciousValue }; } },
            { name: 'modified nonce', mod: (tx, maliciousValue) => { return { ...tx.value, in: maliciousValue }; } },
        ];

        for (const testCase of testCases) {
            const maliciousValue = randomBytes(32).toString('hex');
            const modifiedValue = testCase.mod(postTx, maliciousValue);
            const maliciousTxHash = await generateTx(
                modifiedValue.bs ?? postTx.value.bs,
                modifiedValue.mbs ?? postTx.value.mbs,
                modifiedValue.wp ?? postTx.value.wp,
                modifiedValue.i ?? postTx.value.i,
                modifiedValue.ipk ?? postTx.value.ipk,
                modifiedValue.ch ?? postTx.value.ch,
                modifiedValue.in ?? postTx.value.in
            );

            const maliciousPostTx = {
                ...postTx,
                key: maliciousTxHash,
                value: {
                    tx: maliciousTxHash,
                    ...postTx.value,
                    ...modifiedValue,
                },
            };

            await msbBootstrap.state.append(maliciousPostTx);
            await tick();
            const result = await msbBootstrap.state.base.view.get(maliciousTxHash);
            t.absent(result, `post tx with ${testCase.name} should not be added to the base`);
        }
    });

    t.test('oversized transaction', async t => {
        let { postTx, preTxHash } = await generatePostTx(msbBootstrap, boostrapPeerWallet, peerWallet);
        postTx.value.extraData = randomBytes(4500).toString('hex'); // fastest validator have good schemas and it will be protected by this validator but this case should be considered
        await msbBootstrap.state.append(postTx);
        await tick();
        const result = await await msbBootstrap.state.base.view.get(preTxHash);
        t.absent(result, 'oversized post tx should not be added to the base');
    });
})

hook('Clean up postTx setup', async t => {
    // close msbBoostrap and remove temp directory
    if (msbBootstrap) await msbBootstrap.close();
    if (tmpDirectory) await fs.rm(tmpDirectory, { recursive: true, force: true })
})

