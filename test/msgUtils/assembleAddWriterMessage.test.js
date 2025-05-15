import test from 'brittle';
import MsgUtils from '../../src/utils/msgUtils.js';
import { OperationType } from '../../src/utils/constants.js';
import {default as fixtures} from '../fixtures/assembleMessage.fixtures.js';

test('assembleAddWriterMessage', async (t) => {
    await fixtures.initAll();
    const walletNonAdmin = fixtures.walletNonAdmin;
    const writingKeyNonAdmin = fixtures.writingKeyNonAdmin;

    t.test('assembleAddWriterMessage - Happy Path', async (k) => {
        const msg = await MsgUtils.assembleAddWriterMessage(walletNonAdmin, writingKeyNonAdmin);
        k.ok(msg, 'Message should be created');
        k.is(msg.type, OperationType.ADD_WRITER, 'Message type should be ADD_WRITER');
        k.is(msg.key, walletNonAdmin.publicKey, 'Message key should be the public key of the wallet');
        k.is(msg.value.pub, walletNonAdmin.publicKey, 'Message pub should be the public key of the wallet');
        k.is(msg.value.wk, writingKeyNonAdmin, 'Message wk should be the writing key');
        k.is(msg.value.nonce.length, 64, 'Message nonce should be 64 characters long');
        k.ok(msg.value.nonce.match(/^[a-f0-9]+$/), 'Message nonce should be a hex string');
        k.is(msg.value.sig.length, 128, 'Message signature should be 128 characters long');
        k.ok(msg.value.sig.match(/^[a-f0-9]+$/), 'Message signature should be a hex string');
    });

    t.test('assembleAddWriterMessage - Invalid wallet', async (k) => {
        const msg = await MsgUtils.assembleAddWriterMessage({publicKey: "1234567890abcdef"}, writingKeyNonAdmin);
        k.is(msg, undefined, 'Message should be undefined');
    });

    t.test('assembleAddWriterMessage - undefined Wallet', async (k) => {
        const msg = await MsgUtils.assembleAddWriterMessage(undefined, writingKeyNonAdmin);
        k.is(msg, undefined, 'Message should be undefined');
    });

    t.test('assembleAddWriterMessage - Invalid writing key', async (k) => {
        const msg = await MsgUtils.assembleAddWriterMessage(walletNonAdmin, "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg");
        k.is(msg, undefined, 'Message should be undefined');
    });

    t.test('assembleAddWriterMessage - Null writing key', async (k) => {
        const msg = await MsgUtils.assembleAddWriterMessage(walletNonAdmin, undefined);
        k.is(msg, undefined, 'Message should be undefined');
    });

});