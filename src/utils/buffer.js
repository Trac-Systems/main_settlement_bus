import b4a from 'b4a';
import { bigIntTo16ByteBuffer } from './amountSerialization.js';

export const ZERO_WK = b4a.alloc(32, 0); // 32 bytes of zeroes, used as a placeholder for writing keys
export const NULL_BUFFER = b4a.alloc(0) // null buffer (single byte of 0)

const isUInt32 = (n) => { return Number.isInteger(n) && n >= 1 && n <= 0xFFFFFFFF; }
const MAX_UINT64 = 0xFFFFFFFFFFFFFFFFn;

export function isBufferValid(key, size) {
    return b4a.isBuffer(key) && key.length === size;
}

export const bigIntToBuffer = bigIntTo16ByteBuffer

export function deepCopyBuffer(buffer) {
    if (!buffer) return null;
    const copy = b4a.alloc(buffer.length);
    buffer.copy(copy);
    return copy;
}

export function timestampToBuffer(timestamp) {
    return uint64ToBuffer(timestamp);
}

export function idToBuffer(id) {
    if (typeof id !== 'string') {
        throw new Error('id must be a string');
    }
    return b4a.from(id, 'utf8');
}


export function encodeCapabilities(capabilities) {
    if (!Array.isArray(capabilities)) {
        throw new Error('Capabilities must be an array');
    }
    const validCapabilities = capabilities.map((capability) => {
        if (typeof capability !== 'string') {
            throw new Error('Capabilities array must contain only strings');
        }
        return capability;
    });

    const parts = [];
    for (const capability of validCapabilities.slice().sort()) {
        const capabilityBuffer = b4a.from(capability, 'utf8');
        const bufferLen = b4a.allocUnsafe(2);
        bufferLen.writeUInt16BE(capabilityBuffer.length, 0);
        parts.push(bufferLen, capabilityBuffer);
    }

    return parts.length ? b4a.concat(parts) : NULL_BUFFER;
}

export function toHex(publicKey) {
    return b4a.isBuffer(publicKey) ? b4a.toString(publicKey, 'hex') : publicKey;
}

export function uint8ToBuffer(value, offset = 0) {
    if (!Number.isInteger(value) || value < 0 || value > 0xFF) {
        throw new Error(`Value must be an unsigned 8-bit integer.`);
    }

    const buf = b4a.alloc(1);
    buf.writeUInt8(value, offset);
    return buf;
}

export const safeUint8ToBuffer = (value, offset = 0) => {
    try {
        return uint8ToBuffer(value, offset);
    } catch {
        return NULL_BUFFER;
    }
}

export const safeReadUint8 = (buffer, offset = 0) => {
    try {
        if (!b4a.isBuffer(buffer) || buffer.length < offset + 1) {
            return null;
        }
        return buffer.readUInt8(offset);
    } catch {
        return null;
    }
}

export function uint16ToBuffer(value, offset = 0) {
    if (!Number.isInteger(value) || value < 0 || value > 0xFFFF) {
        throw new Error(`Value must be an unsigned 16-bit integer.`);
    }

    const buf = b4a.alloc(2);
    buf.writeUInt16BE(value, offset);
    return buf;
}

export const safeUint16ToBuffer = (value, offset = 0) => {
    try {
        return uint16ToBuffer(value, offset);
    }
    catch {
        return NULL_BUFFER;
    }
}

export const safeReadUint16BE = (buffer, offset = 0) => {
    try {
        if (!b4a.isBuffer(buffer) || buffer.length < offset + 2) {
            return null;
        }
        return buffer.readUInt16BE(offset)
    }
    catch {
        return null;
    }
}

export function uint32ToBuffer(value, offset = 0) {
    if (!Number.isInteger(value) || value < 0 || value > 0xFFFFFFFF) {
        throw new Error(`Value must be an unsigned 32-bit integer.`);
    }

    const buf = b4a.alloc(4);
    buf.writeUInt32BE(value, offset);
    return buf;
}

export const safeWriteUInt32BE = (value, offset = 0) => {
    try {
        return uint32ToBuffer(value, offset);
    } catch {
        return NULL_BUFFER;
    }
}

