import b4a from 'b4a';
import { TRAC_NETWORK_PREFIX } from '../utils/constants.js';
export function isHexString(string) {
    return typeof string === 'string' && string.length > 1 && /^[0-9a-fA-F]+$/.test(string) && string.length % 2 === 0;
}

export async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

// DO NOT USE IT IN APPLY
// TODO:  write tests for this function
export const extractPublickeyFromAddress = (address) => {
    if (!b4a.isBuffer(address)) {
        throw new Error('extractPublicKeyFromAddress: expected a Buffer.');
    }

    if (address.length < 33) {
        throw new Error('extractPublicKeyFromAddress: address must be at least 33 bytes long.');
    }

    const prefix = address.readUInt8(0);
    if (prefix !== TRAC_NETWORK_PREFIX) {
        throw new Error(`extractPublicKeyFromAddress: invalid network prefix (got 0x${prefix.toString(16)}).`);
    }

    return address.slice(1, 33);
}

// DO NOT USE IT IN APPLY
// TODO:  write tests for this function
export const publicKeyToAddress = (publicKey) => {
    if (!b4a.isBuffer(address)) {
        throw new Error('publicKeyToAddress: expected a Buffer.');
    }
    if (publicKey.length !== 32) {
        throw new Error('publicKeyToAddress: publicKey must be 32 bytes long.');
    }

    const address = b4a.alloc(33);
    address.writeUInt8(TRAC_NETWORK_PREFIX, 0);
    publicKey.copy(address, 1);
    return address;
}
