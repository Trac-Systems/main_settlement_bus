import b4a from 'b4a'
import {
    VDF_DIFFICULTY_SIZE,
    VDF_DISCRIMINANT_SIZE,
    VDF_BLOB_PROOF_SIZE,
    SIGNATURE_BYTE_LENGTH
} from '../../../utils/constants'
import { isBufferValid } from '../../../utils/buffer';
import {
    safeEncodeProofProposal,
    safeEncodeProofProposalApproval
} from "../../../codecs/consensus/v1/consensusV1OperationCodec.js";

export const PROTOCOL_VERSION = 1

const VDF_PARAMS_ENTRY_SIZE = VDF_DIFFICULTY_SIZE + VDF_DISCRIMINANT_SIZE;

export function encodeVdfParameters(difficulty, discriminantBitSize) {
    if (!isBufferValid(difficulty, VDF_DIFFICULTY_SIZE) || 
        !isBufferValid(discriminantBitSize, VDF_DISCRIMINANT_SIZE)) {
        return b4a.alloc(0);
    }

    try {
        let vdfParamsEntry = b4a.alloc(VDF_PARAMS_ENTRY_SIZE);
        let offset = 0;
        b4a.copy(difficulty, vdfParamsEntry, offset);
        offset += VDF_DIFFICULTY_SIZE;
        b4a.copy(discriminantBitSize, vdfParamsEntry, offset);
    
        return vdfParamsEntry;
    }
    catch {
        return b4a.alloc(0);
    }
}

export function decodeVdfParameters(vdfParamsEntry) {
    if (isBufferValid(vdfParamsEntry, VDF_PARAMS_ENTRY_SIZE)) {
        return null;
    }

    try {
        let offset = 0;
    
        const difficulty = vdfParamsEntry.subarray(offset, offset + VDF_DIFFICULTY_SIZE);
        offset += VDF_DIFFICULTY_SIZE;
    
        const discriminantBitSize = vdfParamsEntry.subarray(offset, offset + VDF_DISCRIMINANT_SIZE);
    
        return {
            difficulty,
            discriminantBitSize
        }
    }
    catch {
        return null;
    }
}

export function initGenesisEpoch(config, proposerAddress) {
    const proofData = {
        protocolVersion: PROTOCOL_VERSION, // PROTOCOL_VERSION_BYTE_LENGTH
        networkId: config.networkId, // NETWORK_ID_BYTE_LENGTH
        epoch: 0, // 8 bytes
        previous_epoch_record_hash: b4a.alloc(32).fill(0), //HASH_BYTE_LENGTH
        proposer: proposerAddress, // trac address (string), // from config
        vdf_parameters_hash: b4a.alloc(32).fill(0), // this should be a hash of current vdf params but now placeholder and HASH_BYTE_LENGTH
        vdf_proof: b4a.alloc(32).fill(VDF_BLOB_PROOF_SIZE), // VDF_BLOB_PROOF_SIZE
        signature: b4a.alloc(32).fill(SIGNATURE_BYTE_LENGTH), // SIGNATURE_BYTE_LENGTH
    }

    const proposalApproval = {
        approver: proposerAddress,
        signature: b4a.alloc(32).fill(SIGNATURE_BYTE_LENGTH)
    }

    const genesisEpochProof = {
        data: safeEncodeProofProposal(proofData),
        approvals: [safeEncodeProofProposalApproval(proposalApproval)]
    }

}