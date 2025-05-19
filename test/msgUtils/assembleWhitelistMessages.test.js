import test from 'brittle';
import MsgUtils from '../../src/utils/msgUtils.js';
import { OperationType } from '../../src/utils/constants.js';
import { default as fixtures } from '../fixtures/assembleMessage.fixtures.js';

test('assembleWhitelistMessages', async (t) => {
    await fixtures.initAll();
    const walletAdmin = fixtures.walletAdmin;
    const walletNonAdmin = fixtures.walletNonAdmin;
    const adminEntry = fixtures.adminEntry;
    // const mockedWhitelistPubKey = "1234567890abcdef" // TODO: Create mocked whitelist file

    // TODO: This test only works by reading the REAL whitelist file. This should be mocked
    t.test('assembleWhitelistMessages - Happy Path', async (k) => {
        const msg = await MsgUtils.assembleWhitelistMessages(adminEntry, walletAdmin);
        k.ok(msg, 'Message should be created');
        k.ok(msg.length > 0, 'Message should be an array with at least one element'); // TODO: Assuming whitelist file contains at least one entry. Create mock
        k.is(Object.keys(msg[0]).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(msg[0].value).length, 2, 'Message value should have 2 keys');
        k.is(msg[0].type, OperationType.APPEND_WHITELIST, 'Message type should be APPEND_WHITELIST');
        // k.is(msg[0].key, mockedWhitelistPubKey, 'Message key should be the public key in the file'); // TODO: Activate after whitelist file is mocked
        k.is(msg[0].value.nonce.length, 64, 'Message nonce should be 64 characters long');
        k.ok(msg[0].value.nonce.match(/^[a-f0-9]+$/), 'Message nonce should be a hex string');
        k.is(msg[0].value.sig.length, 128, 'Message signature should be 128 characters long');
        k.ok(msg[0].value.sig.match(/^[a-f0-9]+$/), 'Message signature should be a hex string');
    });

    t.test('assembleWhitelistMessages - Should return null when adminEntry is invalid', async (k) => {
        const msg = await MsgUtils.assembleWhitelistMessages(null, walletAdmin);
        k.is(msg, null, 'Message should be null');
    });

    t.test('assembleWhitelistMessages - Should return null when wallet is invalid', async (k) => {
        const msg = await MsgUtils.assembleWhitelistMessages(adminEntry, null);
        k.is(msg, null, 'Message should be null');
    });

    t.test('assembleWhitelistMessages - Should return null when both adminEntry and wallet are invalid', async (k) => {
        const msg = await MsgUtils.assembleWhitelistMessages({}, {});
        k.is(msg, null, 'Message should be null');
    });

    t.test('assembleWhitelistMessages - Should return null when wallet is not from admin', async (k) => {
        const msg = await MsgUtils.assembleWhitelistMessages(adminEntry, walletNonAdmin);
        k.is(msg, null, 'Message should be null');
    });

    // TODO: After implementing whitelist file mocking, implement tests for the following cases:
    // t.test('assembleWhitelistMessages - Should return empty array when whitelist file is empty', async (k) => {});
    // t.test('assembleWhitelistMessages - Should return empty array when whitelist file is invalid', async (k) => {});
    // t.test('assembleWhitelistMessages - Should return null when whitelist file is not found or not readabble', async (k) => {});
    // t.test('assembleWhitelistMessages - Should return conly valid entries in a file that cointains some invalid entries', async (k) => {});
});