import V1BaseConsensusOperation from "./V1BaseConsensusOperation.js";
import {ConsensusResultCode} from "../../../../utils/constants.js";
import {createMessage, safeWriteUInt32BE} from "../../../../utils/buffer.js";
import {encodeProofProposalApproval} from "../../../../codecs/consensus/v1/consensusV1OperationCodec.js";
import tracCryptoApi from "trac-crypto-api";
import {V1ConsensusProtocolError} from "../V1ConsensusProtocolError.js";

class V1EpochProofProposalApproval extends V1BaseConsensusOperation {
    /**
     * Creates the proof proposal approval validator.
     */
    constructor(config) {
        super(config);
    }

    /**
     * Validates proof proposal approval schema and both approval response signatures.
     */
    async validate(payload, connection, proofProposal) {
        this.isPayloadSchemaValid(payload);
        this.assertAddressWithRemotePublicKey(payload.proof_proposal_response.approval.approver, connection.remotePublicKey, "approver");
        await this.validateSignature(payload, connection.remotePublicKey, proofProposal);
        await this.validateResponseSignature(payload, connection.remotePublicKey);
    }

    /**
     * Verifies the response signature over result code and encoded approval.
     */
    async validateResponseSignature(payload, remotePublicKey) {
        const proofProposalResponse = payload.proof_proposal_response;
        const encodedApproval = encodeProofProposalApproval(proofProposalResponse.approval);
        const message = createMessage(
            safeWriteUInt32BE(proofProposalResponse.result, 0),
            encodedApproval
        );

        let hash;
        try {
            hash = await tracCryptoApi.hash.blake3(message);
        } catch {
            throw new V1ConsensusProtocolError(ConsensusResultCode.UNEXPECTED_ERROR, 'Failed to hash response signature message.');
        }

        let verified = false;
        try {
            verified = tracCryptoApi.signature.verify(proofProposalResponse.response_sig, hash, remotePublicKey);
        } catch {
            verified = false;
        }
        if (!verified) {
            throw new V1ConsensusProtocolError(ConsensusResultCode.UNEXPECTED_ERROR, 'response signature verification failed.');
        }
    }

}

export default V1EpochProofProposalApproval;
