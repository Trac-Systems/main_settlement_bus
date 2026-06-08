import ConsensusBaseOperation from './ConsensusBaseOperation.js';
import b4a from "b4a";
import tracCryptoApi from "trac-crypto-api";
import { ResultCode, WRITER_BYTE_LENGTH } from "../../../../utils/constants.js";
import { V1ProtocolError } from "../../../network/protocols/v1/V1ProtocolError.js";
import { isBufferValid } from "../../../../utils/buffer.js";

class V1EpochProofProposalResponse extends ConsensusBaseOperation {
    constructor(config) {
        super(config);
    }

    async validate(payload, connection, pendingRequestServiceEntry) {
        this.isPayloadSchemaValid(payload);
        this.validateResponseType(payload, pendingRequestServiceEntry);
        this.validatePeerCorrectness(connection.remotePublicKey, pendingRequestServiceEntry);

        this.validateApprover(payload, connection.remotePublicKey);
        const resultCode = payload.broadcast_transaction_response.result;
        if (resultCode === ResultCode.OK) {
            this.validateProposalSignature(payload, pendingRequestServiceEntry.requestEpochProofProposalHash);
        }
        return true;
    }

    validateApprover(payload, remotePublicKey) {
        const approver = payload.epoch_proof_proposal_response?.approver;
        if (!isBufferValid(approver, WRITER_BYTE_LENGTH) || !b4a.equals(approver, remotePublicKey)) {
            throw new V1ProtocolError(
                ResultCode.INVALID_PAYLOAD,
                'Epoch proposal response approver does not match sender public key.'
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
                response.approver
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
