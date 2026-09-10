import { safeDecodeConsensusConfig } from '../../../codecs/apply/applyOperationCodec.js';
import { safeDecodeVdfConfig } from '../../../codecs/consensus/v1/vdfConfigCodec.js';
import { ConsensusConfigSchemaVersion } from '../../../utils/constants.js';

// Apply-only helpers. Keep historical decoding independent
// of the off-chain helpers in src/utils/consensusConfig.js.

const decodeVdfV1ConfigData = (encodedConfigData) => {
    const decodedConfigData = safeDecodeVdfConfig(encodedConfigData);
    if (decodedConfigData === null) return null;

    return {
        difficulty: decodedConfigData.difficulty.readUInt32BE(0),
        discriminantBitSize: decodedConfigData.discriminantBitSize.readUInt16BE(0),
    };
};

const CONSENSUS_CONFIG_DECODERS = Object.freeze({
    [ConsensusConfigSchemaVersion.VDF_V1]: decodeVdfV1ConfigData,
});

/**
 * Safely decodes a consensus config envelope and dispatches its opaque config data to
 * the decoder assigned to the stored schema version.
 *
 * Schema version identifiers are permanent wire-format identifiers. Existing
 * identifiers must never be reassigned to a different consensus config format.
 *
 * @param {*} encodedConsensusConfig Value expected to contain an encoded config.
 * @returns {{schemaVersion: number, configData: object}|null} Decoded config or null.
 */
export const safeDecodeVersionedConsensusConfig = (encodedConsensusConfig) => {
    const consensusConfig = safeDecodeConsensusConfig(encodedConsensusConfig);
    if (consensusConfig === null) return null;

    const schemaVersion = consensusConfig.sv.readUInt8(0);
    const decodeConfigData = CONSENSUS_CONFIG_DECODERS[schemaVersion];

    if (typeof decodeConfigData !== 'function') {
        return null;
    }

    const configData = decodeConfigData(consensusConfig.cd);
    if (configData === null) return null;

    return {
        schemaVersion,
        configData,
    };
};
