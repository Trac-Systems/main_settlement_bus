import fs from 'fs'; // TODO: If we are using bare environment, we should use bare-fs instead
import { WHITELIST_FILEPATH, BALANCE_MIGRATION_FILEPATH } from '../utils/constants.js';
import { isAddressValid } from '../core/state/utils/address.js';
import { decimalStringToBigInt, bigIntTo16ByteBuffer, bufferToBigInt } from './amountSerialization.js';

/**
 * Reads the contents of the whitelist file and returns an array of strings.
 * Each line is expected to represent an address. Lines are trimmed and empty lines are ignored.
 * ATTENTION: The addresses are not checked for validity in this function.
 *
 * @param {string} [filepath=WHITELIST_FILEPATH] - The path to the file to read. Defaults to the whitelist file path from constants.
 * @returns {Promise<string[]>} Resolves with an array of strings (one per valid line).
 * @throws {Error} If the file does not exist or cannot be read.
 */
// TODO: We should generalize this function in the future, so we can improve the reusability of the code.
async function readPublicKeysFromFile(filepath = WHITELIST_FILEPATH) {
    try {
        const data = await fs.promises.readFile(filepath, 'utf8');
        const addresses = data
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (addresses.length === 0) {
            console.log('The file does not contain any public keys');
        }

        return addresses;
    } catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(`Whitelist file not found: ${filepath}`);
        }
        throw new Error(`Failed to read public keys from the whitelist file: ${err.message}`);
    }
}

async function readBalanceMigrationFile(filepath = BALANCE_MIGRATION_FILEPATH) {
    try {
        const pairFormatRegex = /^([a-zA-Z0-9]+),(\d+\.[0-9]+)$/;
        const data = await fs.promises.readFile(filepath, 'utf8');
        const lines = data
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        const addressBalancePair = new Map();
        let totalBalance = BigInt(0);
        let totalAddresses = 0;

        for (const line of lines) {
            const match = line.match(pairFormatRegex);
            if (!match) {
                throw new Error(`Invalid line in balance migration file: '${line}'. Each line must be in format: address,xxx.xxx`);
            }
            const address = match[1];
            const balance = match[2];
            if (addressBalancePair.has(address)) {
                throw new Error(`Duplicate address found in balance migration file: '${address}'. Each address must be unique.`);
            }
            if (!isAddressValid(address)) {
                throw new Error(`Invalid address found in balance migration file: '${address}'. Please ensure all addresses are valid.`);
            }
            const parsedBalance = decimalStringToBigInt(balance);
            const balanceBuffer = bigIntTo16ByteBuffer(parsedBalance);
            const reconstructedBalance = bufferToBigInt(balanceBuffer);

            if (parsedBalance !== reconstructedBalance) {
                throw new Error(`Balance serialization/deserialization mismatch for address '${address}'. Original: ${parsedBalance}, Reconstructed: ${reconstructedBalance}`);
            }
            totalBalance += parsedBalance;
            totalAddresses += 1;
            addressBalancePair.set(address, balanceBuffer);
        }
        return {addressBalancePair, totalBalance, totalAddresses};
    } catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(`Whitelist file not found: ${filepath}`);
        }
        throw new Error(`Failed to read public keys from the whitelist file: ${err.message}`);
    }
}

export default {
    readPublicKeysFromFile,
    readBalanceMigrationFile,
}
