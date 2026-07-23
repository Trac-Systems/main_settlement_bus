import b4a from 'b4a'
import tracCryptoApi from 'trac-crypto-api';
import {
    HASH_BYTE_LENGTH,
    VDF_DIFFICULTY_SIZE,
    VDF_DISCRIMINANT_SIZE,
    VDF_BLOB_PROOF_SIZE,
    SIGNATURE_BYTE_LENGTH,
    ConsensusProtocolVersion
} from '../../../utils/constants.js'
import { isBufferValid, safeUint8ToBuffer, safeUint16ToBuffer } from '../../../utils/buffer.js';
import { addressToBuffer } from './address.js';
import { safeEncodeEpochProof } from '../../../codecs/apply/applyOperationCodec.js';
import {
    safeEncodeProofProposal,
    safeEncodeProofProposalApproval
} from "../../../codecs/consensus/v1/consensusV1OperationCodec.js";
const VDF_PARAMS_ENTRY_SIZE = VDF_DIFFICULTY_SIZE + VDF_DISCRIMINANT_SIZE;

export async function createGenesisEpochProof(config, proposerAddress, vdfParamsEntry) {
    const proposer = addressToBuffer(proposerAddress, config.addressPrefix);

    if (proposer.length === 0) {
        return null;
    }
    if (!isBufferValid(vdfParamsEntry, VDF_PARAMS_ENTRY_SIZE)) {
        return null;
    }

    const vdfParametersHash = await tracCryptoApi.hash.blake3Safe(vdfParamsEntry);
    if (!isBufferValid(vdfParametersHash, HASH_BYTE_LENGTH)) {
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
        vdf_parameters_hash: vdfParametersHash,
        vdf_proof: b4a.alloc(VDF_BLOB_PROOF_SIZE).fill(0),
        signature: b4a.alloc(SIGNATURE_BYTE_LENGTH).fill(0),
    }

    const proposalApproval = {
        approver: proposer,
        approval_sig: b4a.alloc(SIGNATURE_BYTE_LENGTH).fill(0)
    }

    const encodedProof = safeEncodeProofProposal(proofData);
    if (encodedProof.length === 0) {
        return null;
    }
    const encodedProposalApproval = safeEncodeProofProposalApproval(proposalApproval);
    if (encodedProposalApproval.length === 0) {
        return null;
    }
    const genesisEpochProof = {
        pd: encodedProof,
        app: [encodedProposalApproval]
    }

    return safeEncodeEpochProof(genesisEpochProof);
}
