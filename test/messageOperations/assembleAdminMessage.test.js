import test from 'brittle';
import MessageOperations from '../../src/messages/MessageOperations.js';
import { default as fixtures } from '../fixtures/assembleMessage2.fixtures.js';
import b4a from 'b4a';
import { safeDecodeApplyOperation } from '../../src/utils/protobuf/operationHelpers.js';

test('assembleAdminMessage', async (t) => {
    await fixtures.initAll();

    const walletAdmin = fixtures.walletAdmin;
    const walletNonAdmin = fixtures.walletNonAdmin;
    const writingKeyAdmin = fixtures.writingKeyAdmin;
    const writingKeyNonAdmin = fixtures.writingKeyNonAdmin;
    const bootstrapAdmin = fixtures.bootstrapAdmin;
    const adminEntry = fixtures.adminEntry;

    t.test('assembleAdminMessage - setup admin entry', async (k) => {

        const msg = safeDecodeApplyOperation(await MessageOperations.assembleAddAdminMessage(null, writingKeyAdmin, walletAdmin, bootstrapAdmin));

        k.ok(msg, 'Message should be created');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(msg.eko).length, 3, 'Message value have 4 keys');
        k.is(msg.type, 1, 'Message type should be ADD_ADMIN');
        k.ok(b4a.equals(msg.key, walletAdmin.publicKey), 'Message key should be the public key of the wallet');

        k.ok(b4a.equals(msg.eko.wk, writingKeyAdmin), 'Message wk should be the writing key');
        k.is(msg.eko.nonce.length, 32, 'Message nonce should be 32 bytes long');
        k.ok(b4a.isBuffer(msg.eko.nonce), 'Message nonce should be a buffer');
        k.is(msg.eko.sig.length, 64, 'Message signature should be 64 characters long');
        k.ok(b4a.isBuffer(msg.eko.sig), 'Message signature should be a buffer');
    });

    t.test('assembleAdminMessage - admin recovery message', async (k) => {
        const msg = safeDecodeApplyOperation(await MessageOperations.assembleAddAdminMessage(adminEntry, writingKeyNonAdmin, walletAdmin, bootstrapAdmin));
        console.log('msg', msg);
        console.log('Object.keys(msg).length', Object.keys(msg).length);

        k.ok(msg, 'Message should be created');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(msg.eko).length, 3, 'Message value have 4 keys');
        k.is(msg.type, 1, 'Message type should be ADD_ADMIN');
        k.ok(b4a.equals(msg.key, walletAdmin.publicKey), 'Message key should be the public key of the wallet');
        k.ok(b4a.equals(msg.eko.wk, writingKeyNonAdmin), 'Message wk should be the writing key');
        k.is(msg.eko.sig.length, 64, 'Message signature should be 64 characters long');
        k.ok(b4a.isBuffer(msg.eko.sig), 'Message signature should be a buffer');

    });

    t.test('assembleAdminMessage - admin entry is null. Writing key is not bootstrap', async (k) => {
        const msg = await MessageOperations.assembleAddAdminMessage(null, writingKeyNonAdmin, walletAdmin, bootstrapAdmin);
        k.is(msg, null, 'Message should be null');
    });

    t.test("assembleAdminMessage - admin entry is set. Admin pubkey doesn't match wallet pubkey", async (k) => {
        const msg = await MessageOperations.assembleAddAdminMessage(adminEntry, writingKeyNonAdmin, walletNonAdmin, bootstrapAdmin);
        k.is(msg, null, 'Message should be null');
    });

    t.test("assembleAdminMessage - admin entry is set. writingKey is the same as admin", async (k) => {
        const msg = await MessageOperations.assembleAddAdminMessage(adminEntry, writingKeyAdmin, walletNonAdmin, bootstrapAdmin);
        k.is(msg, null, 'Message should be null');
    });

});