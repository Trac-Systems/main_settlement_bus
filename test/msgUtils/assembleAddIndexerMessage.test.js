import test from 'brittle';
import MsgUtils from '../../src/utils/msgUtils.js';
import { OperationType } from '../../src/utils/constants.js';
import { default as fixtures } from '../fixtures/assembleMessage.fixtures.js';

test('assembleAddIndexerMessage', async (t) => {
    await fixtures.initAll();
    const walletNonAdmin = fixtures.walletNonAdmin;
    const writingKeyNonAdmin = fixtures.writingKeyNonAdmin;

    t.test('assembleAddIndexerMessage - Happy Path', async (k) => {
        const msg = await MsgUtils.assembleAddIndexerMessage(walletNonAdmin, writingKeyNonAdmin);
        k.ok(msg, 'Message should be created');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(msg.value).length, 2, 'Message value have 2 keys');
        k.is(msg.type, OperationType.ADD_INDEXER, 'Message type should be ADD_INDEXER');
        k.is(msg.key, writingKeyNonAdmin, 'Message key should be the provided writing key');
        k.is(msg.value.nonce.length, 64, 'Message nonce should be 64 characters long');
        k.ok(msg.value.nonce.match(/^[a-f0-9]+$/), 'Message nonce should be a hex string');
        k.is(msg.value.sig.length, 128, 'Message signature should be 128 characters long');
        k.ok(msg.value.sig.match(/^[a-f0-9]+$/), 'Message signature should be a hex string');
    });

    t.test('assembleAddIndexerMessage - Invalid wallet', async (k) => {
        const msg = await MsgUtils.assembleAddIndexerMessage({ publicKey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg" }, writingKeyNonAdmin);
        k.is(msg, undefined, 'Message should be undefined');
    });

    t.test('assembleAddIndexerMessage - Null Wallet', async (k) => {
        const msg = await MsgUtils.assembleAddIndexerMessage(null, writingKeyNonAdmin);
        k.is(msg, undefined, 'Message should be undefined');
    });

    t.test('assembleAddIndexerMessage - Invalid writing key', async (k) => {
        const msg = await MsgUtils.assembleAddIndexerMessage(walletNonAdmin, "1234567890abcdef");
        k.is(msg, undefined, 'Message should be undefined');
    });

    t.test('assembleAddIndexerMessage - Null writing key', async (k) => {
        const msg = await MsgUtils.assembleAddIndexerMessage(walletNonAdmin, null);
        k.is(msg, undefined, 'Message should be undefined');
    });

});