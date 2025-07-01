import b4a from 'b4a';

// Buffer standard sizes in bytes
const WRITING_KEY_SIZE = 32;
const TRAC_PUB_KEY_SIZE = 32;
const TRAC_ADDRESS_SIZE = 1 + TRAC_PUB_KEY_SIZE; // TODO: This will change in the future
const ADMIN_ENTRY_SIZE = 1 + TRAC_ADDRESS_SIZE + WRITING_KEY_SIZE;
const NODE_ENTRY_SIZE = WRITING_KEY_SIZE + 1;

// Role masks
// TODO: Consider implementing a role mask for Admin
const WRITER_MASK = 0x1;
const INDEXER_MASK = 0x2;

// Helper functions
function isBufferValid(key, size) {
    return b4a.isBuffer(key) && key.length === size;
}


// ------------ ADMIN ENTRY ------------ //

/**
 * Encodes an admin entry as a buffer containing the TRAC address and writing key.
 *
 * ADMIN_ENTRY = [TRAC_ADDRESS_LEN(1)][TRAC_ADDRESS(XX)][WRITING_KEY(32)]
 * TRAC_ADDRESS = [TRAC_NETWORK_PREFIX(1)][TRAC_PUB_KEY(32)]
 * Note: The address length is included for future compatibility with variable-length addresses.
 *
 * @param {Buffer} tracAddr - The TRAC address buffer.
 * @param {Buffer} wKey - The admin's writing key buffer (must be 32 bytes).
 * @returns {Buffer} The encoded admin entry buffer, or an empty buffer if input is invalid.
 */
export function encodeAdminEntry(tracAddr, wKey) {
    if (!isBufferValid(tracAddr, 33) || !isBufferValid(wKey, 32)) {
        return b4a.alloc(0);
    }

    const adminEntry = b4a.alloc(1 + tracAddr.length + wKey.length);
    adminEntry[0] = tracAddr.length;
    b4a.copy(tracAddr, adminEntry, 1);
    b4a.copy(wKey, adminEntry, 1 + tracAddr.length);
    return adminEntry;
}

/**
 * Decodes an admin entry buffer into its TRAC address and writing key components.
 *
 * ADMIN_ENTRY = [TRAC_ADDRESS_LEN(1)][TRAC_ADDRESS(XX)][WRITING_KEY(32)]
 * The first byte indicates the length of the TRAC address.
 * The TRAC address and writing key are then extracted from the buffer.
 *
 * @param {Buffer} adminEntry - The encoded admin entry buffer.
 * @returns {Object} An object with:
 *   - tracAddr: Buffer containing the TRAC address.
 *   - wKey: Buffer containing the writing key.
 */
export function decodeAdminEntry(adminEntry) {
    if (!isBufferValid(adminEntry, ADMIN_ENTRY_SIZE)) {
        return null;
    }
    const tracAddrLen = adminEntry[0];
    const tracAddr = adminEntry.subarray(1, 1 + tracAddrLen);
    const wKey = adminEntry.subarray(1 + tracAddrLen);
    return { tracAddr, wKey };
}


// ------------ NODE ENTRY ------------ //

/**
 * Encodes a node entry as a buffer containing the role mask and writing key.
 * The first byte is a bitmask indicating writer and indexer roles.
 * The remaining bytes are the node's writing key.
 *
 * NODE_ENTRY = [NODE_ROLE_MASK(1)][WRITING_KEY(32)]
 * NODE_ROLE_MASK:
 *   - WRITER = 0x1 (bit 0)
 *   - INDEXER = 0x2 (bit 1)
 *
 * @param {Buffer} wKey - The node's writing key (must be 32 bytes).
 * @param {boolean} isWriter - Whether the node is a writer.
 * @param {boolean} isIndexer - Whether the node is an indexer.
 * @returns {Buffer} The encoded node entry buffer, or an empty buffer if input is invalid.
 */
export function encodeNodeEntry(wKey, isWriter, isIndexer) {
    if (!isBufferValid(wKey, 32)) {
        return b4a.alloc(0); // Return an empty buffer if keys are invalid
    }

    const entry = b4a.alloc(1 + wKey.length);
    entry[0] = (isWriter ? WRITER_MASK : 0x0) | (isIndexer ? INDEXER_MASK : 0x0);
    b4a.copy(wKey, entry, 1);
    return entry;
}

/**
 * Decodes a node entry buffer into an object with its writing key and role flags.
 * The first byte contains bit flags for writer and indexer roles.
 * The remaining bytes represent the writing key.
 *
 * @param {Buffer} nodeEntry - The encoded node entry buffer.
 * @returns {Object} An object with:
 *   - wk: Buffer containing the writing key.
 *   - isWriter: Boolean indicating if the node is a writer.
 *   - isIndexer: Boolean indicating if the node is an indexer.
 */
export function decodeNodeEntry(nodeEntry) {
    if (!isBufferValid(nodeEntry, NODE_ENTRY_SIZE)) {
        return null;
    }
    const isWriter = Boolean(nodeEntry[0] & WRITER_MASK);
    const isIndexer = Boolean(nodeEntry[0] & INDEXER_MASK);
    const wk = nodeEntry.subarray(1);
    return { wk, isWriter, isIndexer };
}

/**
 * Updates the role flags (writer/indexer) of an existing node entry buffer in-place.
 * Does not decode or reallocate memory; only updates the first byte (role mask).
 * If the buffer is not the expected size, the function does nothing.
 *
 * @param {Buffer} nodeEntry - The encoded node entry buffer to update.
 * @param {boolean} isWriter - Whether the node should be marked as a writer.
 * @param {boolean} isIndexer - Whether the node should be marked as an indexer.
 * @returns {Buffer} The updated node entry buffer (same instance as input).
 */
export function setNodeEntryRole(nodeEntry, isWriter, isIndexer) {
    if (isBufferValid(nodeEntry, NODE_ENTRY_SIZE)) {
        nodeEntry[0] = (isWriter ? WRITER_MASK : 0x0) | (isIndexer ? INDEXER_MASK : 0x0);
    }
    return nodeEntry;
}

// ------------ TRANSACTIONS ------------ //
export function encodeTransaction(tx) {
    // TODO
    // [OP(1)][TX_HASH(??)][IS(??)][W(32)][I(??)][IPK(??)][CH(??)][IN(??)][BS(32)][MBS(32)][WS(??)][WP(??)][WN(32)]
}

export function decodeTransaction(encTx) {
    // TODO
}