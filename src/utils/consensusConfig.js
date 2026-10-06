import { decodeConsensusConfig } from '../codecs/apply/applyOperationCodec.js';
import { decodeVdfConfig, safeDecodeVdfConfig } from '../codecs/consensus/v1/vdfConfigCodec.js';
import {
    CONSENSUS_CONFIG_SCHEMA_VERSION_BYTE_LENGTH,
    ConsensusVersion,
    VDF_PROOF_BYTE_LENGTHS,
} from './constants.js';
import { isBufferValid, isZeroBuffer, safeReadUint8 } from './buffer.js';

// Off-chain helpers. Do not use these in apply or delegate to state/utils:
// changes here must not change historical state replay.

const decodeVdfV1ConfigData = (encodedConfigData) => {
    const decodedConfigData = decodeVdfConfig(encodedConfigData);

    return {
        difficulty: decodedConfigData.difficulty.readUInt32BE(0),
        discriminantBitSize: decodedConfigData.discriminantBitSize.readUInt16BE(0),
    };
};

const CONSENSUS_CONFIG_DECODERS = Object.freeze({
    [ConsensusVersion.VDF_V1]: decodeVdfV1ConfigData,
});

export const validateConsensusConfig = (consensusConfig) => {
    if (!isBufferValid(consensusConfig?.sv, CONSENSUS_CONFIG_SCHEMA_VERSION_BYTE_LENGTH)) {
        return false;
    }

    switch (safeReadUint8(consensusConfig.sv)) {
        case ConsensusVersion.VDF_V1: {
            const configData = safeDecodeVdfConfig(consensusConfig.cd);
            if (configData === null) return false;

            return !isZeroBuffer(configData.difficulty) &&
                Object.hasOwn(VDF_PROOF_BYTE_LENGTHS, configData.discriminantBitSize.readUInt16BE(0));
        }
        default:
            return false;
    }
};

/**
 * Decodes a stored consensus config for off-chain consumers.
 *
 * @param {Buffer} encodedConsensusConfig Encoded consensus config envelope.
 * @returns {{schemaVersion: number, configData: object}} Decoded domain config.
 * @throws {Error} When the envelope, version, or config data is invalid.
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
