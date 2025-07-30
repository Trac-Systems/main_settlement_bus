import b4a from 'b4a';

import { bufferToAddress, isAddressValid } from './address.js';
import { TRAC_ADDRESS_SIZE, TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';
import { WRITER_BYTE_LENGTH } from '../../../utils/constants.js';
import { isBufferValid } from '../../../utils/buffer.js';

const ADMIN_ENTRY_SIZE = TRAC_ADDRESS_SIZE + WRITER_BYTE_LENGTH;

/**
 * Encodes an admin entry as a buffer containing the TRAC address and writing key.
 * 
 * The buffer format is: [TRAC_ADDRESS][WRITING_KEY(32)]
 * Where TRAC_ADDRESS is a bech32m-encoded address without the HRP and separator.
 *
 * @param {Buffer} address - The admin address.
 * @param {Buffer} wk - The admin's writing key buffer (must be 32 bytes).
 * @returns {Buffer} The encoded admin entry buffer, or an empty buffer if input is invalid.
 */
export function encode(address, wk) {
    try {
        if (!isAddressValid(address, TRAC_NETWORK_MSB_MAINNET_PREFIX) ||
            !isBufferValid(wk, WRITER_BYTE_LENGTH)) {
            throw new Error('Invalid address or writing key buffer');
        }
        const adminEntry = b4a.alloc(TRAC_ADDRESS_SIZE + WRITER_BYTE_LENGTH);
        b4a.copy(address, adminEntry, 0);
        b4a.copy(wk, adminEntry, TRAC_ADDRESS_SIZE);
        return adminEntry;
    } catch (error) {
        console.error('Error when encoding admin entry:', error);
        return b4a.alloc(0);
    }
}

/**
 * Decodes an admin entry buffer into its TRAC address and writing key components.
 *
 * The buffer format is: [TRAC_ADDRESS][WRITING_KEY(32)]
 * Where TRAC_ADDRESS is a bech32m-encoded address without the HRP and separator.
 *
 * @param {Buffer} adminEntry - The encoded admin entry buffer.
 * @returns {Object | null} An object with:
 *   - address: String containing the TRAC address.
 *   - wk: Buffer containing the writing key.
 */
export function decode(adminEntry) {
    if (!isBufferValid(adminEntry, ADMIN_ENTRY_SIZE)) {
        return null;
    }

    try {
        const addressPart = adminEntry.subarray(0, TRAC_ADDRESS_SIZE);
        const address = bufferToAddress(addressPart, TRAC_NETWORK_MSB_MAINNET_PREFIX);
        const wk = adminEntry.subarray(TRAC_ADDRESS_SIZE);
        return { address, wk };
    }
    catch (error) {
        console.error('Error decoding admin entry:', error);
        return null;
    }
}

export default {
    encode,
    decode
};