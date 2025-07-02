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

    try {
        const adminEntry = b4a.alloc(1 + tracAddr.length + wKey.length);
        adminEntry[0] = tracAddr.length;
        b4a.copy(tracAddr, adminEntry, 1);
        b4a.copy(wKey, adminEntry, 1 + tracAddr.length);
        return adminEntry;
    } catch (error) {
        console.error('Error encoding admin entry:', error);
        return b4a.alloc(0);
    }
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

    try {
        const tracAddrLen = adminEntry[0];
        const tracAddr = adminEntry.subarray(1, 1 + tracAddrLen);
        const wKey = adminEntry.subarray(1 + tracAddrLen);
        return { tracAddr, wKey };
    }
    catch (error) {
        console.error('Error decoding admin entry:', error);
        return null;
    }
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

    try {
    const entry = b4a.alloc(1 + wKey.length);
    entry[0] = (isWriter ? WRITER_MASK : 0x0) | (isIndexer ? INDEXER_MASK : 0x0);
    b4a.copy(wKey, entry, 1);
    return entry;
    }
    catch (error) {
        console.error('Error encoding node entry:', error);
        return b4a.alloc(0); // Return an empty buffer on error
    }
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
    try {
        const isWriter = Boolean(nodeEntry[0] & WRITER_MASK);
        const isIndexer = Boolean(nodeEntry[0] & INDEXER_MASK);
        const wk = nodeEntry.subarray(1);
        return { wk, isWriter, isIndexer };
    }
    catch (error) {
        console.error('Error decoding node entry:', error);
        return null; // Return null on error
    }
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
        // [count(1)][indexerAddr1(33)][indexerAddr2(33)]...[indexerAddrN(33)]
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