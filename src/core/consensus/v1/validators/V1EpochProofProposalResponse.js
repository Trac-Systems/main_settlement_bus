import b4a from "b4a";
import tracCryptoApi from "trac-crypto-api";
import { ResultCode, WRITER_BYTE_LENGTH } from "../../../../utils/constants.js";
import { V1ProtocolError } from "../../../network/protocols/v1/V1ProtocolError.js";
import { isBufferValid } from "../../../../utils/buffer.js";
import V1BaseOperation from "../../../network/protocols/v1/validators/V1BaseOperation.js";

class V1EpochProofProposalResponse extends V1BaseOperation {
    constructor(config) {
        super(config);
    }

    async validate(payload, connection, pendingRequestServiceEntry) {
        this.isPayloadSchemaValid(payload);
        this.validateResponseType(payload, pendingRequestServiceEntry);
        this.validatePeerCorrectness(connection.remotePublicKey, pendingRequestServiceEntry);

        this.validateMemberId(payload, connection.remotePublicKey);
        const resultCode = payload.epoch_proof_proposal_response.result;
        if (resultCode === ResultCode.OK) {
            this.validateProposalSignature(payload, pendingRequestServiceEntry.requestEpochProofProposalHash);
        }
        return true;
    }

    validateMemberId(payload, remotePublicKey) {
        const memberId = payload.epoch_proof_proposal_response?.member_id;
        if (!isBufferValid(memberId, WRITER_BYTE_LENGTH) || !b4a.equals(memberId, remotePublicKey)) {
            throw new V1ProtocolError(
                ResultCode.INVALID_PAYLOAD,
                'Epoch proposal response member_id does not match sender public key.'
            );
        }
    }

    validateProposalSignature(payload, proposalHash) {
        const response = payload.epoch_proof_proposal_response;
        let verified = false;
        try {
            verified = tracCryptoApi.signature.verify(
                response.signature,
                proposalHash,
                response.member_id
            );
        } catch {
            verified = false;
        }

        if (!verified) {
            throw new V1ProtocolError(
                ResultCode.SIGNATURE_INVALID,
                'Epoch proposal response signature verification failed.'
            );
        }
    }
}

export default V1EpochProofProposalResponse;
