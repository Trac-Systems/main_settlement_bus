import b4a from 'b4a';
import { bech32m } from 'bech32';
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';
import { createHash } from '../../utils/crypto.js';
//TODO: change name of this file because applyOperations.cjs exists in utils/protobuf and it should starts with lowercase because this is not a class.
//TODO: SPLIT IT INTO MANY FILES - THIS IS HARD TO READ.
//This file is part of contract. DO NOT CHANGE AFTER DEPLOYMENT.

// Keys sizes in bytes
const WRITING_KEY_SIZE = 32; // TODO: WE HAVE THIS CONSTANT ALREADY IN CONSTANT.JS
const TRAC_PUB_KEY_SIZE = 32; // TODO: WE HAVE THIS CONSTANT ALREADY IN CONSTANT.JS

// Bech32m constants
const BECH32M_HRP_SIZE = TRAC_NETWORK_MSB_MAINNET_PREFIX.length + 1; // +1 for the separator
const BECH32M_DATA_SIZE = Math.ceil(TRAC_PUB_KEY_SIZE * 8 / 5); // rounded up to the nearest 5-byte multiple (should be 52 for 32 byte keys)
const BECH32M_CHECKSUM_SIZE = 6;
export const TRAC_ADDRESS_SIZE = BECH32M_HRP_SIZE + BECH32M_DATA_SIZE + BECH32M_CHECKSUM_SIZE;

// Buffer standars sizes in bytes
const ADMIN_ENTRY_SIZE = TRAC_ADDRESS_SIZE + WRITING_KEY_SIZE;
const NODE_ENTRY_SIZE = WRITING_KEY_SIZE + 1;

// Role masks
// TODO: Consider implementing a role mask for Admin
const WHITELISTED_MASK = 0x1;
const WRITER_MASK = 0x2;
const INDEXER_MASK = 0x4;

export const NodeRole = {
    READER: 0x0, // Participant in the network able to read transactions and states 
    WHITELISTED: 0x1, // A Reader that is also able to apply to become a writer.
    WRITER: 0x3, // A Whitelisted node that is also able to write transactions.
    INDEXER: 0x7, // Special writer that only participates in consensus.
}

export const ZERO_WK = b4a.alloc(32, 0);

// bootstrap + validator_address + msb_bootstrap + local_address + local_writer_key + content_hash + nonce
export const TRANSACTION_TOTAL_SIZE = 32 + 32 + TRAC_ADDRESS_SIZE + 32 + TRAC_ADDRESS_SIZE + 32 + 32;

// ------------ HELPER FUNCTIONS  ------------ //

/**
 * Checks if the provided buffer is valid.
 * A valid buffer is a Buffer instance with the specified length.
 *
 * @param {Buffer} key - The buffer to validate.
 * @param {number} size - The expected length of the buffer.
 * @returns {boolean} True if the buffer is valid, false otherwise.
 */
function isBufferValid(key, size) {
    return b4a.isBuffer(key) && key.length === size;
}

/**
 * Checks if the provided node role is valid.
 * A valid node role is one of the values defined in the NodeRole enum.
 *
 * @param {number} role - The node role to validate.
 * @returns {boolean} True if the role is valid, false otherwise.
 */
function isNodeRoleValid(role) {
    return Object.values(NodeRole).includes(role);
}

function isAddressValid(address) {
    // Check if the address is a valid bech32m-encoded string
    if (typeof address !== 'string' ||
        address.length !== TRAC_ADDRESS_SIZE ||
        !address.startsWith(TRAC_NETWORK_MSB_MAINNET_PREFIX + '1')) {
        return false;
    }
    // Check if we can decode the address using bech32m
    try {
        bech32m.decode(address);
        return true;
    } catch (e) {
        return false;
    }
}

function calculateNodeRole(nodeObj) {

    let role = NodeRole.READER; // Default to reader
    if (!!nodeObj.isWhitelisted) {
        role |= WHITELISTED_MASK; // Set whitelisted bit
    }
    if (!!nodeObj.isWriter) {
        role |= WRITER_MASK; // Set writer bit
    }
    if (!!nodeObj.isIndexer) {
        role |= INDEXER_MASK; // Set indexer bit
    }
    return role;
}

