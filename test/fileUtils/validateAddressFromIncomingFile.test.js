import { test, hook } from 'brittle';
import fileUtils from '../../src/utils/fileUtils.js';
import { errorMessageIncludes } from "../utils/regexHelper.js";
import b4a from 'b4a';

const VALID_ADDRESS = 'trac1dguwzsvcsehslh6dgj2mqlsxdn7s5t5vhem56yd0xlg47aq6exzqymhr6u';
const ADMIN_ADDRESS = 'trac1yva2pduhz5yst8jgzmrc9ve0as5mx7tcw6le9srj6xcwqkx9hacqxxhsf9';
const INVALID_ADDRESS = 'notanaddress';

const mockStateInstance = {
    getNodeEntryUnsigned: async () => ({
        isWhitelisted: false,
        license: b4a.alloc(4, 0)
    }),
    getAdminEntry: async () => ({
        address: ADMIN_ADDRESS
    })
};

const mockStateInstanceWhitelisted = {
    getNodeEntryUnsigned: async () => ({
        isWhitelisted: true,
        license: b4a.alloc(4, 0)
    }),
    getAdminEntry: async () => ({
        address: ADMIN_ADDRESS
    })
};

const mockStateInstanceBanned = {
    getNodeEntryUnsigned: async () => ({
        isWhitelisted: false,
        license: b4a.alloc(4, 1)
    }),
    getAdminEntry: async () => ({
        address: ADMIN_ADDRESS
    })
};

test('validateAddressFromIncomingFile - valid address', async (t) => {
    await fileUtils.validateAddressFromIncomingFile(
        mockStateInstance,
        VALID_ADDRESS,
        { address: ADMIN_ADDRESS }
    );
    t.pass('Address validation succeeded as expected');
});

test('validateAddressFromIncomingFile - invalid address format', async (t) => {
    await t.exception(
        () => fileUtils.validateAddressFromIncomingFile(
            mockStateInstance,
            INVALID_ADDRESS,
            { address: ADMIN_ADDRESS }
        ),
        errorMessageIncludes('Invalid address format')
    );
});

test('validateAddressFromIncomingFile - admin address', async (t) => {
    await t.exception(
        () => fileUtils.validateAddressFromIncomingFile(
            mockStateInstance,
            ADMIN_ADDRESS,
            { address: ADMIN_ADDRESS }
        ),
        errorMessageIncludes(`The admin address '${ADMIN_ADDRESS}' cannot be included in the current operation`)
    );
});

test('validateAddressFromIncomingFile - whitelisted node', async (t) => {
    await t.exception(
        () => fileUtils.validateAddressFromIncomingFile(
            mockStateInstanceWhitelisted,
            VALID_ADDRESS,
            { address: ADMIN_ADDRESS }
        ),
        errorMessageIncludes(`Whitelisted node address '${VALID_ADDRESS}' cannot be included in the current operation`)
    );
});

test('validateAddressFromIncomingFile - banned/previously whitelisted address', async (t) => {
    await t.exception(
        () => fileUtils.validateAddressFromIncomingFile(
            mockStateInstanceBanned,
            VALID_ADDRESS,
            { address: ADMIN_ADDRESS }
        ),
        errorMessageIncludes(`Address '${VALID_ADDRESS}' has been banned/whitelisted in the past`)
    );
});
