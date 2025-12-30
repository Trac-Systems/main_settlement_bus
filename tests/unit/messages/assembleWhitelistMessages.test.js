import test from 'brittle';
import { OperationType } from '../../src/utils/protobuf/applyOperations.cjs';
import { default as fixtures } from '../fixtures/assembleMessage.fixtures.js';
import { safeDecodeApplyOperation } from '../../src/utils/protobuf/operationHelpers.js';
import b4a from 'b4a';
import { createApplyStateMessageFactory } from '../../src/messages/state/applyStateMessageFactory.js';
import { safeEncodeApplyOperation } from '../../src/utils/protobuf/operationHelpers.js';
import {bufferToAddress} from "../../src/core/state/utils/address.js";
import {errorMessageIncludes} from "../utils/regexHelper.js";
import { config } from '../../helpers/config.js'

// MOCK SETUP
const whitelistAddresses = [
    'trac1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljk',
];
test('assembleWhitelistMessages', async (t) => {
    await fixtures.initAll();
    const walletAdmin = fixtures.walletAdmin;
    const txValidity = b4a.alloc(32, 1);


    t.test('assembleWhitelistMessages - Happy Path', async (k) => {
        const payload = await createApplyStateMessageFactory(walletAdmin, config)
            .buildCompleteAppendWhitelistMessage(
                walletAdmin.address,
                whitelistAddresses[0],
                txValidity
            );
        const msg = safeDecodeApplyOperation(safeEncodeApplyOperation(payload));
        k.ok(msg, 'Message should be created');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(msg.aco).length, 5, 'Message value should have 5 keys');
        k.is(msg.type, OperationType.APPEND_WHITELIST, 'Message type should be APPEND_WHITELIST');

        k.is(bufferToAddress(msg.address, config.addressPrefix) , walletAdmin.address, 'Message address should be the admin address');
        k.is(bufferToAddress(msg.aco.ia, config.addressPrefix) , whitelistAddresses[0], 'Incoming address should match whitelist');
        k.is(msg.aco.in.length, 32, 'Message nonce should be 32 bytes long');
        k.ok(b4a.isBuffer(msg.aco.in), 'Message nonce should be a buffer');
        k.is(msg.aco.is.length, 64, 'Message signature should be 64 bytes long');
        k.ok(b4a.isBuffer(msg.aco.is), 'Message signature should be a buffer');
    });

    t.test('assembleWhitelistMessages - Should return null when wallet is invalid', async (k) => {
        await k.exception(
            async () => await createApplyStateMessageFactory(null, config)
                .buildCompleteAppendWhitelistMessage(walletAdmin.address, whitelistAddresses[0], txValidity),
            errorMessageIncludes('Wallet must be a valid wallet object')
        );
    });


    t.test('assembleWhitelistMessages - Empty object', async (k) => {
        await k.exception(
            async () => await createApplyStateMessageFactory({}, config)
                .buildCompleteAppendWhitelistMessage(walletAdmin.address, whitelistAddresses[0], txValidity),
            errorMessageIncludes('Wallet should have a valid TRAC address.')
        );

    });
});
