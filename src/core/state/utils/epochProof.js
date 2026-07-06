import b4a from 'b4a'
import {
    HASH_BYTE_LENGTH,
    VDF_DIFFICULTY_SIZE,
    VDF_DISCRIMINANT_SIZE,
    VDF_BLOB_PROOF_SIZE,
    SIGNATURE_BYTE_LENGTH
} from '../../../utils/constants.js'
import { isBufferValid, safeUint8ToBuffer, safeUint16ToBuffer, safeUint64ToBuffer } from '../../../utils/buffer.js';
import { addressToBuffer } from './address.js';
import { safeEncodeEpochProof } from '../../../codecs/apply/applyOperationCodec.js';
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
    const proposer = b4a.isBuffer(proposerAddress)
        ? proposerAddress
        : addressToBuffer(proposerAddress, config.addressPrefix);

    const proofData = {
        protocol_version: safeUint8ToBuffer(PROTOCOL_VERSION, 'Protocol version'),
        network_id: safeUint16ToBuffer(config.networkId, 'Network id'),
        epoch: safeUint64ToBuffer(0, 'Epoch'),
        previous_epoch_record_hash: b4a.alloc(HASH_BYTE_LENGTH).fill(0),
        proposer,
        vdf_parameters_hash: b4a.alloc(HASH_BYTE_LENGTH).fill(0),
        vdf_proof: b4a.alloc(VDF_BLOB_PROOF_SIZE).fill(0),
        signature: b4a.alloc(SIGNATURE_BYTE_LENGTH).fill(0),
    }

    const proposalApproval = {
        approver: proposer,
        approval_sig: b4a.alloc(SIGNATURE_BYTE_LENGTH).fill(0)
    }

    const genesisEpochProof = {
        pd: safeEncodeProofProposal(proofData),
        app: [safeEncodeProofProposalApproval(proposalApproval)]
    }

    return safeEncodeEpochProof(genesisEpochProof);
}
