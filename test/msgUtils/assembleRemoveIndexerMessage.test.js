import test from 'brittle';
import MsgUtils from '../../src/utils/msgUtils.js';
import { OperationType } from '../../src/utils/constants.js';
import { default as fixtures } from '../fixtures/assembleMessage.fixtures.js';

test('assembleRemoveIndexerMessage', async (t) => {
    await fixtures.initAll();
    const walletNonAdmin = fixtures.walletNonAdmin;
    const writingKeyNonAdmin = fixtures.writingKeyNonAdmin;

    t.test('assembleRemoveIndexerMessage - Happy Path', async (k) => {
        const msg = await MsgUtils.assembleRemoveIndexerMessage(walletNonAdmin, writingKeyNonAdmin);
        k.ok(msg, 'Message should be created');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(msg.value).length, 2, 'Message value have 2 keys');
        k.is(msg.type, OperationType.REMOVE_INDEXER, 'Message type should be REMOVE_INDEXER');
        k.is(msg.key, writingKeyNonAdmin, 'Message key should be the provided writing key');
        k.is(msg.value.nonce.length, 64, 'Message nonce should be 64 characters long');
        k.ok(msg.value.nonce.match(/^[a-f0-9]+$/), 'Message nonce should be a hex string');
        k.is(msg.value.sig.length, 128, 'Message signature should be 128 characters long');
        k.ok(msg.value.sig.match(/^[a-f0-9]+$/), 'Message signature should be a hex string');
    });

    t.test('assembleRemoveIndexerMessage - Invalid wallet', async (k) => {
        const msg = await MsgUtils.assembleRemoveIndexerMessage({ publicKey: "" }, writingKeyNonAdmin);
        k.is(msg, undefined, 'Message should be undefined');
    });

    t.test('assembleRemoveIndexerMessage - undefined Wallet', async (k) => {
        const msg = await MsgUtils.assembleRemoveIndexerMessage(undefined, writingKeyNonAdmin);
        k.is(msg, undefined, 'Message should be undefined');
    });

    t.test('assembleRemoveIndexerMessage - Invalid writing key', async (k) => {
        const msg = await MsgUtils.assembleRemoveIndexerMessage(walletNonAdmin, "");
        k.is(msg, undefined, 'Message should be undefined');
    });

    t.test('assembleRemoveIndexerMessage - undefined writing key', async (k) => {
        const msg = await MsgUtils.assembleRemoveIndexerMessage(walletNonAdmin, undefined);
        k.is(msg, undefined, 'Message should be undefined');
    });

});