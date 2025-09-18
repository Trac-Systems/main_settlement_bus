import b4a from 'b4a';

import { bufferToAddress, isAddressValid } from './address.js';
import { TRAC_ADDRESS_SIZE, TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';
import { BOOTSTRAP_BYTE_LENGTH ,HASH_BYTE_LENGTH} from '../../../utils/constants.js';
import { isBufferValid } from '../../../utils/buffer.js';


/**
 * Encodes a transaction entry into a buffer containing the TX hash and TRAC address.
 *
 * Buffer format:
 *   [TX_HASH(32)][TRAC_ADDRESS(TRAC_ADDRESS_SIZE)]
 *
 * - TX_HASH: Transaction hash buffer (must be exactly HASH_BYTE_LENGTH bytes).
 * - TRAC_ADDRESS: A bech32m-encoded address (without HRP and separator).
 *
 * @param {Buffer} txHash - Transaction hash buffer.
 * @param {Buffer} address - The account address that initiated the deployment.
 * @returns {Buffer} A buffer containing the encoded transaction entry, or an empty buffer if input is invalid.
 */

export function encode(txHash, address) {
    try {
        if (!isBufferValid(txHash, HASH_BYTE_LENGTH) ||
            !isAddressValid(address, TRAC_NETWORK_MSB_MAINNET_PREFIX)) {
            console.error('Invalid txHash or address buffer');
            return b4a.alloc(0);
        }

        const entry = b4a.alloc(HASH_BYTE_LENGTH + TRAC_ADDRESS_SIZE);

        b4a.copy(txHash, entry, 0);
        b4a.copy(address, entry, HASH_BYTE_LENGTH);

        return entry;
    } catch (error) {
        console.error('Error when encoding transaction entry:', error);
        return b4a.alloc(0);
    }
}

/**
 * Decodes a transaction entry buffer into its TX hash and TRAC address.
 *
 * Buffer format:
 *   [TX_HASH(32)][TRAC_ADDRESS(TRAC_ADDRESS_SIZE)]
 *
 * - TX_HASH: Transaction hash buffer.
 * - TRAC_ADDRESS: A bech32m-encoded address (without HRP and separator).
 *
 * @param {Buffer} entry - The encoded transaction entry buffer.
 * @returns {{ txHash: Buffer, address: Buffer }} An object containing:
 *          - txHash: The transaction hash buffer.
 *          - address: The TRAC address buffer.
 *          or null if the input is invalid.
 */
export function decode(entry) {
    try {
        if (!isBufferValid(entry, HASH_BYTE_LENGTH + TRAC_ADDRESS_SIZE)) {
            console.error('Invalid transaction entry buffer');
            return b4a.alloc(0);
        }

        const txHash = entry.subarray(0, HASH_BYTE_LENGTH);
        const address = entry.subarray(HASH_BYTE_LENGTH, HASH_BYTE_LENGTH + TRAC_ADDRESS_SIZE);

        return { txHash, address };
    } catch (error) {
        console.error('Error decoding transaction entry:', error);
        return b4a.alloc(0);
    }
}

export default { encode, decode };