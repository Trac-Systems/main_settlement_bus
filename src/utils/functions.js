import b4a from 'b4a';
import sodium from 'sodium-native';
import {peer} from "hyperdht/lib/messages.js";

// TODO: (?) Should we allow 0x prefix?
// TODO: (?) Should an mepty string be considered valid?
export function isHexString(string) {
    return typeof string === 'string' && /^[0-9a-fA-F]+$/.test(string) && string.length % 2 === 0;
}

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

export async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function createHash(type, message) {
    if (type === 'sha256') {
        const out = b4a.alloc(sodium.crypto_hash_sha256_BYTES);
        sodium.crypto_hash_sha256(out,!b4a.isBuffer(message) ? b4a.from(message) : message);
        return b4a.toString(out, 'hex');
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