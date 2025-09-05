import b4a from 'b4a';

import { WRITER_MASK, INDEXER_MASK, WHITELISTED_MASK, calculateNodeRole, isNodeRoleValid } from './roles.js';
import { WRITER_BYTE_LENGTH, BALANCE_BYTE_LENGTH } from '../../../utils/constants.js';
import { isBufferValid } from '../../../utils/buffer.js';
import { Balance } from './balance.js';
import { Balance } from './balance.js';

export const NODE_ENTRY_SIZE = WRITER_BYTE_LENGTH + BALANCE_BYTE_LENGTH + 1;
export const ZERO_BALANCE = b4a.alloc(BALANCE_BYTE_LENGTH);

/**
 * Initializes a new node entry with given writing key and role and the balance is set to zero.
 * Creates a buffer in format: [NODE_ROLE_MASK(1)][WRITING_KEY(32)]
 *
 * @param {Buffer} writingKey - The writing key for the node (must be 32 bytes)
 * @param {number} role - Initial role from NodeRole enum 
 * * @param {Buffer} balance - Initial balance from node (must be 16 bytes)
 * @returns {Buffer} The initialized node entry buffer, or empty buffer if invalid input
 */
export function init(writingKey, role, balance = ZERO_BALANCE) {
    if (!isBufferValid(writingKey, WRITER_BYTE_LENGTH) || !isBufferValid(balance, BALANCE_BYTE_LENGTH) || !isNodeRoleValid(role)) {
        console.error('Invalid input for node initialization');
        return b4a.alloc(0);
    }

    try {
        const nodeEntry = b4a.alloc(NODE_ENTRY_SIZE);
        nodeEntry[0] = role;
        b4a.copy(writingKey, nodeEntry, 1);
        b4a.copy(balance, nodeEntry, WRITER_BYTE_LENGTH + 1);
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
 *   [NODE_ROLE_MASK(1)][WRITING_KEY(32)][BALANCE(16)]
 *   - The first byte is a bitmask representing the node's roles (whitelisted, writer, indexer).
 *   - 32 bytes are the node's writing key.
 *   - 16 bytes are the node's balance.
 *
 * @param {Object} node - An object representing the node, with properties:
 *   - wk: Buffer containing the node's writing key (must be 32 bytes).
 *   - isWhitelisted: Boolean indicating if the node is whitelisted.
 *   - isWriter: Boolean indicating if the node is a writer.
 *   - isIndexer: Boolean indicating if the node is an indexer.
 *   - balance: Buffer indicating the node balance.
 * @returns {Buffer} The encoded node entry buffer, or an empty buffer if input is invalid.
 */
export function encode(node) {
    const nodeRole = calculateNodeRole(node);
    if (!isBufferValid(node.wk, WRITER_BYTE_LENGTH) || !isBufferValid(node.balance, BALANCE_BYTE_LENGTH) || !isNodeRoleValid(nodeRole)) {
        return b4a.alloc(0); // Return an empty buffer if one of the inputs is invalid
    }

    try {
        let entry = b4a.alloc(NODE_ENTRY_SIZE);
        entry[0] = nodeRole;
        b4a.copy(node.wk, entry, 1);
        b4a.copy(node.balance, entry, WRITER_BYTE_LENGTH + 1);
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
 *   - balance: Buffer representing the balance in its atomic unit.
 *   Returns null if the buffer is invalid or an error occurs.
 */
export function decode(nodeEntry) {
    if (!isBufferValid(nodeEntry, NODE_ENTRY_SIZE)) {
        return null;
    }

    try {
        const role = nodeEntry[0];

        const isWhitelisted = !!(role & WHITELISTED_MASK);
        const isWriter = !!(role & WRITER_MASK);
        const isIndexer = !!(role & INDEXER_MASK);

        const wk = nodeEntry.subarray(1, WRITER_BYTE_LENGTH + 1);
        const balance = nodeEntry.subarray(WRITER_BYTE_LENGTH + 1, NODE_ENTRY_SIZE);

        return { wk, isWhitelisted, isWriter, isIndexer, balance };
    }
    catch (error) {
        console.error('Error decoding node entry:', error);
        return null; // Return null on error
    }
}

/**
 * Checks if a node entry is whitelisted.
 * @param {Buffer} nodeEntry - The node entry buffer.
 * @returns {boolean} True if whitelisted, false otherwise.
 */
export function isWhitelisted(nodeEntry) {
    if (!isBufferValid(nodeEntry, NODE_ENTRY_SIZE)) {
        return false;
    }
    return !!(nodeEntry[0] & WHITELISTED_MASK);
}

/**
 * Checks if a node entry is a writer.
 * @param {Buffer} nodeEntry - The node entry buffer.
 * @returns {boolean} True if writer, false otherwise.
 */
export function isWriter(nodeEntry) {
    if (!isWhitelisted(nodeEntry)) {
        return false;
    }
    return !!(nodeEntry[0] & WRITER_MASK);
}

/**
 * Checks if a node entry is an indexer.
 * @param {Buffer} nodeEntry - The node entry buffer.
 * @returns {boolean} True if indexer, false otherwise.
 */
export function isIndexer(nodeEntry) {
    if (!isWriter(nodeEntry)) {
        return false;
    }
    return !!(nodeEntry[0] & INDEXER_MASK);
}

export function toBalance(balance) {
    try{
        return new Balance(balance)
    } catch {
        return null
    }
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
export function setRole(nodeEntry, nodeRole) {
    if (!isNodeRoleValid(nodeRole)) return null;
    if (isBufferValid(nodeEntry, NODE_ENTRY_SIZE)) {
        nodeEntry[0] = nodeRole;
    }
    return nodeEntry;
}

/**
 * Sets the writing key in a node entry buffer.
 * @param {Buffer} nodeEntry - The node entry buffer.
 * @param {Buffer} writingKey - The writing key buffer to set.
 * @returns {Buffer|null} The updated node entry buffer, or null if invalid.
 */
export function setWritingKey(nodeEntry, writingKey) {
    try {
        if (!isBufferValid(nodeEntry, NODE_ENTRY_SIZE) || !isBufferValid(writingKey, WRITER_BYTE_LENGTH)) {
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

/**
 * Sets the balance.
 * @param {Buffer} nodeEntry - The node entry buffer.
 * @param {Buffer} balance - The buffer representation of the balance
 * @returns {Buffer|null} The updated node entry buffer, or null if invalid.
 */
export function setBalance(nodeEntry, balance) {
    try {
        if (!isBufferValid(nodeEntry, NODE_ENTRY_SIZE) || !isBufferValid(balance, BALANCE_BYTE_LENGTH)) {
            console.error('Invalid input for setting balance');
            return null;
        }

        b4a.copy(balance, nodeEntry, WRITER_BYTE_LENGTH + 1);
        return nodeEntry;
    } catch (error) {
        console.error('Error setting balance in node entry:', error);
        return null;
    }
}

/**
 * Sets both the role and writing key in a node entry buffer.
 * @param {Buffer} nodeEntry - The node entry buffer.
 * @param {number} nodeRole - The new node role byte.
 * @param {Buffer} writingKey - The writing key buffer to set.
 * @returns {Buffer|null} The updated node entry buffer, or null if invalid.
 */
export function setRoleAndWriterKey(nodeEntry, nodeRole, writingKey) {
    try {
        if (!isNodeRoleValid(nodeRole) || !isBufferValid(writingKey, WRITER_BYTE_LENGTH)) {
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

export default {
    NODE_ENTRY_SIZE,
    init,
    encode,
    decode,
    setBalance,
    setRole,
    setWritingKey,
    setRoleAndWriterKey,
    isWhitelisted,
    isWriter,
    isIndexer
};