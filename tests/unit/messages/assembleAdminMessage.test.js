import test from 'brittle';
import b4a from 'b4a';
import { createApplyStateMessageFactory } from '../../src/messages/state/applyStateMessageFactory.js';
import {default as fixtures} from '../fixtures/assembleMessage.fixtures.js';
import {OperationType} from "../../src/utils/constants.js";
import {bufferToAddress} from "../../src/core/state/utils/address.js";
import { safeDecodeApplyOperation, safeEncodeApplyOperation } from '../../src/utils/protobuf/operationHelpers.js';
import {isAddressValid} from "../../src/core/state/utils/address.js";
import {errorMessageIncludes} from "../utils/regexHelper.js";
import { config } from '../../helpers/config.js';

test('assembleAdminMessage', async (t) => {
    await fixtures.initAll();

    const walletAdmin = fixtures.walletAdmin;
    const writingKeyAdmin = fixtures.writingKeyAdmin;
    const writingKeyNonAdmin = fixtures.writingKeyNonAdmin;
    const txValidity = b4a.alloc(32, 1);


    t.test('assembleAdminMessage - setup admin', async (k) => {
        const payload = await createApplyStateMessageFactory(walletAdmin, config)
            .buildCompleteAddAdminMessage(walletAdmin.address, writingKeyAdmin, txValidity);
        const msg = safeDecodeApplyOperation(safeEncodeApplyOperation(payload));

        k.ok(msg, 'Message should be created');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(msg.cao).length, 5, 'Message value have 5 keys');
        k.is(msg.type, OperationType.ADD_ADMIN, 'Message type should be ADD_ADMIN');
        k.is(bufferToAddress(msg.address, config.addressPrefix), walletAdmin.address, 'Message address should be the public key of the wallet');

        k.ok(isAddressValid(msg.address, config.addressPrefix), 'Message address should be a valid address');

        k.ok(b4a.equals(msg.cao.iw, writingKeyAdmin), 'Message iw should be the writing key');
        k.is(msg.cao.in.length, 32, 'Message nonce should be 32 bytes long');
        k.ok(b4a.isBuffer(msg.cao.in), 'Message nonce should be a buffer');
        k.is(msg.cao.is.length, 64, 'Message signature should be 64 bytes long')
        k.ok(b4a.isBuffer(msg.cao.is), 'Message signature should be a buffer');
    });

    t.test('assembleAdminMessage - admin recovery message', async (k) => {
        const payload = await createApplyStateMessageFactory(walletAdmin, config)
            .buildCompleteAddAdminMessage(walletAdmin.address, writingKeyNonAdmin, txValidity);
        const msg = safeDecodeApplyOperation(safeEncodeApplyOperation(payload));

        k.ok(msg, 'Message should be created');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(msg.cao).length, 5, 'Message value have 5 keys');
        k.is(msg.type, OperationType.ADD_ADMIN, 'Message type should be ADD_ADMIN');

        k.is(bufferToAddress(msg.address, config.addressPrefix), walletAdmin.address, 'Message address should be address of the wallet');
        k.ok(isAddressValid(msg.address, config.addressPrefix), 'Message address should be a valid address');

        k.ok(b4a.equals(msg.cao.iw, writingKeyNonAdmin), 'Message iw should be the writing key');
        k.is(msg.cao.is.length, 64, 'Message signature should be 64 bytes long')
        k.ok(b4a.isBuffer(msg.cao.is), 'Message signature should be a buffer');

    });

    t.test('assembleAdminMessage - writer key is null', async (k) => {
        await k.exception(
            async () => {
                const payload = await createApplyStateMessageFactory(walletAdmin, config)
                    .buildCompleteAddAdminMessage(walletAdmin.address, null, txValidity);
                return safeEncodeApplyOperation(payload);
            },
            errorMessageIncludes('Writer key must be a 32-byte buffer')
        );
    });

    t.test("assembleAdminMessage - admin wallet is null", async (k) => {
        await k.exception(
            async () =>
                createApplyStateMessageFactory(null, config)
                    .buildCompleteAddAdminMessage(walletAdmin.address, writingKeyAdmin, txValidity),
            errorMessageIncludes('Wallet must be a valid wallet object')
        );
    });
});
