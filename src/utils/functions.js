import b4a from 'b4a';
import sodium from 'sodium-native';
import applyOperations from '../utils/protobuf/applyOperations.cjs';

export async function verifyDag(base, swarm, wallet, writerKey) {
    try {
        console.log('--- Stats ---');
        const dagView = await base.view.core.treeHash();
        const lengthdagView = base.view.core.length;
        const dagSystem = await base.system.core.treeHash();
        const lengthdagSystem = base.system.core.length;
        console.log(`isIndexer: ${base.isIndexer}`);
        console.log(`isWriter: ${base.writable}`);
        console.log('wallet.publicKey:', wallet !== null ? wallet.publicKey : 'unset');
        console.log('msb.writerKey:', writerKey);
        console.log('swarm.connections.size:', swarm.connections.size);
        console.log('base.view.core.signedLength:', base.view.core.signedLength);
        console.log('base.view.core.length:', base.view.core.length);
        console.log("base.signedLength", base.signedLength);
        console.log("base.indexedLength", base.indexedLength);
        console.log("base.linearizer.indexers.length", base.linearizer.indexers.length);
        console.log(`base.key: ${base.key.toString('hex')}`);
        console.log('discoveryKey:', b4a.toString(base.discoveryKey, 'hex'));
        console.log(`VIEW Dag: ${dagView.toString('hex')} (length: ${lengthdagView})`);
        console.log(`SYSTEM Dag: ${dagSystem.toString('hex')} (length: ${lengthdagSystem})`);
        const wl = await base.view.get('wrl');
        console.log('Total Registered Writers:', wl !== null ? wl.value : 0);

    } catch (error) {
        console.error('Error during DAG monitoring:', error.message);
    }
}

export function printHelp() {
    console.log('Available commands:');
    console.log('- /add_writer: add yourself as validator to this MSB once whitelisted.');
    console.log('- /remove_writer: remove yourself from this MSB.');
    console.log('- /add_admin: register admin entry with bootstrap key. (initial setup)');
    console.log('- /add_whitelist: add all specified whitelist addresses. (admin only)');
    console.log('- /add_indexer <address>: change a role of the selected writer node to indexer role. (admin only)');
    console.log('- /remove_indexer <address>: change a role of the selected indexer node to default role. (admin only)');
    console.log('- /ban_writer <address>: demote a whitelisted writer to default role and remove it from the whitelist. (admin only)');
    console.log('- /get_node_info <address>: get information about a node with the given address.');
    console.log('- /stats: check system stats such as writing key, DAG, etc.');
    console.log('- /exit: Exit the program.');
    console.log('- /help: display this help.');
}

export const printWalletInfo = (tracPublicKey, writingKey) => {
    console.log('');
    console.log('#####################################################################################');
    console.log('# MSB Address:    ', tracPublicKey, '#');
    console.log('# MSB Writer:     ', writingKey, '#');
    console.log('#####################################################################################');
}

/**
 * Checks whether a given value is a valid hexadecimal string.
 *
 * A valid hex string must:
 * - Be of type string
 * - Have at least 2 characters
 * - Contain only hexadecimal characters (0-9, a-f, A-F)
 * - Have an even length (since hex bytes are two characters long)
 *
 * @param {*} string - The value to check.
 * @returns {boolean} - True if the input is a valid hex string, false otherwise.
 */
export function isHexString(string) {
    return typeof string === 'string' && string.length > 1 && /^[0-9a-fA-F]+$/.test(string) && string.length % 2 === 0;
}

export async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function createHash(type, message) {
    if (type === 'sha256') {
        const out = b4a.alloc(sodium.crypto_hash_sha256_BYTES);
        sodium.crypto_hash_sha256(out, !b4a.isBuffer(message) ? b4a.from(message) : message);
        return out;
    }
    if (global.Pear !== undefined) {
        let _type = '';
        switch (type.toLowerCase()) {
            case 'sha1': _type = 'SHA-1'; break;
            case 'sha384': _type = 'SHA-384'; break;
            case 'sha512': _type = 'SHA-512'; break;
            default: throw new Error('Unsupported algorithm.');
        }
        const encoder = new TextEncoder();
        const data = encoder.encode(b4a.isBuffer(message) ? b4a.toString(message, 'utf-8') : message);
        // TODO: This will only work in Nodejs, because crypto is not defined in Bare environment. Fix this in future releases 
        const hash = await crypto.subtle.digest(_type, data);
        const hashArray = Array.from(new Uint8Array(hash));
        return hashArray
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    } else {
        // this is only available here for completeness and in fact will never be used in the MSB.
        // just keep it as it is.
        return crypto.createHash(type).update(!b4a.isBuffer(message) ? b4a.from(message) : message).digest('hex')
    }
}

export async function generateTx(bootstrap, msb_bootstrap, validator_writer_key, local_writer_key, local_public_key, content_hash, nonce) {
    let tx = bootstrap + '-' +
        msb_bootstrap + '-' +
        validator_writer_key + '-' +
        local_writer_key + '-' +
        local_public_key + '-' +
        content_hash + '-' +
        nonce;
    return await createHash('sha256', await createHash('sha256', tx));
}


export const createMessage = (...args) => {
    const isUInt32 = (n) => { return Number.isInteger(n) && n >= 1 && n <= 0xFFFFFFFF; }

    if (args.length === 0) return b4a.alloc(0);

    const buffers = args.map(arg => {
        if (b4a.isBuffer(arg)) {
            return arg;
        } else if (typeof arg === 'number' && isUInt32(arg)) {
            const buf = b4a.alloc(4);
            buf.writeUInt32BE(arg, 0);
            return buf;
        }
    });

    return b4a.concat(buffers);
}

/**
 * Safely encodes an operation using `applyOperations.Operation.encode`.
 * If the encoding fails (e.g., due to an invalid payload), returns an empty Buffer.
 *
 * @param {*} payload - Any input that should conform to the `applyOperation` schema.
 * @returns {Buffer} - Encoded Buffer if successful, otherwise an empty Buffer (`b4a.alloc(0)`).
 */
export const safeEncodeAppyOperation = (payload) => {
    try {
        const result = applyOperations.Operation.encode(payload);
        if (b4a.isBuffer(result)) return result
    } catch (error) {
        console.log("safeEncodeAppyOperation error:", error.message);
    }
    return b4a.alloc(0);
}

/**
 * Safely decodes a Buffer into an `Operation` object using `applyOperations.Operation.decode`.
 * Returns `null` if decoding fails or the input is invalid.
 *
 * @param {Buffer} payload - A buffer containing encoded data.
 * @returns {Object|null} - Decoded `applyOperation` object on success, or `null` on failure.
 */
export const safeDecodeAppyOperation = (payload) => {
    try {
        return applyOperations.Operation.decode(payload);
    } catch (error) {
        console.log(error);
    }
    return null;
}

export const safeJsonStringify = (value) => {
    try {
        return JSON.stringify(value);
    } catch (error) {
        console.error(error);
    }
    return null;
}

export const safeJsonParse = (str) => {
    try {
        return JSON.parse(str);
    } catch (error) {
        console.error(error);
    }
    return undefined;
}