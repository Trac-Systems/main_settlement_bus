import { decodeConsensusConfig } from '../../../codecs/apply/applyOperationCodec.js';
import { decodeVdfConfig, safeDecodeVdfConfig } from '../../../codecs/consensus/v1/vdfConfigCodec.js';
import {
    CONSENSUS_CONFIG_SCHEMA_VERSION_BYTE_LENGTH,
    ConsensusConfigSchemaVersion,
    VDF_PROOF_BYTE_LENGTHS,
} from '../../../utils/constants.js';
import { isBufferValid, isZeroBuffer, safeReadUint8 } from '../../../utils/buffer.js';

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

// Protocol rules, not network input. New formats do not enable migrations by themselves.
// Add an edge only once its migration requirements are implemented in apply.
const CONSENSUS_TRANSITIONS = Object.freeze({
    [ConsensusConfigSchemaVersion.VDF_V1]: Object.freeze([]),
});

/**
 * Allows parameter updates and explicitly registered forward transitions.
 * A backward edge in the rules cannot override the no-downgrade check.
 *
 * @param {number} currentVersion Active consensus version.
 * @param {number} nextVersion Requested consensus version.
 * @param {Object<number, number[]>} [transitions] Protocol transition table, never config data.
 * @returns {boolean} Whether the version transition is allowed.
 */
export const isConsensusTransitionAllowed = (currentVersion, nextVersion, transitions = CONSENSUS_TRANSITIONS) => {
    if (
        !Number.isInteger(currentVersion) || currentVersion < 1 || currentVersion > 0xff ||
        !Number.isInteger(nextVersion) || nextVersion < 1 || nextVersion > 0xff ||
        nextVersion < currentVersion
    ) {
        return false;
    }

    if (!Object.hasOwn(transitions, currentVersion) || !Object.hasOwn(transitions, nextVersion)) {
        return false;
    }

    return currentVersion === nextVersion || transitions[currentVersion].includes(nextVersion);
};

/** Off-chain config validation. State.apply keeps its consensus-critical checks separately. */
export const validateConsensusConfig = (consensusConfig) => {
    if (!isBufferValid(consensusConfig?.sv, CONSENSUS_CONFIG_SCHEMA_VERSION_BYTE_LENGTH)) {
        return false;
    }

    switch (safeReadUint8(consensusConfig?.sv)) {
        case ConsensusConfigSchemaVersion.VDF_V1: {
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
