import {  TRAC_ADDRESS_SIZE } from 'trac-wallet/constants.js';

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

export function formatIndexersEntry(indexersEntry) {

    const count = indexersEntry[0];
    const indexers = [];

    for (let i = 0; i < count; i++) {
        const start = 1 + (i * TRAC_ADDRESS_SIZE);
        const end = start + TRAC_ADDRESS_SIZE;
        const indexerAddr = indexersEntry.subarray(start, end);
        indexers.push(indexerAddr.toString('ascii'));
    }

    return {
        count,
        addresses: indexers
    };
}
