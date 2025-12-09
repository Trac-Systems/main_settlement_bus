import test from 'brittle';
import { OperationType } from '../../src/utils/protobuf/applyOperations.cjs';
import { default as fixtures } from '../fixtures/assembleMessage.fixtures.js';
import { safeDecodeApplyOperation } from '../../src/utils/protobuf/operationHelpers.js';
import b4a from 'b4a';
import fileUtils from "../../src/utils/fileUtils.js";
import CompleteStateMessageOperations from "../../src/messages/completeStateMessages/CompleteStateMessageOperations.js";
import {bufferToAddress} from "../../src/core/state/utils/address.js";
import {errorMessageIncludes} from "../utils/regexHelper.js";

// MOCK SETUP
const whitelistAddresses = [
    'trac1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljk',
];
const originalReadAddressesFromWhitelistFile = fileUtils.readAddressesFromWhitelistFile;

test('assembleWhitelistMessages', async (t) => {
    fileUtils.readAddressesFromWhitelistFile = async () => whitelistAddresses;

    await fixtures.initAll();
    const walletAdmin = fixtures.walletAdmin;


    t.test('assembleWhitelistMessages - Happy Path', async (k) => {
        const mapMsg = await CompleteStateMessageOperations.assembleAppendWhitelistMessages(walletAdmin);
        const msg = mapMsg.get(whitelistAddresses[0])
        k.ok(msg, 'Message should be created');
        k.ok(msg.length > 0, 'Message should be an array with at least one element');
        const decodedMsg = safeDecodeApplyOperation(msg);
        k.is(Object.keys(decodedMsg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(decodedMsg.bko).length, 2, 'Message value should have 2 keys');
        k.is(decodedMsg.type, OperationType.APPEND_WHITELIST, 'Message type should be APPEND_WHITELIST');

        k.is(bufferToAddress(decodedMsg.address, TRAC_NETWORK_MSB_MAINNET_PREFIX) , whitelistAddresses[0], 'Message address should be the address in the file');
        k.is(decodedMsg.bko.nonce.length, 32, 'Message nonce should be 32 bytes long');
        k.ok(b4a.isBuffer(decodedMsg.bko.nonce), 'Message nonce should be a buffer');
        k.is(decodedMsg.bko.sig.length, 64, 'Message signature should be 64 bytes long');
        k.ok(b4a.isBuffer(decodedMsg.bko.sig), 'Message signature should be a buffer');
    });

    t.test('assembleWhitelistMessages - Should return null when wallet is invalid', async (k) => {
        await k.exception(
            async () => await CompleteStateMessageOperations.assembleAppendWhitelistMessages(null),
            errorMessageIncludes('Wallet must be a valid wallet object')
        );
    });


    t.test('assembleWhitelistMessages - Empty object', async (k) => {
        await k.exception(
            async () => await CompleteStateMessageOperations.assembleAppendWhitelistMessages({}),
            errorMessageIncludes('Wallet should have a valid TRAC address.')
        );

    });

    fileUtils.readAddressesFromWhitelistFile = originalReadAddressesFromWhitelistFile;
});
