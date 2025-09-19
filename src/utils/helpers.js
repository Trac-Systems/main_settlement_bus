import b4a from "b4a";
import {bufferToAddress} from "../core/state/utils/address.js";
import { EntryType, TRAC_ADDRESS_SIZE } from "./constants.js";

export function isHexString(string) {
    return typeof string === 'string' && string.length > 1 && /^[0-9a-fA-F]+$/.test(string) && string.length % 2 === 0;
}

export const normalizeHex = (input) => {
    if (input == null) {
        throw new Error('Input cannot be null or undefined');
    }

    if (typeof input === 'string') {
        if (!isHexString(input)) {
            throw new Error('Invalid hex string');
        }
        return b4a.from(input, 'hex');
    }

    if (b4a.isBuffer(input)) {
        return input;
    }
    throw new Error('Input must be a hex string or a Buffer');
};

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

export async function getFormattedIndexersWithAddresses(state) {
    const indexers = await state.getIndexersEntry();
    const formatted = indexers.map((entry) => ({
        writingKey: b4a.toString(entry.key, "hex"),
    }));

    const results = await Promise.all(
        formatted.map(async (entry) => {
            console.log(EntryType.WRITER_ADDRESS + entry.writingKey);
            
            const address = bufferToAddress(await state.getSigned(EntryType.WRITER_ADDRESS + entry.writingKey));

            return {
                ...entry,
                address,
            };
        })
    );

    return results;
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

export function convertAdminCoreOperationPayloadToHex(payload) {
    return {
        ...payload,
        address: bufferToAddress(payload.address),
        aco: {
            tx: payload.aco.tx.toString('hex'),
            txv: payload.aco.txv.toString('hex'),
            in: payload.aco.in.toString('hex'),
            ia: payload.aco.ia.toString('hex'),
            is: payload.aco.is.toString('hex'),
        },
    };
}
