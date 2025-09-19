import b4a from 'b4a';
import { TRAC_ADDRESS_SIZE } from '../../../utils/constants.js';
import { isBufferValid } from '../../../utils/buffer.js';

/**
 * Appends an indexer address to the indexers entry buffer.
 * The buffer format is: [count(1)][indexerAddr1][indexerAddr2]...[indexerAddrN]
 * Where count is the number of indexers.
 * If indexersEntry is null or invalid, a new buffer is created.
 * If indexerAddr is invalid, the original entry is returned unchanged.
 *
 * @param {Buffer} indexerAddr - The indexer address to append (must be TRAC_ADDRESS_SIZE bytes).
 * @param {Buffer|null} indexersEntry - The current indexers entry buffer, or null to create a new one.
 * @returns {Buffer} The updated indexers entry buffer or an empty buffer in case something goes wrong.
 */
export function append(indexerAddr, indexersEntry = null) {
    if (!isBufferValid(indexerAddr, TRAC_ADDRESS_SIZE)) {
        return b4a.alloc(0);
    }
    // Append the indexer address to the IndexersEntry buffer
    try {
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
export function getIndex(indexersEntry, indexerAddr) {
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
export function remove(indexerAddr, indexersEntry) {
    if (!b4a.isBuffer(indexersEntry) ||
        indexersEntry.length < TRAC_ADDRESS_SIZE + 1 ||
        !isBufferValid(indexerAddr, TRAC_ADDRESS_SIZE)) {
        return b4a.alloc(0); // If the indexer address is invalid, do nothing
    }

    try {
        const index = getIndex(indexersEntry, indexerAddr);
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

export default {
    append,
    getIndex,
    remove
};
