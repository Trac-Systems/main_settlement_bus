import b4a from 'b4a';

import { HASH_BYTE_LENGTH, NONCE_BYTE_LENGTH, WRITER_BYTE_LENGTH, TRAC_ADDRESS_SIZE } from '../../../utils/constants.js';
import { blake3Hash } from '../../../utils/crypto.js';
import {safeWriteUInt32BE} from "../../../utils/buffer.js";

/**
 * Total size of a transaction buffer in bytes.
 * Format: bootstrap + validator_address + msb_bootstrap + local_address + local_writer_key + content_hash + nonce
 * @type {number}
 */
export const TRANSACTION_TOTAL_SIZE = 3 * WRITER_BYTE_LENGTH + 2 * TRAC_ADDRESS_SIZE + HASH_BYTE_LENGTH + NONCE_BYTE_LENGTH;
export const BOOTSTRAP_DEPLOYMENT_SIZE = WRITER_BYTE_LENGTH + NONCE_BYTE_LENGTH + 4; // 4 bytes for OperationType because it is a UInt32BE
export const MAXIMUM_OPERATION_PAYLOAD_SIZE = 4096; // Maximum size of a transaction buffer in bytes

// 0.03 $TNK IS THE FEE FOR EACH TRANSACTION
export const FEE = b4a.from([
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x6a, 0x94, 0xd7,
    0x4f, 0x43, 0x00, 0x00,
]);

export const Status = Object.freeze({
    SUCCESS: 0,
    FAILURE: 1,
});

// TODO: This function receives too many arguments. It would be better to encapsulate them in an object.
/**
 * Generates a transaction buffer and returns its double BLAKE-3 hash.
 * @param {Buffer} bootstrap - The bootstrap buffer.
 * @param {Buffer} msb_bootstrap - The MSB bootstrap buffer.
 * @param {Buffer} validator_address - The validator address buffer.
 * @param {Buffer} local_writer_key - The local writer key buffer.
 * @param {Buffer} local_address - The local address buffer.
 * @param {Buffer} content_hash - The content hash buffer.
 * @param {Buffer} nonce - The nonce buffer.
 * @returns {Promise<Buffer>} The double BLAKE-3 hash of the transaction buffer, or an empty buffer on error.
 */
export async function generateTxBuffer(bootstrap, msb_bootstrap, validator_address, local_writer_key, local_address, content_hash, nonce) {
    try {
        const tx = b4a.allocUnsafe(TRANSACTION_TOTAL_SIZE);
        let offset = 0;

        bootstrap.copy(tx, offset);
        offset += bootstrap.length;

        msb_bootstrap.copy(tx, offset);
        offset += msb_bootstrap.length;

        validator_address.copy(tx, offset);
        offset += validator_address.length;

        local_writer_key.copy(tx, offset);
        offset += local_writer_key.length;

        local_address.copy(tx, offset);
        offset += local_address.length;

        content_hash.copy(tx, offset);
        offset += content_hash.length;

        nonce.copy(tx, offset);
        return await blake3Hash(tx)
    } catch (error) {
        console.error('Error in generateTxBuffer:', error);
        return b4a.alloc(0);
    }
}

/**
 * Generates a transaction buffer for bootstrap deployment and returns its BLAKE-3 hash.
 * The buffer consists of three parts concatenated in the following order:
 * 1. bootstrap (32 bytes) - The bootstrap identifier
 * 2. incoming_nonce (32 bytes) - Nonce from the requesting node
 * 3. operationType (4 bytes) - UInt32BE representing the operation type
 *
 * Total size: BOOTSTRAP_DEPLOYMENT_SIZE (68 bytes)
 *
 * @param {Buffer} bootstrap - The bootstrap identifier buffer (32 bytes)
 * @param {Buffer} incoming_nonce - The nonce from the requesting node (32 bytes)
 * @param {number} operationType - The operation type (should be OperationType.BOOTSTRAP_DEPLOYMENT)
 * @returns {Promise<Buffer>} The BLAKE-3 hash of the transaction buffer, or an empty buffer on error
 */
export async function generateBootstrapDeploymentTxBuffer(bootstrap, incoming_nonce, operationType) {
    try {

        const opTypeBuffer = safeWriteUInt32BE(operationType, 0);
        if (opTypeBuffer.length !== 4) {
            return b4a.alloc(0);
        }
        const tx = b4a.alloc(BOOTSTRAP_DEPLOYMENT_SIZE);
        let offset = 0;

        bootstrap.copy(tx, offset);
        offset += bootstrap.length;

        incoming_nonce.copy(tx, offset);
        offset += incoming_nonce.length;

        opTypeBuffer.copy(tx, offset);

        return await blake3Hash(tx)
    } catch (error) {
        console.error('Error in generateBootstrapDeploymentTxBuffer:', error);
        return b4a.alloc(0);
    }
}

export default {
    generateTxBuffer,
    generateBootstrapDeploymentTxBuffer,
    TRANSACTION_TOTAL_SIZE,
    MAXIMUM_OPERATION_PAYLOAD_SIZE,
    FEE
};