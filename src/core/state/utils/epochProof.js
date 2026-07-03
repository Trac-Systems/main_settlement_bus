import b4a from 'b4a'
import { VDF_DIFFICULTY_SIZE, VDF_DISCRIMINANT_SIZE } from '../../../utils/constants'
import { isBufferValid } from '../../../utils/buffer';

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

export function initGenesisEpoch(config) {
    const proofData = {
        protocolVersion: PROTOCOL_VERSION,
        networkId: config.networkId,
        epoch: 0,
        
    }

    const proposalApproval = {

    }

    const genesisEpochProof = {
        data: proofData,
        approvals: [proposalApproval]
    }
}