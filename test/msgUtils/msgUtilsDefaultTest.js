export async function msgUtilsDefaultTest(t, fnName, fn, wallet, writingKey, opType, msgValueLength, expectedMsgKey) {
    t.test(`${fnName} - Happy Path`, async (k) => {
        const msg = await fn(wallet, writingKey);
        k.ok(msg, 'Message should be created');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(msg.value).length, msgValueLength, `Message should value have ${msgValueLength} keys`);

        if (msgValueLength > 2) {
            k.is(msg.value.pub, wallet.publicKey, 'Message pub should be the public key of the wallet');
            k.is(msg.value.wk, writingKey, 'Message wk should be the writing key');
        }

        k.is(msg.type, opType, `Message type should be ${opType}`);
        k.is(msg.key, expectedMsgKey, 'Message key should be the the expected one');
        k.is(msg.value.nonce.length, 64, 'Message nonce should be 64 characters long');
        k.ok(msg.value.nonce.match(/^[a-f0-9]+$/), 'Message nonce should be a hex string');
        k.is(msg.value.sig.length, 128, 'Message signature should be 128 characters long');
        k.ok(msg.value.sig.match(/^[a-f0-9]+$/), 'Message signature should be a hex string');
    });

    t.test(`${fnName} - Invalid wallet 1`, async (k) => {
        const msg = await fn({ publicKey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg" }, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid wallet 2`, async (k) => {
        const msg = await fn({ publicKey: "1234567890abcdef" }, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid wallet 3`, async (k) => {
        const msg = await fn({ publicKey: "" }, writingKey);
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
        const msg = await fn(wallet, "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg");
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid writing key 2`, async (k) => {
        const msg = await fn(wallet, "1234567890abcdef");
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid writing key 3`, async (k) => {
        const msg = await fn(wallet, "");
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