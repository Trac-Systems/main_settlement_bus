import b4a from 'b4a';

/**
 * Initializes a length entry buffer with a default value of 0.
 * The buffer is 4 bytes long and uses little-endian encoding.
 *
 * @returns {Buffer} A buffer initialized to 0.
 */
export function init() {
    return b4a.alloc(4, 0x00);
}

/**
 * Decodes a length entry buffer into an integer.
 * Assumes the buffer is 4 bytes long and uses little-endian encoding.
 *
 * @param {Buffer} bufferData - The buffer containing the length entry.
 * @returns {number} The decoded integer value.
 */
export function decode(bufferData) {
    return bufferData.readUInt32LE();
}

/**
 * Encodes an integer length into a 4-byte buffer.
 * Uses little-endian encoding.
 *
 * @param {number} length - The integer length to encode.
 * @returns {Buffer} A buffer containing the encoded length.
 */
export function encode(length) {
    const buf = b4a.alloc(4);
    buf.writeUInt32LE(length);
    return buf;
}

/**
 * Increments a given length by 1 and encodes it into a buffer.
 * Uses little-endian encoding.
 *
 * @param {number} length - The current length to increment.
 * @returns {Buffer} A buffer containing the incremented length.
 */
export function increment(length) {
    return encode(length + 1);
}

export default {
    init,
    decode,
    encode,
    increment
};
