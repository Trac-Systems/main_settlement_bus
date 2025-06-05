import { test, hook } from 'brittle';
import path from 'path';
import fs from 'fs/promises';
import { randomBytes } from 'crypto';
import PeerWallet from "trac-wallet";
import { tick, generatePostTx, setupMsbAdmin, initTemporaryDirectory, removeTemporaryDirectory } from '../utils/setupApplyTests.js';
import { testKeyPair1, testKeyPair2, testKeyPair3 } from '../fixtures/apply.fixtures.js';
import { generateTx } from '../../src/utils/functions.js';

let tmpDirectory, admin, legitWallet, maliciousWallet;

hook('Initialize nodes', async t => {
    tmpDirectory = await initTemporaryDirectory()
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, {});

    const legitPeerKeyPath = path.join(admin.corestoreDbDirectory, 'keypair2.json');
    const maliciousPeerKeyPath = path.join(admin.corestoreDbDirectory, 'keypair3.json');

    await fs.writeFile(legitPeerKeyPath, JSON.stringify(testKeyPair2, null, 2));
    await fs.writeFile(maliciousPeerKeyPath, JSON.stringify(testKeyPair3, null, 2));

    legitWallet = new PeerWallet();
    maliciousWallet = new PeerWallet();

    await legitWallet.initKeyPair(legitPeerKeyPath);
    await maliciousWallet.initKeyPair(maliciousPeerKeyPath);
});

test('handleApplyTxOperation (apply) - Append transaction into the base', async t => {
    t.plan(1)

    const { postTx, preTxHash } = await generatePostTx(admin.msb, admin.wallet, legitWallet)
    await admin.msb.state.append(postTx);
    await tick();
    await tick();

    const result = await admin.msb.state.get(preTxHash);
    t.ok(result, 'post tx added to the base');
})

test('handleApplyTxOperation (apply) - negative', async t => {
    t.test('sanitizePostTx - nested object in postTx', async t => {
        //sanitizePostTx is already tested in /test/check/postTx.test.js
        let { postTx, preTxHash } = await generatePostTx(admin.msb, admin.wallet, legitWallet)
        postTx = {
            ...postTx,
            foo: 'bar',
        }
        await admin.msb.state.append(postTx);
        await tick();

        t.absent(await admin.msb.state.get(preTxHash), 'post tx with neasted object should not be added to the base');
        postTx = {
            ...postTx,
            value: {
                ...postTx.value,
                foo: 'bar',
            }
        }
        await admin.msb.state.append(postTx);
        await tick();
        t.absent(await admin.msb.state.get(preTxHash), 'post tx with neasted object in value property should not be added to the base');

    })

    t.test('different operation type in value', async t => {
        let { postTx, preTxHash } = await generatePostTx(admin.msb, admin.wallet, legitWallet)
        postTx = {
            ...postTx,
            value: {
                ...postTx.value,
                op: 'invalidOp',
            }
        }
        await admin.msb.state.append(postTx);
        await tick();

        t.absent(await admin.msb.state.get(preTxHash), 'post tx with incorrect operation type should not be added to the base');
    })

    t.test('replay attack', async t => {
        const { postTx, preTxHash } = await generatePostTx(admin.msb, admin.wallet, legitWallet);
        await admin.msb.state.append(postTx);
        await tick();
        const firstRes = await admin.msb.state.get(preTxHash);

        await admin.msb.state.append(postTx);
        await tick();

        const secondRes = await admin.msb.state.get(preTxHash);


        t.is(firstRes.seq, secondRes.seq, 'post tx should not be added to the base twice');
    })

    t.test('invalid key - key hash does not match tx hash', async t => {
        let { postTx, preTxHash } = await generatePostTx(admin.msb, admin.wallet, legitWallet);
        postTx = {
            ...postTx,
            key: randomBytes(32).toString('hex'),
        }
        await admin.msb.state.append(postTx);
        await tick();
        const result = await admin.msb.state.get(preTxHash);
        t.absent(result, 'post tx with invalid key hash should not be added to the base');

    })

    t.test('invalid postTx signature - adversary signature (peer signature)', async t => {
        let { postTx, preTxHash } = await generatePostTx(admin.msb, admin.wallet, legitWallet);

        const adversarySignature = maliciousWallet.sign(
            Buffer.from(postTx.value.tx + postTx.value.in)
        );

        postTx.value.is = adversarySignature.toString('hex');

        await admin.msb.state.append(postTx);
        await tick();

        const result = await admin.msb.state.get(preTxHash);
        t.absent(result, 'adversary prepared fake preTx signature (third key pair) should not be added to the base');
    });

    t.test('invalid postTx signature - adversary signature (writer signature)', async t => {
        let { postTx, preTxHash } = await generatePostTx(admin.msb, admin.wallet, legitWallet);


        const adversarySignature = maliciousWallet.sign(
            Buffer.from(postTx.value.tx + postTx.value.in)
        );

        postTx.ws = adversarySignature.toString('hex');

        await admin.msb.state.append(postTx);
        await tick();

        const result = await admin.msb.state.get(preTxHash);
        t.absent(result, 'adversary prepared fake postTx signature (third key pair) should not be added to the base');
    });

    t.test('invalid generateTx (all inputs)', async t => {
        const { postTx } = await generatePostTx(admin.msb, admin.wallet, legitWallet);

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

            await admin.msb.state.append(maliciousPostTx);
            await tick();
            const result = await admin.msb.state.get(maliciousTxHash);
            t.absent(result, `post tx with ${testCase.name} should not be added to the base`);
        }
    });

    t.test('oversized transaction', async t => {
        let { postTx, preTxHash } = await generatePostTx(admin.msb, admin.wallet, legitWallet);
        postTx.value.extraData = randomBytes(4500).toString('hex'); // fastest validator have good schemas and it will be protected by this validator but this case should be considered
        await admin.msb.state.append(postTx);
        await tick();
        const result = await await admin.msb.state.get(preTxHash);
        t.absent(result, 'oversized post tx should not be added to the base');
    });
})

hook('Clean up postTx setup', async t => {
    // close msbBoostrap and remove temp directory
    if (admin && admin.msb) await admin.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});