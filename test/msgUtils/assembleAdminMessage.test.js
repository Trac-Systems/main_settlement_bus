import test from 'brittle';
import MsgUtils from '../../src/utils/msgUtils.js';
import { OperationType } from '../../src/utils/constants.js';
import {default as fixtures} from '../fixtures/assembleMessage.fixtures.js';

test('assembleAdminMessage', async (t) => {
    await fixtures.initAll();
    const walletAdmin = fixtures.walletAdmin;
    const walletNonAdmin = fixtures.walletNonAdmin;
    const writingKeyAdmin = fixtures.writingKeyAdmin;
    const writingKeyNonAdmin = fixtures.writingKeyNonAdmin;
    const bootstrapAdmin = fixtures.bootstrapAdmin;
    const adminEntry = fixtures.adminEntry;

    t.test('assembleAdminMessage - setup admin entry', async (k) => {
        const msg = await MsgUtils.assembleAdminMessage(null, writingKeyAdmin, walletAdmin, bootstrapAdmin);
        k.ok(msg, 'Message should be created');
        k.is(msg.type, OperationType.ADD_ADMIN, 'Message type should be ADD_ADMIN');
        k.is(msg.key, fixtures.walletAdmin.publicKey, 'Message key should be the public key of the wallet');
        k.is(msg.value.wk, fixtures.writingKeyAdmin, 'Message wk should be the writing key');
        k.is(msg.value.nonce.length, 64, 'Message nonce should be 64 characters long');
        k.ok(msg.value.nonce.match(/^[a-f0-9]+$/), 'Message nonce should be a hex string');
        k.is(msg.value.sig.length, 128, 'Message signature should be 128 characters long');
        k.ok(msg.value.sig.match(/^[a-f0-9]+$/), 'Message signature should be a hex string');
    });

    t.test('assembleAdminMessage - admin recovery message', async (k) => {
        const msg = await MsgUtils.assembleAdminMessage(adminEntry, writingKeyNonAdmin, walletAdmin, bootstrapAdmin);
        k.ok(msg, 'Message should be created');
        k.is(msg.type, OperationType.ADD_ADMIN, 'Message type should be ADD_ADMIN');
        k.is(msg.key, walletAdmin.publicKey, 'Message key should be the public key of the wallet');
        k.is(msg.value.wk, writingKeyNonAdmin, 'Message wk should be the writing key');
        k.is(msg.value.nonce.length, 64, 'Message nonce should be 64 characters long');
        k.ok(msg.value.nonce.match(/^[a-f0-9]+$/), 'Message nonce should be a hex string');
        k.is(msg.value.sig.length, 128, 'Message signature should be 128 characters long');
        k.ok(msg.value.sig.match(/^[a-f0-9]+$/), 'Message signature should be a hex string');
    });

    t.test('assembleAdminMessage - admin entry is null. Writing key is not bootstrap', async (k) => {
        const msg = await MsgUtils.assembleAdminMessage(null, writingKeyNonAdmin, walletAdmin, bootstrapAdmin);
        k.is(msg, undefined, 'Message should be undefined');
    });

    t.test("assembleAdminMessage - admin entry is set. Admin pubkey doesn't match wallet pubkey", async (k) => {
        const msg = await MsgUtils.assembleAdminMessage(adminEntry, writingKeyNonAdmin, walletNonAdmin, bootstrapAdmin);
        k.is(msg, undefined, 'Message should be undefined');
    });

    t.test("assembleAdminMessage - admin entry is set. writingKey is the same as admin", async (k) => {
        const msg = await MsgUtils.assembleAdminMessage(adminEntry, writingKeyAdmin, walletNonAdmin, bootstrapAdmin);
        k.is(msg, undefined, 'Message should be undefined');
    });
});