
import b4a from 'b4a';

export async function messageOperationsEkoTest(t, fnName, fn, wallet, writingKey, opType, msgValueLength, expectedMsgKey) {

    t.test(`${fnName} - Happy Path`, async (k) => {
        const msg = await fn(wallet, writingKey);
        console.log('msg', msg);
        k.ok(msg, 'Message should be created');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(msg.eko).length, msgValueLength, `Message value should have ${msgValueLength} keys`);

        if (msgValueLength > 2) {
            //k.is(msg.eko.pub, wallet.publicKey, 'Message pub should be the public key of the wallet'); // pub does not exist
            k.ok(b4a.equals(msg.eko.wk, writingKey), 'Message wk should be the writing key');
        }

        k.is(msg.type, opType, `Message type should be ${opType}`);
        k.ok(b4a.equals(msg.key, expectedMsgKey), 'Message key should be the the expected one');
        k.is(msg.eko.nonce.length, 32, 'Message nonce should be 32 bytes long');
        k.ok(b4a.isBuffer(msg.eko.nonce), 'Message nonce should be a buffer');
        k.is(msg.eko.sig.length, 64, 'Message signature should be 64 bytes long');
        k.ok(b4a.isBuffer(msg.eko.sig), 'Message signature should be a buffer');
    });

    t.test(`${fnName} - Invalid wallet 1`, async (k) => {
        const msg = await fn({ publicKey: b4a.from("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg", 'hex') }, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid wallet 2`, async (k) => {
        const msg = await fn({ publicKey: b4a.from("1234567890abcdef", 'hex') }, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid wallet 3`, async (k) => {
        const msg = await fn({ publicKey: b4a.from("", 'hex') }, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Null Wallet`, async (k) => {
        const msg = await fn(null, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - undefined Wallet`, async (k) => {
        const msg = await fn(undefined, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid writing key 1`, async (k) => {
        const msg = await fn(wallet, b4a.from("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg", 'hex'));
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid writing key 2`, async (k) => {
        const msg = await fn(wallet, b4a.from("1234567890abcdef", 'hex'));
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid writing key 3`, async (k) => {
        const msg = await fn(wallet, b4a.from("", 'hex'));
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Null writing key`, async (k) => {
        const msg = await fn(wallet, null);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - undefined writing key`, async (k) => {
        const msg = await fn(wallet, undefined);
        k.is(msg, null, 'Message should be null');
    });

}

export async function messageOperationsBkoTest(t, fnName, fn, wallet, writingKey, opType, msgValueLength, expectedMsgKey) {

    t.test(`${fnName} - Happy Path`, async (k) => {
        const msg = await fn(wallet, expectedMsgKey);
        k.ok(msg, 'Message should be created');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(msg.bko).length, msgValueLength, `Message value should have ${msgValueLength} keys`);

        if (msgValueLength > 2) {
            //k.is(msg.bko.pub, wallet.publicKey, 'Message pub should be the public key of the wallet'); // pub does not exist
            k.ok(b4a.equals(msg.bko.wk, writingKey), 'Message wk should be the writing key');
        }

        k.is(msg.type, opType, `Message type should be ${opType}`);

        k.ok(b4a.equals(msg.key, expectedMsgKey), 'Message key should be the the expected one');
        k.is(msg.bko.nonce.length, 32, 'Message nonce should be 32 bytes long');
        k.ok(b4a.isBuffer(msg.bko.nonce), 'Message nonce should be a buffer');
        k.is(msg.bko.sig.length, 64, 'Message signature should be 64 bytes long');
        k.ok(b4a.isBuffer(msg.bko.sig), 'Message signature should be a buffer');
    });
    
    t.test(`${fnName} - Invalid wallet 1`, async (k) => {
        const msg = await fn({ publicKey: b4a.from("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg", 'hex') }, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid wallet 2`, async (k) => {
        const msg = await fn({ publicKey: b4a.from("1234567890abcdef", 'hex') }, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid wallet 3`, async (k) => {
        const msg = await fn({ publicKey: b4a.from("", 'hex') }, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Null Wallet`, async (k) => {
        const msg = await fn(null, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - undefined Wallet`, async (k) => {
        const msg = await fn(undefined, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid writing key 1`, async (k) => {
        const msg = await fn(wallet, b4a.from("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg", 'hex'));
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid writing key 2`, async (k) => {
        const msg = await fn(wallet, b4a.from("1234567890abcdef", 'hex'));
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid writing key 3`, async (k) => {
        const msg = await fn(wallet, b4a.from("", 'hex'));
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Null writing key`, async (k) => {
        const msg = await fn(wallet, null);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - undefined writing key`, async (k) => {
        const msg = await fn(wallet, undefined);
        k.is(msg, null, 'Message should be null');
    });
    

}