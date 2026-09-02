import b4a from 'b4a';

import {
    ConsensusConfigSchemaVersion,
    ConsensusProtocolVersion,
    HASH_BYTE_LENGTH,
    SIGNATURE_BYTE_LENGTH,
    VDF_PROOF_BYTE_LENGTHS,
} from '../../../utils/constants.js';
import {
    safeUint8ToBuffer,
    safeUint16ToBuffer,
    safeWriteUInt32BE,
} from '../../../utils/buffer.js';
import { safeDecodeVersionedConsensusConfig } from './consensusConfig.js';
import { safeEncodeEpochProofV1 } from '../../../codecs/apply/applyOperationCodec.js';
import { safeEncodeProofProposal } from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import { addressToBuffer } from './address.js';

const GENESIS_EPOCH_FACTORIES = Object.freeze({
    [ConsensusConfigSchemaVersion.VDF_V1]: createVdfV1GenesisEpochProof,
});

/**
 * Creates epoch zero using the implementation selected by the stored consensus
 * config schema version.
 *
 * @param {Config} config Application configuration.
 * @param {string} proposerAddress Genesis proposer address.
 * @param {Buffer} encodedConsensusConfig Encoded versioned consensus config.
 * @returns {Promise<Buffer|null>} Encoded genesis epoch proof or null on failure.
 */
export async function createGenesisEpochProof(config, proposerAddress, encodedConsensusConfig) {
    const consensusConfig = safeDecodeVersionedConsensusConfig(encodedConsensusConfig);
    if (consensusConfig === null) {
        return null;
    }

    const createForSchema = GENESIS_EPOCH_FACTORIES[consensusConfig.schemaVersion];
    if (typeof createForSchema !== 'function') {
        return null;
    }

    return await createForSchema(config, proposerAddress, consensusConfig.configData);
}

/**
 * Creates the VDF v1 representation of epoch zero.
 *
 * @param {Config} config Application configuration.
 * @param {string} proposerAddress Genesis proposer address.
 * @param {{difficulty: number, discriminantBitSize: number}} configData VDF v1 config.
 * @returns {Promise<Buffer|null>} Encoded epoch proof or null on validation failure.
 */
async function createVdfV1GenesisEpochProof(config, proposerAddress, configData) {
    const proposer = addressToBuffer(proposerAddress, config.addressPrefix);
    if (proposer.length === 0) {
        return null;
    }

    const protocolVersion = safeUint8ToBuffer(ConsensusProtocolVersion.V1);
    const networkId = safeUint16ToBuffer(config.networkId);
    const difficulty = safeWriteUInt32BE(configData.difficulty);
    const discriminantBitSize = safeUint16ToBuffer(configData.discriminantBitSize);
    const proofByteLength = VDF_PROOF_BYTE_LENGTHS[configData.discriminantBitSize];

    if (
        protocolVersion.length === 0 ||
        networkId.length === 0 ||
        difficulty.length === 0 ||
        discriminantBitSize.length === 0 ||
        !Number.isInteger(proofByteLength)
    ) {
        return null;
    }

    const proofData = {
        protocol_version: protocolVersion,
        network_id: networkId,
        epoch: b4a.alloc(8, 0),
        previous_epoch_record_hash: b4a.alloc(HASH_BYTE_LENGTH, 0),
        proposer,
        difficulty,
        discriminant_bit_size: discriminantBitSize,
        proof: b4a.alloc(proofByteLength, 0),
        signature: b4a.alloc(SIGNATURE_BYTE_LENGTH, 0),
    };

    const encodedProof = safeEncodeProofProposal(proofData);
    if (encodedProof.length === 0) {
        return null;
    }

    const genesisEpochProof = {
        pd: encodedProof,
        app: []
    }

    const encodedEpochProof = safeEncodeEpochProofV1(genesisEpochProof);
    if (encodedEpochProof.length === 0) {
        return null;
    }

    return encodedEpochProof;
}
