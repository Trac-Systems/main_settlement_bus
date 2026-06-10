import b4a from 'b4a';
import { bigIntTo16ByteBuffer } from './amountSerialization.js';

export const ZERO_WK = b4a.alloc(32, 0); // 32 bytes of zeroes, used as a placeholder for writing keys
export const NULL_BUFFER = b4a.alloc(0) // null buffer (single byte of 0)

const isUInt32 = (n) => { return Number.isInteger(n) && n >= 1 && n <= 0xFFFFFFFF; }
const MAX_UINT64 = 0xFFFFFFFFFFFFFFFFn;

export function isBufferValid(key, size) {
    return b4a.isBuffer(key) && key.length === size;
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

export const bigIntToBuffer = bigIntTo16ByteBuffer

export function deepCopyBuffer(buffer) {
    if (!buffer) return null;
    const copy = b4a.alloc(buffer.length);
    buffer.copy(copy);
    return copy;
}

export function timestampToBuffer(timestamp) {
    return uint64ToBuffer(timestamp, 'timestamp');
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

    return parts.length ? b4a.concat(parts) : b4a.alloc(0);
}

export function toHex(publicKey) {
    return b4a.isBuffer(publicKey) ? b4a.toString(publicKey, 'hex') : publicKey;
}

export function assertBuffer(value, fieldName) {
    if (!b4a.isBuffer(value)) {
        throw new Error(`${fieldName} must be a buffer.`);
    }

    return value;
}

export function uint8ToBuffer(value, fieldName) {
    if (!Number.isInteger(value) || value < 0 || value > 0xFF) {
        throw new Error(`${fieldName} must be an unsigned 8-bit integer.`);
    }

    const buf = b4a.alloc(1);
    buf.writeUInt8(value, 0);
    return buf;
}

export function uint16ToBuffer(value, fieldName) {
    if (!Number.isInteger(value) || value < 0 || value > 0xFFFF) {
        throw new Error(`${fieldName} must be an unsigned 16-bit integer.`);
    }

    const buf = b4a.alloc(2);
    buf.writeUInt16BE(value, 0);
    return buf;
}

export function uint32ToBuffer(value, fieldName) {
    if (!Number.isInteger(value) || value < 0 || value > 0xFFFFFFFF) {
        throw new Error(`${fieldName} must be an unsigned 32-bit integer.`);
    }

    const buf = b4a.alloc(4);
    buf.writeUInt32BE(value, 0);
    return buf;
}

export const safeWriteUInt32BE = (value, offset) => {
    try {
        const buf = b4a.alloc(4);
        buf.writeUInt32BE(value, offset);
        return buf;
    } catch {
        return b4a.alloc(4);
    }
}

/**
 * Use BigInt because uint64 values can be larger than Number.MAX_SAFE_INTEGER.
 */
export function uint64ToBuffer(value, fieldName) {
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new Error(`${fieldName} must be a non-negative safe integer`);
        }
    } else if (typeof value !== 'bigint') {
        throw new Error(`${fieldName} must be a number or bigint`);
    }

    const uint64Value = typeof value === 'bigint' ? value : BigInt(value);

    if (uint64Value < 0n) {
        throw new Error(`${fieldName} must be a non-negative integer`);
    }
    if (uint64Value > MAX_UINT64) {
        throw new Error(`${fieldName} must be an unsigned 64-bit integer`);
    }

    const buf = b4a.alloc(8);
    buf.writeBigUInt64BE(uint64Value);
    return buf;
}
