import test from 'brittle';
import MsgUtils from '../../src/utils/msgUtils.js';
import { OperationType } from '../../src/utils/constants.js';
import {default as fixtures} from '../fixtures/assembleMessage.fixtures.js';

test('assembleRemoveWriterMessage', async (t) => {
    await fixtures.initAll();
    const walletNonAdmin = fixtures.walletNonAdmin;
    const writingKeyNonAdmin = fixtures.writingKeyNonAdmin;

    t.test('assembleRemoveWriterMessage - Happy Path', async (k) => {
        const msg = await MsgUtils.assembleRemoveWriterMessage(walletNonAdmin, writingKeyNonAdmin);
        k.ok(msg, 'Message should be created');
        k.is(msg.type, OperationType.REMOVE_WRITER, 'Message type should be REMOVE_WRITER');
        k.is(msg.key, walletNonAdmin.publicKey, 'Message key should be the public key of the wallet');
        k.is(msg.value.pub, walletNonAdmin.publicKey, 'Message pub should be the public key of the wallet');
        k.is(msg.value.wk, writingKeyNonAdmin, 'Message wk should be the writing key');
        k.is(msg.value.nonce.length, 64, 'Message nonce should be 64 characters long');
        k.ok(msg.value.nonce.match(/^[a-f0-9]+$/), 'Message nonce should be a hex string');
        k.is(msg.value.sig.length, 128, 'Message signature should be 128 characters long');
        k.ok(msg.value.sig.match(/^[a-f0-9]+$/), 'Message signature should be a hex string');
    });

    t.test('assembleRemoveWriterMessage - Invalid wallet', async (k) => {
        const msg = await MsgUtils.assembleRemoveWriterMessage({}, writingKeyNonAdmin);
        k.is(msg, undefined, 'Message should be undefined');
    });

    t.test('assembleRemoveWriterMessage - Null Wallet', async (k) => {
        const msg = await MsgUtils.assembleRemoveWriterMessage(null, writingKeyNonAdmin);
        k.is(msg, undefined, 'Message should be undefined');
    });

    t.test('assembleRemoveWriterMessage - Invalid writing key', async (k) => {
        const msg = await MsgUtils.assembleRemoveWriterMessage(walletNonAdmin, "1234567890abcdef");
        k.is(msg, undefined, 'Message should be undefined');
    });

    t.test('assembleRemoveWriterMessage - Null writing key', async (k) => {
        const msg = await MsgUtils.assembleRemoveWriterMessage(walletNonAdmin, null);
        k.is(msg, undefined, 'Message should be undefined');
    });

});