/**
 * Converts a bech32m-encoded address string into a Buffer of 8-bit characters, excluding the HRP and separator.
 *
 * @param {string} bech32mAddress - The bech32m-encoded address string (with HRP).
 * @returns {Buffer} Buffer containing the UTF-8 bytes of the address string (without HRP and separator).
 */
export function addressToBuffer(bech32mAddress) {
    try {
        if (!isAddressValid(bech32mAddress)) {
            return b4a.alloc(0); // Return an empty buffer if the address is invalid
        }
        return b4a.from(bech32mAddress, 'ascii');
    } catch (error) {
        console.error('Error converting address to buffer:', error);
        return b4a.alloc(0); // Return an empty buffer on error
    }
}

/**x
 * Converts a buffer of 8-bit characters (the data part of a bech32m address, excluding HRP and separator)
 * back into a bech32m-encoded address string, including the provided HRP.
 *
 * @param {Buffer} dataBuffer - Buffer containing the UTF-8 bytes of the address data (excluding HRP and separator).
 * @returns {string|null} The full bech32m-encoded address string (with HRP) or null if something fails.
 */
export function bufferToAddress(dataBuffer) {
    try {
        const address = dataBuffer.toString('ascii');
        if (!isAddressValid(address)) return null;
        return address;
    }
    catch (error) {
        console.error('Error converting buffer to address:', error);
        return null;
    }
}

// ------------ ADMIN ENTRY ------------ //

/**
 * Encodes an admin entry as a buffer containing the TRAC address and writing key.
 * 
 * The buffer format is: [TRAC_ADDRESS][WRITING_KEY(32)]
 * Where TRAC_ADDRESS is a bech32m-encoded address without the HRP and separator.
 *
 * @param {Buffer} tracAddr - The TRAC address.
 * @param {Buffer} wk - The admin's writing key buffer (must be 32 bytes).
 * @returns {Buffer} The encoded admin entry buffer, or an empty buffer if input is invalid.
 */
