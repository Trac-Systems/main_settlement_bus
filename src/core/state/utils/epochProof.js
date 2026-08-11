import b4a from 'b4a'
import tracCryptoApi from 'trac-crypto-api';
import {
    HASH_BYTE_LENGTH,
    VDF_BLOB_PROOF_SIZE,
    SIGNATURE_BYTE_LENGTH,
    ConsensusProtocolVersion
} from '../../../utils/constants.js'
import { isBufferValid, safeUint8ToBuffer, safeUint16ToBuffer } from '../../../utils/buffer.js';
import { addressToBuffer } from './address.js';
import { safeEncodeEpochProof } from '../../../codecs/apply/applyOperationCodec.js';
import {
    safeEncodeProofProposal,
} from "../../../codecs/consensus/v1/consensusV1OperationCodec.js";

export async function createGenesisEpochProof(config, proposerAddress, encodedConfigData) {
    const proposer = addressToBuffer(proposerAddress, config.addressPrefix);

    if (proposer.length === 0) {
        return null;
    }
    // TODO: To be deleted because we are going to replace vdfParametersHash with parameters directly to save 28 bytes
    const vdfParametersHash = await tracCryptoApi.hash.blake3Safe(encodedConfigData);
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

    // TODO: To be deleted because we are going to replace vdfParametersHash with parameters directly to save 28 bytes
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
