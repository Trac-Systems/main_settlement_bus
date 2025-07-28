import b4a from 'b4a';

import { TRAC_NETWORK_MSB_MAINNET_PREFIX, TRAC_ADDRESS_SIZE } from 'trac-wallet/constants.js';

/**
 * Checks if a given address is a valid TRAC bech32m address.
 * Note that we only check the format and length, not the checksum.
 * So, it is possible that even if an address is considered valid,
 * it may not be a real address on the network.
 * @param {string} address - The address to validate.
 * @param {string} [prefix] - The HRP of the bech32m address. Default is Trac Network mainnet prefix
 * @returns {boolean} True if the address is valid, false otherwise.
 */
function isAddressValid(address, prefix = TRAC_NETWORK_MSB_MAINNET_PREFIX) {
    const bech32Chars = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/;
    if (typeof address === 'string' &&
        address.length === TRAC_ADDRESS_SIZE &&
        address.startsWith(prefix + '1') &&
        bech32Chars.test(address.slice(prefix.length + 1))) {
        return true;
    }
    return false;
}


/**
 * Converts a valid bech32m address string to a buffer.
 * @param {string} bech32mAddress - The bech32m address to convert.
 * @returns {Buffer} The buffer representation of the address, or an empty buffer if invalid.
 */
// TODO: Check if a try-catch is really necessary here
export function addressToBuffer(bech32mAddress) {
    try {
        if (!isAddressValid(bech32mAddress)) {
            return b4a.alloc(0);
        }
        return b4a.from(bech32mAddress, 'ascii');
    } catch (error) {
        console.error('Error converting address to buffer:', error);
        return b4a.alloc(0);
    }
}

/**
 * Converts a buffer to a bech32m address string if valid.
 * @param {Buffer} dataBuffer - The buffer to convert.
 * @returns {string|null} The address string if valid, otherwise null.
 */
// TODO: Do we really need to try-catch here? Maybe we should only validate the input buffer.
export function bufferToAddress(dataBuffer) {
    try {
        const address = dataBuffer.toString('ascii');
        if (!isAddressValid(address)) return null;
        return address;
    } catch (error) {
        console.error('Error converting buffer to address:', error);
        return null;
    }
}

export default {
    isAddressValid,
    addressToBuffer,
    bufferToAddress,
    TRAC_ADDRESS_SIZE,
    TRAC_NETWORK_MSB_MAINNET_PREFIX
};
