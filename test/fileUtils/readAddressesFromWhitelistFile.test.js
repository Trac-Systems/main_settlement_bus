import { test, hook } from 'brittle';
import fileUtils from '../../src/utils/fileUtils.js';
import fs from 'fs';

const DUMMY_PATH_FILLED = './dummy_whitelist_filled.txt';
const DUMMY_PATH_EMPTY = './dummy_whitelist_empty.txt';

const ADDR1 = 'trac1abcd';
const ADDR2 = 'trac1dcba';

hook('Initialize dummy whitelist', async t => {
    fs.writeFileSync(DUMMY_PATH_FILLED, `${ADDR1}\n${ADDR2}\n`);
    fs.writeFileSync(DUMMY_PATH_EMPTY, '');
});

test('readAddressesFromWhitelistFile - File contains addresses', async (t) => {
    const addresses = await fileUtils.readAddressesFromWhitelistFile(DUMMY_PATH_FILLED);

    t.ok(Array.isArray(addresses), 'Should return an array');
    t.is(addresses.length, 2, 'Array should contain all addresses');
    addresses.forEach((key) => {
        t.is(typeof key, 'string', 'Each public key should be a string');
    });
    t.is(addresses[0], ADDR1, 'First public key should match the dummy file content');
    t.is(addresses[1], ADDR2, 'Second public key should match the dummy file content');
});

test('readAddressesFromWhitelistFile - File is empty', async (t) => {
    const addresses = await fileUtils.readAddressesFromWhitelistFile(DUMMY_PATH_EMPTY);

    t.ok(Array.isArray(addresses), 'Should return an array');
    t.is(addresses.length, 0, 'Should return an empty array when the file is empty');
});

test('readAddressesFromWhitelistFile - File does not exist', async (t) => {
    const nonExistentPath = './non_existent_file.txt';
    try {
        await fileUtils.readAddressesFromWhitelistFile(nonExistentPath);
        t.fail('Should throw an error when the file does not exist');
    } catch (err) {
        t.ok(err instanceof Error, 'Should throw an Error');
        t.ok(err.message.includes(`Whitelist file not found: ${nonExistentPath}`), 'Error message should indicate the file was not found');
    }
});

hook('Cleanup dummy whitelist', async t => {
    if (fs.existsSync(DUMMY_PATH_FILLED)) {
        fs.unlinkSync(DUMMY_PATH_FILLED);
    }
    if (fs.existsSync(DUMMY_PATH_EMPTY)) {
        fs.unlinkSync(DUMMY_PATH_EMPTY);
    }
});