import test from 'brittle';
import StateMessageOperations from '../../src/messages/stateMessages/StateMessageOperations.js';
import {default as fixtures} from '../fixtures/assembleMessage.fixtures.js';
import {OperationType} from "../../src/utils/constants.js";
import {bufferToAddress} from "../../src/core/state/utils/address.js";
import b4a from 'b4a';
import {safeDecodeApplyOperation} from '../../src/utils/protobuf/operationHelpers.js';
import {isAddressValid} from "../../src/core/state/utils/address.js";
import {errorMessageIncludes} from "../utils/regexHelper.js";

test('assembleAdminMessage', async (t) => {
    await fixtures.initAll();

    const walletAdmin = fixtures.walletAdmin;
    const writingKeyAdmin = fixtures.writingKeyAdmin;
    const writingKeyNonAdmin = fixtures.writingKeyNonAdmin;


    t.test('assembleAdminMessage - setup admin', async (k) => {

        const msg = safeDecodeApplyOperation(await StateMessageOperations.assembleAddAdminMessage(walletAdmin, writingKeyAdmin));

        k.ok(msg, 'Message should be created');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(msg.eko).length, 3, 'Message value have 3 keys');
        k.is(msg.type, OperationType.ADD_ADMIN, 'Message type should be ADD_ADMIN');
        k.is(bufferToAddress(msg.address), walletAdmin.address, 'Message address should be the public key of the wallet');

        k.ok(isAddressValid(msg.address), 'Message address should be a valid address');

        k.ok(b4a.equals(msg.eko.wk, writingKeyAdmin), 'Message wk should be the writing key');
        k.is(msg.eko.nonce.length, 32, 'Message nonce should be 32 bytes long');
        k.ok(b4a.isBuffer(msg.eko.nonce), 'Message nonce should be a buffer');
        k.is(msg.eko.sig.length, 64, 'Message signature should be 64 bytes long')
        k.ok(b4a.isBuffer(msg.eko.sig), 'Message signature should be a buffer');
    });

    t.test('assembleAdminMessage - admin recovery message', async (k) => {
        const msg = safeDecodeApplyOperation(await StateMessageOperations.assembleAddAdminMessage(walletAdmin, writingKeyNonAdmin));

        k.ok(msg, 'Message should be created');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(msg.eko).length, 3, 'Message value have 3 keys');
        k.is(msg.type, OperationType.ADD_ADMIN, 'Message type should be ADD_ADMIN');

        k.is(bufferToAddress(msg.address), walletAdmin.address, 'Message address should be address of the wallet');
        k.ok(isAddressValid(msg.address), 'Message address should be a valid address');

        k.ok(b4a.equals(msg.eko.wk, writingKeyNonAdmin), 'Message wk should be the writing key');
        k.is(msg.eko.sig.length, 64, 'Message signature should be 64 bytes long')
        k.ok(b4a.isBuffer(msg.eko.sig), 'Message signature should be a buffer');

    });

    t.test('assembleAdminMessage - writer key is null', async (k) => {
        await k.exception(
            async () => await StateMessageOperations.assembleAddAdminMessage(walletAdmin, null),
            errorMessageIncludes('Writer key must be a 32 length buffer')
        );
    });

    t.test("assembleAdminMessage - admin wallet is null", async (k) => {
        await k.exception(
            async () => await StateMessageOperations.assembleAddAdminMessage(null, writingKeyAdmin),
            errorMessageIncludes('Wallet must be a valid wallet object')
        );
    });
});