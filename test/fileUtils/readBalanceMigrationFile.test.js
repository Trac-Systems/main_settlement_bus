
import { test, hook } from 'brittle';
import fileUtils from '../../src/utils/fileUtils.js';
import { errorMessageIncludes } from "../utils/regexHelper.js";
import fs from 'fs';

let stateInstance;
stateInstance = {
    getAdminEntry: async () => ({
        address: 'trac1yva2pduhz5yst8jgzmrc9ve0as5mx7tcw6le9srj6xcwqkx9hacqxxhsf9',
    }),
    getNodeEntryUnsigned: async (address) => {
        return {
            isWhitelisted: false
        };
    }
};

const DUMMY_PATH_OK = './dummy_balance_ok.csv';
const DUMMY_PATH_DUP = './dummy_balance_dup.csv';
const DUMMY_PATH_INVALID_ADDRESS = './dummy_balance_invalid_address.csv';
const DUMMY_PATH_EMPTY = './dummy_balance_empty.csv';

const ADDR1 = 'trac1dguwzsvcsehslh6dgj2mqlsxdn7s5t5vhem56yd0xlg47aq6exzqymhr6u';
const ADDR2 = 'trac123z3gfpr2epjwww7ntm3m6ud2fhmq0tvts27p2f5mx3qkecsutlqfys769';

hook('Initialize dummy balance files', async t => {
    fs.writeFileSync(DUMMY_PATH_OK, `${ADDR1},1.000000000000000001\n${ADDR2},2.000000000000000000\n`);
    fs.writeFileSync(DUMMY_PATH_DUP, `${ADDR1},1.0\n${ADDR1},2.0\n`);
    fs.writeFileSync(DUMMY_PATH_INVALID_ADDRESS, `notanaddr,1.0\n`);
    fs.writeFileSync(DUMMY_PATH_EMPTY, '');
});

test('readBalanceMigrationFile - valid file', async (t) => {
    const { addressBalancePair, totalBalance, totalAddresses } = await fileUtils.readBalanceMigrationFile(stateInstance, DUMMY_PATH_OK);
    t.is(typeof addressBalancePair, 'object');
    t.is(addressBalancePair.size, 2);
    t.is(totalAddresses, 2);
    t.ok(totalBalance > 0n);
    t.ok(addressBalancePair.has(ADDR1));
    t.ok(addressBalancePair.has(ADDR2));
});

test('readBalanceMigrationFile - duplicate address', async (t) => {
    await t.exception(() => fileUtils.readBalanceMigrationFile(stateInstance, DUMMY_PATH_DUP),
        errorMessageIncludes(`Duplicate address found in balance migration file: '${ADDR1}'. Each address must be unique.`))
});

test('readBalanceMigrationFile - invalid address', async (t) => {
    await t.exception(() => fileUtils.readBalanceMigrationFile(stateInstance, DUMMY_PATH_INVALID_ADDRESS),
        errorMessageIncludes('Invalid address found in balance migration file: \'notanaddr\'. Please ensure all addresses are valid.'))
});

test('readBalanceMigrationFile - empty file', async (t) => {
    await t.exception(() => fileUtils.readBalanceMigrationFile(stateInstance, DUMMY_PATH_EMPTY),
        errorMessageIncludes('Balance migration file is empty. File must contain at least one valid address balance pair.'))
});

test('readBalanceMigrationFile - file does not exist', async (t) => {
    const nonExistentPath = './non_existent_balance.csv';
    await t.exception(() => fileUtils.readBalanceMigrationFile(stateInstance, nonExistentPath),
        errorMessageIncludes(`Balance migration file not found: ${nonExistentPath}`))
});

test('readBalanceMigrationFile - invalid file extension', async (t) => {
    const invalidExtensionPath = './dummy_balance.txt';
    await t.exception(() => fileUtils.readBalanceMigrationFile(stateInstance,invalidExtensionPath),
        errorMessageIncludes(`Invalid file format: ${invalidExtensionPath}. Balance migration file must be a CSV file.`))
});

hook('Cleanup dummy balance files', async t => {
    [DUMMY_PATH_OK, DUMMY_PATH_DUP, DUMMY_PATH_INVALID_ADDRESS, DUMMY_PATH_EMPTY].forEach(path => {
        if (fs.existsSync(path)) fs.unlinkSync(path);
    });
});
