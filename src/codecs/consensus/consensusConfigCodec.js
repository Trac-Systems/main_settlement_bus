import b4a from 'b4a';
import _ from 'lodash';

const CONSENSUS_CONFIG_VERSION_SIZE = 1;

/**
 * Encodes a generic consensus configuration.
 *
 * @param {{version: Buffer, data: Buffer}} config - Consensus configuration.
 * @returns {Buffer} The encoded consensus configuration.
 * @throws {Error} When the configuration is structurally invalid.
 */
export const encodeConsensusConfig = (config) => {
    if (!_.isPlainObject(config)) {
        throw new Error('Consensus config must be an object.');
    }

    if (!b4a.isBuffer(config.version) || config.version.length !== CONSENSUS_CONFIG_VERSION_SIZE) {
        throw new Error('Consensus config version must be a one-byte buffer.');
    }

    if (!b4a.isBuffer(config.data)) {
        throw new Error('Consensus config data must be a buffer.');
    }

    return b4a.concat([config.version, config.data]);
}

/**
 * Decodes a generic consensus configuration.
 *
 * The data is kept opaque so callers can select a version-specific decoder.
 *
 * @param {Buffer} encoded - Encoded consensus configuration.
 * @returns {{version: Buffer, data: Buffer}} The decoded configuration.
 * @throws {Error} When the encoded configuration is structurally invalid.
 */
export const decodeConsensusConfig = (encoded) => {
    if (!b4a.isBuffer(encoded)) {
        throw new Error('Encoded consensus config must be a buffer.');
    }

    if (encoded.length < CONSENSUS_CONFIG_VERSION_SIZE) {
        throw new Error('Encoded consensus config must contain a one-byte version.');
    }

    return {
        version: encoded.subarray(0, CONSENSUS_CONFIG_VERSION_SIZE),
        data: encoded.subarray(CONSENSUS_CONFIG_VERSION_SIZE)
    };
}

/**
 * Safely encodes a generic consensus configuration.
 *
 * @param {*} config - Value expected to contain a consensus configuration.
 * @returns {Buffer} The encoded configuration, or an empty buffer on failure.
 */
export const safeEncodeConsensusConfig = (config) => {
    try {
        return encodeConsensusConfig(config);
    } catch {
        return b4a.alloc(0);
    }
}

/**
 * Safely decodes a generic consensus configuration.
 *
 * @param {*} encoded - Value expected to contain an encoded configuration.
 * @returns {{version: Buffer, data: Buffer}|null} The decoded configuration, or null on failure.
 */
export const safeDecodeConsensusConfig = (encoded) => {
    try {
        return decodeConsensusConfig(encoded);
    } catch {
        return null;
    }
}
