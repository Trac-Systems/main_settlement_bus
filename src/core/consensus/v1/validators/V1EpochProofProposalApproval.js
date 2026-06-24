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
     * Validates proof proposal response schema and required response signatures.
     */
    async validate(payload, connection, proofProposal) {
        this.isPayloadSchemaValid(payload);

        const {result, approval} = payload.proof_proposal_response;
        if (result === ConsensusResultCode.OK) {
            this.assertAddressWithRemotePublicKey(
                approval.approver,
                connection.remotePublicKey,
                "approver"
            );
            await this.validateSignature(payload, connection.remotePublicKey, proofProposal);
        }

        this.validateAddressIsIndexer();
        await this.validateResponseSignature(payload, connection.remotePublicKey);
        return true;
    }

    /**
     * Verifies the response signature over result code and optional encoded approval.
     */
    async validateResponseSignature(payload, remotePublicKey) {
        const proofProposalResponse = payload.proof_proposal_response;
        const resultCode = safeWriteUInt32BE(proofProposalResponse.result, 0);
        const message = proofProposalResponse.result === ConsensusResultCode.OK
            ? createMessage(resultCode, encodeProofProposalApproval(proofProposalResponse.approval))
            : createMessage(resultCode);

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
