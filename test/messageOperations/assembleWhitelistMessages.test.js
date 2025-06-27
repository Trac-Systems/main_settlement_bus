import test from 'brittle';
import MessageOperations from '../../src/utils/messages/MessageOperations.js';
import { OperationType } from '../../src/utils/protobuf/applyOperations.cjs';
import { default as fixtures } from '../fixtures/assembleMessage2.fixtures.js';
import { safeDecodeAppyOperation } from '../../src/utils/functions.js';
import b4a from 'b4a';

test('assembleWhitelistMessages', async (t) => {
    await fixtures.initAll();
    const walletAdmin = fixtures.walletAdmin;
    const walletNonAdmin = fixtures.walletNonAdmin;
    const adminEntry = fixtures.adminEntry;
    // const mockedWhitelistPubKey = "1234567890abcdef" // TODO: Create mocked whitelist file

    // TODO: This test only works by reading the REAL whitelist file. This should be mocked
    t.test('assembleWhitelistMessages - Happy Path', async (k) => {
        const msg = await MessageOperations.assembleAppendWhitelistMessages(walletAdmin);
        k.ok(msg, 'Message should be created');
        k.ok(msg.length > 0, 'Message should be an array with at least one element'); // TODO: Assuming whitelist file contains at least one entry. Create mock
        const decodedMsg = safeDecodeAppyOperation(msg[0]);
        console.log(decodedMsg);
        k.is(Object.keys(decodedMsg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(decodedMsg.bko).length, 2, 'Message value should have 2 keys');
        k.is(decodedMsg.type, OperationType.APPEND_WHITELIST, 'Message type should be APPEND_WHITELIST');
        // k.is(msg[0].key, mockedWhitelistPubKey, 'Message key should be the public key in the file'); // TODO: Activate after whitelist file is mocked
        k.is(decodedMsg.bko.nonce.length, 32, 'Message nonce should be 32 bytes long');
        k.ok(b4a.isBuffer(decodedMsg.bko.nonce), 'Message nonce should be a buffer');
        k.is(decodedMsg.bko.sig.length, 64, 'Message signature should be 64 bytes long');
        k.ok(b4a.isBuffer(decodedMsg.bko.sig), 'Message signature should be a buffer');
    });

    t.test('assembleWhitelistMessages - Should return null when wallet is invalid', async (k) => {
        const msg = await MessageOperations.assembleAppendWhitelistMessages(null);
        k.is(msg, null, 'Message should be null');
    });

    t.test('assembleWhitelistMessages - Should return null when both adminEntry and wallet are invalid', async (k) => {
        const msg = await MessageOperations.assembleAppendWhitelistMessages({});
        k.is(msg, null, 'Message should be null');
    });

    // TODO: After implementing whitelist file mocking, implement tests for the following cases:
    // t.test('assembleWhitelistMessages - Should return empty array when whitelist file is empty', async (k) => {});
    // t.test('assembleWhitelistMessages - Should return empty array when whitelist file is invalid', async (k) => {});
    // t.test('assembleWhitelistMessages - Should return null when whitelist file is not found or not readabble', async (k) => {});
    // t.test('assembleWhitelistMessages - Should return conly valid entries in a file that cointains some invalid entries', async (k) => {});
});