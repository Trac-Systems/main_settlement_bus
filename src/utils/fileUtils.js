import fs from 'fs';
import {WHITELIST_FILEPATH} from '../utils/constants.js';


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

export default {
    readPublicKeysFromFile
}
