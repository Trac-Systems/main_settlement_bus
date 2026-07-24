import b4a from 'b4a';
import _ from 'lodash';
import {
    VDF_DIFFICULTY_SIZE,
    VDF_DISCRIMINANT_SIZE
} from '../../../utils/constants.js';

const VDF_CONFIG_SIZE = VDF_DIFFICULTY_SIZE + VDF_DISCRIMINANT_SIZE;

/**
 * Canonically encodes a VDF configuration.
 *
 * @param {{difficulty: Buffer, discriminantBitSize: Buffer}} config - VDF configuration.
 * @returns {Buffer} The canonical encoded VDF configuration.
 * @throws {Error} When the configuration is structurally invalid.
 */
export const encodeVdfConfig = (config) => {
    if (!_.isPlainObject(config)) {
        throw new Error('VDF config must be an object.');
    }

    if (!b4a.isBuffer(config.difficulty) || config.difficulty.length !== VDF_DIFFICULTY_SIZE) {
        throw new Error(`VDF config difficulty must be a ${VDF_DIFFICULTY_SIZE}-byte buffer.`);
    }

    if (
        !b4a.isBuffer(config.discriminantBitSize) ||
        config.discriminantBitSize.length !== VDF_DISCRIMINANT_SIZE
    ) {
        throw new Error(
            `VDF config discriminant bit size must be a ${VDF_DISCRIMINANT_SIZE}-byte buffer.`
        );
    }

    return b4a.concat([config.difficulty, config.discriminantBitSize]);
}

/**
 * Decodes a canonical VDF configuration.
 *
 * @param {Buffer} encoded - Canonical encoded VDF configuration.
 * @returns {{difficulty: Buffer, discriminantBitSize: Buffer}} The decoded configuration.
 * @throws {Error} When the encoded configuration is structurally invalid.
 */
export const decodeVdfConfig = (encoded) => {
    if (!b4a.isBuffer(encoded) ||
        encoded.length !== VDF_CONFIG_SIZE) {
        throw new Error(`Encoded VDF config must be a buffer of exactly ${VDF_CONFIG_SIZE} bytes.`);
    }

    return {
        difficulty: encoded.subarray(0, VDF_DIFFICULTY_SIZE),
        discriminantBitSize: encoded.subarray(VDF_DIFFICULTY_SIZE)
    };
}

/**
 * Safely encodes a VDF configuration.
 *
 * @param {*} config - Value expected to contain a VDF configuration.
 * @returns {Buffer} The canonical encoded configuration, or an empty buffer on failure.
 */
export const safeEncodeVdfConfig = (config) => {
    try {
        return encodeVdfConfig(config);
    } catch {
        return b4a.alloc(0);
    }
}

/**
 * Safely decodes a canonical VDF configuration.
 *
 * @param {*} encoded - Value expected to contain an encoded VDF configuration.
 * @returns {{difficulty: Buffer, discriminantBitSize: Buffer}|null} The decoded configuration, or null on failure.
 */
export const safeDecodeVdfConfig = (encoded) => {
    try {
        return decodeVdfConfig(encoded);
    } catch {
        return null;
    }
}
