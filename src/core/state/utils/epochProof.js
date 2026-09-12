import b4a from 'b4a';

import {
    HASH_BYTE_LENGTH,
    SIGNATURE_BYTE_LENGTH,
    VDF_PROOF_BYTE_LENGTHS,
    ConsensusConfigSchemaVersion
} from '../../../utils/constants.js';
import {
    safeDecodeConsensusConfig,
    safeEncodeEpochProofV1,
    safeEncodeEpochRecord
} from '../../../codecs/apply/applyOperationCodec.js';
import {safeDecodeVdfConfig} from '../../../codecs/consensus/v1/vdfConfigCodec.js';
import {safeEncodeProofProposal} from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import {addressToBuffer} from './address.js';
import {safeUint16ToBuffer} from '../../../utils/buffer.js';

// Apply-only genesis formats. Preserve existing factories for historical replay.
const GENESIS_EPOCH_FACTORIES = Object.freeze({
    [ConsensusConfigSchemaVersion.VDF_V1]: createVdfV1GenesisEpochProof,
});

/**
 * Creates epoch zero using the initial config carried by SET_GENESIS_EPOCH,
 * not the latest signed config. SET_CONSENSUS_CONFIG must not recreate genesis.
 *
 * @param {string} proposerAddress Genesis proposer address.
 * @param {Buffer} encodedConsensusConfig Encoded initial consensus config.
 * @param {Config} config Application configuration.
 * @returns {Promise<Buffer|null>} Encoded { sv, data } genesis epoch record or null on failure.
 */
export async function createGenesisEpochProof(proposerAddress, encodedConsensusConfig, config) {
    const consensusConfig = safeDecodeConsensusConfig(encodedConsensusConfig);
    if (consensusConfig === null) {
        return null;
    }

    const createForSchema = GENESIS_EPOCH_FACTORIES[consensusConfig.sv.readUInt8(0)];
    if (typeof createForSchema !== 'function') {
        return null;
    }

    const genesisData = await createForSchema(config, proposerAddress, consensusConfig.cd);
    if (!b4a.isBuffer(genesisData) || genesisData.length === 0) {
        return null;
    }

    const genesisRecord = safeEncodeEpochRecord({ sv: consensusConfig.sv, data: genesisData });
    return genesisRecord.length > 0 ? genesisRecord : null;
}


/**
 * Creates the VDF v1 representation of epoch zero.
 * The caller wraps these bytes in the versioned epoch record before hashing.
 *
 * @param {Config} config Application configuration.
 * @param {string} proposerAddress Genesis proposer address.
 * @param {Buffer} encodedConfigData Encoded VDF v1 config.
 * @returns {Promise<Buffer|null>} Encoded epoch proof or null on validation failure.
 */
export async function createVdfV1GenesisEpochProof(config, proposerAddress, encodedConfigData) {
    const configData = safeDecodeVdfConfig(encodedConfigData);
    if (configData === null) return null;

    const proposer = addressToBuffer(proposerAddress, config.addressPrefix);
    if (proposer.length === 0) {
        return null;
    }

    const networkId = safeUint16ToBuffer(config.networkId);
    const { difficulty, discriminantBitSize } = configData;
    const proofByteLength = VDF_PROOF_BYTE_LENGTHS[discriminantBitSize.readUInt16BE(0)];
    if (
        networkId.length === 0 ||
        !Number.isInteger(proofByteLength)
    ) {
        return null;
    }

    const proofData = {
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