export function encodeAdminEntry(tracAddr, wk) {
    if (!isBufferValid(wk, WRITING_KEY_SIZE)) {
        return b4a.alloc(0);
    }

    try {
        const adminEntry = b4a.alloc(TRAC_ADDRESS_SIZE + WRITING_KEY_SIZE);
        b4a.copy(tracAddr, adminEntry, 0);
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
 *   - tracAddr: String containing the TRAC address.
 *   - wk: Buffer containing the writing key.
 */
export function decodeAdminEntry(adminEntry) {
    if (!isBufferValid(adminEntry, ADMIN_ENTRY_SIZE)) {
        return null;
    }

    try {
        const tracAddrPart = adminEntry.subarray(0, TRAC_ADDRESS_SIZE);
        const tracAddr = bufferToAddress(tracAddrPart, TRAC_NETWORK_MSB_MAINNET_PREFIX);
        const wk = adminEntry.subarray(TRAC_ADDRESS_SIZE);
        return { tracAddr, wk };
    }
    catch (error) {
        console.error('Error decoding admin entry:', error);
        return null;
    }
}


// ------------ NODE ENTRY ------------ //

/**
 * Initializes a new node entry with given writing key and role.
 * Creates a buffer in format: [NODE_ROLE_MASK(1)][WRITING_KEY(32)]
 *
 * @param {Buffer} writingKey - The writing key for the node (must be 32 bytes)
 * @param {number} role - Initial role from NodeRole enum 
 * @returns {Buffer} The initialized node entry buffer, or empty buffer if invalid input
 */
export function initNodeEntry(writingKey, role) {
    if (!isBufferValid(writingKey, WRITING_KEY_SIZE) || !isNodeRoleValid(role)) {
        console.error('Invalid input for node initialization');
        return b4a.alloc(0);
    }

    try {
        const nodeEntry = b4a.alloc(NODE_ENTRY_SIZE);
        nodeEntry[0] = role;
        b4a.copy(writingKey, nodeEntry, 1);
        return nodeEntry;
    } catch (error) {
        console.error('Error initializing node entry:', error);
        return b4a.alloc(0);
    }
}

/**
 * Encodes a node entry as a buffer containing the node's role mask and writing key.
 *
 * The node entry buffer format is:
 *   [NODE_ROLE_MASK(1)][WRITING_KEY(32)]
 *   - The first byte is a bitmask representing the node's roles (whitelisted, writer, indexer).
 *   - The remaining 32 bytes are the node's writing key.
 *
 * @param {Object} node - An object representing the node, with properties:
 *   - wk: Buffer containing the node's writing key (must be 32 bytes).
 *   - isWhitelisted: Boolean indicating if the node is whitelisted.
 *   - isWriter: Boolean indicating if the node is a writer.
 *   - isIndexer: Boolean indicating if the node is an indexer.
 * @returns {Buffer} The encoded node entry buffer, or an empty buffer if input is invalid.
 */
export function encodeNodeEntry(node) {
    const nodeRole = calculateNodeRole(node);
    if (!isBufferValid(node.wk, WRITING_KEY_SIZE) || !isNodeRoleValid(nodeRole)) {
        return b4a.alloc(0); // Return an empty buffer if one of the inputs is invalid
    }

    try {
        const entry = b4a.alloc(1 + node.wk.length);
        entry[0] = nodeRole;
        b4a.copy(node.wk, entry, 1);
        return entry;
    }
    catch (error) {
        console.error('Error encoding node entry:', error);
        return b4a.alloc(0); // Return an empty buffer on error
    }
}

/**
 * Decodes a node entry buffer into an object with its writing key and role flags.
 *
 * The node entry buffer format is:
 *   [NODE_ROLE_MASK(1)][WRITING_KEY(32)]
 *   - The first byte is a bitmask indicating the node's roles (whitelisted, writer, indexer).
 *   - The remaining bytes are the node's writing key.
 *
 * @param {Buffer} nodeEntry - The encoded node entry buffer.
 * @returns {Object|null} An object with:
 *   - wk: Buffer containing the writing key.
 *   - isWhitelisted: Boolean indicating if the node is whitelisted.
 *   - isWriter: Boolean indicating if the node is a writer.
 *   - isIndexer: Boolean indicating if the node is an indexer.
 *   Returns null if the buffer is invalid or an error occurs.
 */
export function decodeNodeEntry(nodeEntry) {
    if (!isBufferValid(nodeEntry, NODE_ENTRY_SIZE)) {
        return null;
    }

    try {
        const role = nodeEntry[0];

        const isWhitelisted = !!(role & WHITELISTED_MASK);
        const isWriter = !!(role & WRITER_MASK);
        const isIndexer = !!(role & INDEXER_MASK);

        const wk = nodeEntry.subarray(1);
        return { wk, isWhitelisted, isWriter, isIndexer };
    }
    catch (error) {
        console.error('Error decoding node entry:', error);
        return null; // Return null on error
    }
}

//FUNCTIONS BELOW ARE USED IN APPLY. CONSIDER IF WE DON'T NEED THEM IN UNDER APPLAY SECTION IN STATE.JS
export function isWhitelisted(nodeEntry) {
    if (!isBufferValid(nodeEntry, NODE_ENTRY_SIZE)) {
        return false;
    }
    return !!(nodeEntry[0] & WHITELISTED_MASK);
}

export function isWriter(nodeEntry) {
    if (!isWhitelisted(nodeEntry)) {
        return false;
    }
    return !!(nodeEntry[0] & WRITER_MASK);
}

export function isIndexer(nodeEntry) {
    if (!isWriter(nodeEntry)) {
        return false;
    }
    return !!(nodeEntry[0] & INDEXER_MASK);
}


/**
 * Updates the role flags (writer/indexer) of an existing node entry buffer in-place.
 * Does not decode or reallocate memory; only updates the first byte (role mask).
 * If the buffer is not the expected size, the function does nothing.
 *
 * @param {Buffer} nodeEntry - The encoded node entry buffer to update.
 * @param {boolean} isWhitelisted - Whether the node should be marked as whitelisted.
 * @param {boolean} isWriter - Whether the node should be marked as a writer.
 * @param {boolean} isIndexer - Whether the node should be marked as an indexer.
 * @returns {Buffer | null} The updated node entry buffer or null if the input is invalid.
 */
export function setNodeEntryRole(nodeEntry, nodeRole) {
    if (!isNodeRoleValid(nodeRole)) return null;
    if (isBufferValid(nodeEntry, NODE_ENTRY_SIZE)) {
        nodeEntry[0] = nodeRole;
    }
    return nodeEntry;
}

export function setWritingKey(nodeEntry, writingKey) {
    try {

        if (!isBufferValid(nodeEntry, NODE_ENTRY_SIZE) || !isBufferValid(writingKey, WRITING_KEY_SIZE)) {
            console.error('Invalid input for setting writing key');
            return null;
        }

        b4a.copy(writingKey, nodeEntry, 1);
        return nodeEntry;
    } catch (error) {
        console.error('Error setting writing key in node entry:', error);
        return null;
    }
}

export function setNodeEntry(nodeEntry, nodeRole, writingKey) {
    try {
        if (!isNodeRoleValid(nodeRole) || !isBufferValid(writingKey, WRITING_KEY_SIZE)) {
            console.error('Invalid input for setting node entry');
            return null;
        }

        if (!isBufferValid(nodeEntry, NODE_ENTRY_SIZE)) {
            console.error('Invalid node entry buffer size');
            return null;
        }

        nodeEntry[0] = nodeRole;

        b4a.copy(writingKey, nodeEntry, 1);

        return nodeEntry;

    } catch (error) {
        console.error('Error setting node entry role and writing key:', error);
        return null;
    }
}

// ------------ INDEXER MANAGEMENT ------------ //

/**
 * Appends an indexer address to the indexers entry buffer.
 * The buffer format is: [count(1)][indexerAddr1][indexerAddr2]...[indexerAddrN]
 * If indexersEntry is null or invalid, a new buffer is created.
 * If indexerAddr is invalid, the original entry is returned unchanged.
 *
 * @param {Buffer} indexerAddr - The indexer address to append (must be TRAC_ADDRESS_SIZE bytes).
 * @param {Buffer|null} indexersEntry - The current indexers entry buffer, or null to create a new one.
 * @returns {Buffer} The updated indexers entry buffer or an empty buffer in case something goes wrong.
 */
export function appendIndexer(indexerAddr, indexersEntry = null) {
    if (!isBufferValid(indexerAddr, TRAC_ADDRESS_SIZE)) {
        return b4a.alloc(0); // If the indexer address is invalid, do nothing
    }
    // Append the indexer address to the database
    try {
        // Indexers entry will have the following format:
        // [count(1)][indexerAddr1(TRAC_ADDRESS_SIZE)][indexerAddr2(TRAC_ADDRESS_SIZE)]...[indexerAddrN(TRAC_ADDRESS_SIZE)]
        // where count is the number of indexers
        let newIndexersEntry;
        if (!b4a.isBuffer(indexersEntry) || indexersEntry.length < TRAC_ADDRESS_SIZE + 1) {
            newIndexersEntry = b4a.concat([b4a.from([1]), indexerAddr]);
        }
        else {
            newIndexersEntry = b4a.concat([indexersEntry, indexerAddr]);
            newIndexersEntry[0]++;
        }
        return newIndexersEntry;
    }
    catch (error) {
        console.error("Error appending indexer:", error);
        return b4a.alloc(0); // If some error occurs, do nothing
    }
}

/**
 * Finds the index of a given indexer address within the indexers entry buffer.
 * The buffer format is: [count(1)][indexerAddr1][indexerAddr2]...[indexerAddrN]
 * Returns the zero-based index of the address if found, or -1 if not found.
 *
 * @param {Buffer} indexersEntry - The current indexers entry buffer.
 * @param {Buffer} indexerAddr - The indexer address to search for (must be TRAC_ADDRESS_SIZE bytes).
 * @returns {number} The index of the address if found, or -1 if not found.
 */
export function getIndexerIndex(indexersEntry, indexerAddr) {
    if (
        !b4a.isBuffer(indexersEntry) ||
        !isBufferValid(indexerAddr, TRAC_ADDRESS_SIZE) ||
        indexersEntry.length < TRAC_ADDRESS_SIZE + 1 // it should ensure minimal length of the indexersEntry
    ) {
        return -1;
    }
    // step through the indexersEntry until we find indexerAddr
    for (let i = 0; i < indexersEntry[0]; i++) {
        if (b4a.equals(indexersEntry.subarray(1 + i * TRAC_ADDRESS_SIZE, 1 + (i + 1) * TRAC_ADDRESS_SIZE), indexerAddr)) {
            return i;
        }
    }
    return -1; // Not found
}

/**
 * Removes an indexer address from the indexers entry buffer.
 * The buffer format is: [count(1)][indexerAddr1][indexerAddr2]...[indexerAddrN]
 * If the indexer address is not found or input is invalid, returns an empty buffer.
 *
 * @param {Buffer} indexerAddr - The indexer address to remove (must be TRAC_ADDRESS_SIZE bytes).
 * @param {Buffer} indexersEntry - The current indexers entry buffer.
 * @returns {Buffer} The updated indexers entry buffer with the address removed,
 *                   or an empty buffer if the address is not found or input is invalid.
 */
export function removeIndexer(indexerAddr, indexersEntry) {
    if (!b4a.isBuffer(indexersEntry) ||
        indexersEntry.length < TRAC_ADDRESS_SIZE + 1 ||
        !isBufferValid(indexerAddr, TRAC_ADDRESS_SIZE)) {
        return b4a.alloc(0); // If the indexer address is invalid, do nothing
    }

    try {
        // Indexers entry will have the following format:
        // [count(1)][indexerAddr1(33)][indexerAddr2(33)]...[indexerAddrN(33)]
        // where count is the number of indexers
        const index = getIndexerIndex(indexersEntry, indexerAddr);
        if (index === -1) {
            return b4a.alloc(0); // If the indexer is not found, do nothing
        }
        // Remove the indexer address from the entry
        const newIndexersEntry = b4a.concat([
            indexersEntry.subarray(0, 1 + index * TRAC_ADDRESS_SIZE),
            indexersEntry.subarray(1 + (index + 1) * TRAC_ADDRESS_SIZE)
        ]);

        newIndexersEntry[0]--; // Decrease the count of indexers
        return newIndexersEntry;
    }
    catch (error) {
        console.error("Error removing indexer:", error);
        return b4a.alloc(0); // If some error occurs, do nothing
    }
}


// ------------ LENGTH MANAGEMENT ------------ //

/**
 * Initializes a length entry buffer with a default value of 0.
 * The buffer is 4 bytes long and uses little-endian encoding.
 *
 * @returns {Buffer} A buffer initialized to 0.
 */
export function setUpLengthEntry() {
    const buf = b4a.alloc(4, 0x00); // rid off magic numbers
    return buf;
}

/**
 * Decodes a length entry buffer into an integer.
 * Assumes the buffer is 4 bytes long and uses little-endian encoding.
 *
 * @param {Buffer} bufferData - The buffer containing the length entry.
 * @returns {number} The decoded integer value.
 */
export function decodeLengthEntry(bufferData) {
    return bufferData.readUInt32LE();
}

/**
 * Encodes an integer length into a 4-byte buffer.
 * Uses little-endian encoding.
 *
 * @param {number} length - The integer length to encode.
 * @returns {Buffer} A buffer containing the encoded length.
 */
export function encodeLengthEntry(length) {
    const buf = b4a.alloc(4);
    buf.writeUInt32LE(length); // little endian or big endian? For example for cryptographic purposes we should use little endian to avoid dobule conversions - we forget about it.
    return buf;
}

/**
 * Increments a given length by 1 and encodes it into a buffer.
 * Uses little-endian encoding.
 *
 * @param {number} length - The current length to increment.
 * @returns {Buffer} A buffer containing the incremented length.
 */
export function incrementLengthEntry(length) {
    const nextValue = length + 1;
    return encodeLengthEntry(nextValue);
}

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
        return await createHash('sha256', await createHash('sha256', tx));
    } catch (error) {
        return b4a.alloc(0);
    }
}

export default {
    NodeRole,
    ZERO_WK,
    TRAC_ADDRESS_SIZE,
    TRANSACTION_TOTAL_SIZE,
    addressToBuffer,
    bufferToAddress,
    encodeAdminEntry,
    decodeAdminEntry,
    encodeNodeEntry,
    decodeNodeEntry,
    initNodeEntry,
    isWhitelisted,
    isWriter,
    isIndexer,
    setNodeEntryRole,
    setWritingKey,
    setNodeEntry,
    appendIndexer,
    getIndexerIndex,
    removeIndexer,
    setUpLengthEntry,
    decodeLengthEntry,
    encodeLengthEntry,
    incrementLengthEntry,
    generateTxBuffer
}