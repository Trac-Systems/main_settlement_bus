import { decodeConsensusConfig } from '../../../codecs/apply/applyOperationCodec.js';
import { decodeVdfConfig } from '../../../codecs/consensus/v1/vdfConfigCodec.js';
import { ConsensusConfigSchemaVersion } from '../../../utils/constants.js';

const decodeVdfV1ConfigData = (encodedConfigData) => {
    const decodedConfigData = decodeVdfConfig(encodedConfigData);

    return {
        difficulty: decodedConfigData.difficulty.readUInt32BE(0),
        discriminantBitSize: decodedConfigData.discriminantBitSize.readUInt16BE(0),
    };
};

const CONSENSUS_CONFIG_DECODERS = Object.freeze({
    [ConsensusConfigSchemaVersion.VDF_V1]: decodeVdfV1ConfigData,
});

/**
 * Decodes a consensus config envelope and dispatches its opaque config data to
 * the decoder assigned to the stored schema version.
 *
 * Schema version identifiers are permanent wire-format identifiers. Existing
 * identifiers must never be reassigned to a different consensus config format.
 *
 * @param {Buffer} encodedConsensusConfig Encoded consensus config envelope.
 * @returns {{schemaVersion: number, configData: object}} Decoded domain config.
 * @throws {Error} When the envelope, schema version, or versioned config data is invalid.
 */
export const decodeVersionedConsensusConfig = (encodedConsensusConfig) => {
    const consensusConfig = decodeConsensusConfig(encodedConsensusConfig);
    const schemaVersion = consensusConfig.sv.readUInt8(0);
    const decodeConfigData = CONSENSUS_CONFIG_DECODERS[schemaVersion];

    if (typeof decodeConfigData !== 'function') {
        throw new Error(`Unsupported consensus config schema version: ${schemaVersion}.`);
    }

    return {
        schemaVersion,
        configData: decodeConfigData(consensusConfig.cd),
    };
};

/**
 * Safely decodes a versioned consensus config.
 *
 * @param {*} encodedConsensusConfig Value expected to contain an encoded config.
 * @returns {{schemaVersion: number, configData: object}|null} Decoded config or null.
 */
export const safeDecodeVersionedConsensusConfig = (encodedConsensusConfig) => {
    try {
        return decodeVersionedConsensusConfig(encodedConsensusConfig);
    } catch {
        return null;
    }
};
