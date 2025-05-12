import fs from 'fs';
import {WHITELIST_FILEPATH} from '../utils/constants.js';

// TODO: The methods in fileUtils need to be refactoed and generalized to improve code reusability
// -- For example, the readPublicKeysFromFile method is specific to reading a whitelist file set in constants.
// -- In the future, we might want to generalize this method to read any file and return its content.
async function readPublicKeysFromFile() {
    try {
        const data = await fs.promises.readFile(WHITELIST_FILEPATH, 'utf8');
        const pubKeys = data
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (pubKeys.length === 0) {
            console.log('The file does not contain any public keys');
        }

        return pubKeys;
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('Whitelist file not found');
        }
        console.log(`Failed to read public keys from the whitelist file: ${err.message}`);
    }
}


export default {
    readPublicKeysFromFile
}