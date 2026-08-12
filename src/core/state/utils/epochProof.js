import b4a from 'b4a'
import {
    HASH_BYTE_LENGTH,
    VDF_BLOB_PROOF_SIZE,
    SIGNATURE_BYTE_LENGTH,
    ConsensusProtocolVersion
} from '../../../utils/constants.js'
import {  safeUint8ToBuffer, safeUint16ToBuffer } from '../../../utils/buffer.js';
import { addressToBuffer } from './address.js';
import {
    safeDecodeConsensusConfig,
    safeEncodeEpochProof
} from '../../../codecs/apply/applyOperationCodec.js';
import { safeDecodeVdfConfig } from '../../../codecs/consensus/v1/vdfConfigCodec.js';
import {
    safeEncodeProofProposal,
} from "../../../codecs/consensus/v1/consensusV1OperationCodec.js";

export async function createGenesisEpochProof(config, proposerAddress, encodedConfigData) {
    const proposer = addressToBuffer(proposerAddress, config.addressPrefix);

    if (proposer.length === 0) {
        return null;
    }
    const consensusConfig = safeDecodeConsensusConfig(encodedConfigData);
    if (!consensusConfig) {
        return null;
    }
    // TODO: DEPENDLY FROM THE VERSION USE SPECIFIC ENCODER. THIS SHOULD NOT DEPEND ON THE VDF
    const vdfConfig = safeDecodeVdfConfig(consensusConfig.cd);
    if (!vdfConfig) {
        return null;
    }

    const protocolVersion = safeUint8ToBuffer(ConsensusProtocolVersion.V1);
    if (protocolVersion.length === 0) {
        return null;
    }
    const  networkId = safeUint16ToBuffer(config.networkId);
    if (networkId.length === 0) {
        return null;
    }
    const epoch = b4a.alloc(8, 0); // Epoch Zero

    const proofData = {
        protocol_version: protocolVersion,
        network_id: networkId,
        epoch,
        previous_epoch_record_hash: b4a.alloc(HASH_BYTE_LENGTH).fill(0),
        proposer,
        difficulty: vdfConfig.difficulty,
        discriminant_bit_size: vdfConfig.discriminantBitSize,
        proof: b4a.alloc(VDF_BLOB_PROOF_SIZE).fill(0),
        signature: b4a.alloc(SIGNATURE_BYTE_LENGTH).fill(0),
    }

    const encodedProof = safeEncodeProofProposal(proofData);
    if (encodedProof.length === 0) {
        return null;
    }

    const genesisEpochProof = {
        pd: encodedProof,
        app: []
    }

    const encodedEpochProof = safeEncodeEpochProof(genesisEpochProof);
    if (encodedEpochProof.length === 0) {
        return null;
    }

    return encodedEpochProof;
}