export const safeReadUint32BE = (buffer, offset = 0) => {
    try {
        if (!b4a.isBuffer(buffer) || buffer.length < offset + 4) {
            return null;
        }
        return buffer.readUInt32BE(offset)
    }
    catch {
        return null;
    }
}

/**
 * Use BigInt because uint64 values can be larger than Number.MAX_SAFE_INTEGER.
 */
// ATTENTION: It was decided to not use BigInt inside the apply function, so we can have more
// control over the calculations. This function should not be used inside apply(). Use buffer
// arithmetic (further down this file) instead.
export function uint64ToBuffer(value) {
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new Error(`Value must be a non-negative safe integer`);
        }
    } else if (typeof value !== 'bigint') {
        throw new Error(`Value must be a number or bigint`);
    }

    const uint64Value = typeof value === 'bigint' ? value : BigInt(value);

    if (uint64Value < 0n) {
        throw new Error(`Value must be a non-negative integer`);
    }
    if (uint64Value > MAX_UINT64) {
        throw new Error(`Value must be an unsigned 64-bit integer`);
    }

    const buf = b4a.alloc(8);
    buf.writeBigUInt64BE(uint64Value);
    return buf;
}


export const createMessage = (...args) => {

    if (args.length === 0) return NULL_BUFFER;

    const buffers = args.map(arg => {
        if (b4a.isBuffer(arg)) {
            return arg;
        } else if (typeof arg === 'number' && isUInt32(arg)) {
            return safeWriteUInt32BE(arg);
        }
    }).filter(buf => b4a.isBuffer(buf));

    if (buffers.length === 0) return NULL_BUFFER;
    return b4a.concat(buffers);
}

export function isZeroBuffer(buffer) {
    if (!b4a.isBuffer(buffer)) {
        return false;
    }
    return buffer.every(byte => byte === 0);
}

// Buffer Arithmetic

/**
 * Increments a fixed-width big-endian unsigned integer buffer by one.
 * The input must contain between 1 and 16 bytes and is not mutated.
 * When enforceLength is provided, the input must contain exactly that
 * number of bytes. Returns null for invalid input, a length mismatch,
 * or an increment that would overflow the buffer's fixed width.
 *
 * @param {Buffer} buffer - The unsigned integer to increment.
 * @param {number|null} [enforceLength=null] - Required input length in bytes.
 * @returns {Buffer|null} A new incremented buffer, or null on failure.
 */
export function incrementBuffer(buffer, enforceLength = null) {
    if (!b4a.isBuffer(buffer) ||
        (enforceLength !== null && buffer.length !== enforceLength) ||
        buffer.length === 0 ||
        buffer.length > 16) {
        return null;
    }

    const result = b4a.from(buffer);
    for (let i = result.length - 1; i >= 0; i--) {
        if (result[i] === 0xFF) {
            result[i] = 0;
            continue;
        }

        result[i]++;
        return result;
    }

    return null;
}

/**
 * Converts a big-endian unsigned integer buffer to a numeric string.
 * The input must contain between 1 and 16 bytes.
 *
 * @param {Buffer} buffer - The unsigned integer to convert.
 * @param {'decimal'|'hex'} [encoding='decimal'] - Output encoding.
 * @returns {string|null} The normalized numeric string, or null for invalid input.
 */
export function toUIntString(buffer, encoding = 'decimal') {
    if (!b4a.isBuffer(buffer) || buffer.length === 0 || buffer.length > 16) {
        return null;
    }

    switch (encoding) {
        case 'hex':
            return buffer.toString('hex').replace(/^0+/, '') || '0';
        case 'decimal': {
            const digits = [0];
            for (const byte of buffer) {
                let carry = byte;

                for (let i = 0; i < digits.length; i++) {
                    const value = digits[i] * 256 + carry;
                    digits[i] = value % 10;
                    carry = Math.floor(value / 10);
                }

                while (carry > 0) {
                    digits.push(carry % 10);
                    carry = Math.floor(carry / 10);
                }
            }

            return digits.reverse().join('');
        }
        default:
            return null;
    }
}
