import b4a from 'b4a';
import { bigIntTo16ByteBuffer } from './amountSerialization.js';

export const ZERO_WK = b4a.alloc(32, 0); // 32 bytes of zeroes, used as a placeholder for writing keys
export const NULL_BUFFER = b4a.alloc(0) // null buffer (single byte of 0)

const isUInt32 = (n) => { return Number.isInteger(n) && n >= 1 && n <= 0xFFFFFFFF; }

export function isBufferValid(key, size) {
    return b4a.isBuffer(key) && key.length === size;
}

export const safeWriteUInt32BE = (value, offset) => {
    try {
        const buf = b4a.alloc(4);
        buf.writeUInt32BE(value, offset);
        return buf;
    } catch (error) {
        return b4a.alloc(4);
    }
}

export const createMessage = (...args) => {

    if (args.length === 0) return b4a.alloc(0);

    const buffers = args.map(arg => {
        if (b4a.isBuffer(arg)) {
            return arg;
        } else if (typeof arg === 'number' && isUInt32(arg)) {
            return safeWriteUInt32BE(arg, 0);
        }
    }).filter(buf => b4a.isBuffer(buf));

    if (buffers.length === 0) return b4a.alloc(0);
    return b4a.concat(buffers);
}

export function normalizeBuffer(message) {
    if (b4a.isBuffer(message)) {
        return message;
    }

    if (message.type === 'Buffer' && Array.isArray(message.data)) {
        return b4a.from(message.data);
    }

    if (typeof message === 'object' && Object.keys(message).every(key => !isNaN(key))) {
        return b4a.from(Object.values(message));
    }

    return null;
}

export const bigIntToBuffer = bigIntTo16ByteBuffer

export function deepCopyBuffer(buffer) {
    if (!buffer) return null;
    const copy = b4a.alloc(buffer.length);
    buffer.copy(copy);
    return copy;
}