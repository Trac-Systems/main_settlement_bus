import V1EpochProofProposalRequest from "../validators/V1EpochProofProposalRequest.js";
import V1EpochProofProposalApproval from "../validators/V1EpochProofProposalApproval.js";
import {networkMessageFactory} from "../../../../messages/network/v1/networkMessageFactory.js";
import b4a from "b4a";
import { V1ProtocolError } from "../../../network/protocols/v1/V1ProtocolError.js";
import { ResultCode } from "../../../../utils/constants.js";

// Minion interface to verify & sign proposals
class ConsensusEpochProofProposalOperationHandler {
    #requestValidator;
    #responseValidator;
    #state;

    constructor(state, _wallet, config) {
        this.#state = state;
        this.#requestValidator = new V1EpochProofProposalRequest(config);
        this.#responseValidator = new V1EpochProofProposalApproval(config);
    }

    // leader requests approval to minion
    async handleRequest(message, connection) {
        await this.#requestValidator.validate(message, connection.remotePublicKey);
        const proofProposal = message.proof_proposal;
        const currentEpoch = await this.#state.currentEpoch();

        this.#validateEpochContinuity(proofProposal, currentEpoch);

        return proofProposal;
    }

    // TODO: validates the response from line 61 to the end
    // is valid signature and is a valid approver
    async handleResponse(message, connection) {
        try {
            this.applyRateLimit(connection);
            await this.resolvePendingResponse(
                message,
                connection,
                this.#responseValidator,
                this.#extractEpochProofProposalResponse
            );
        } catch (error) {
            this.handlePendingResponseError(
                message.id,
                connection,
                error,
                "Failed to process epoch proof proposal response from sender"
            );
        }

        // handle the response
    }

    #extractEpochProofProposalResponse(payload) {
        return {
            code: payload.epoch_proof_proposal_response.result,
            result: {
                approver: payload.epoch_proof_proposal_response.approver,
                signature: payload.epoch_proof_proposal_response.signature
            }
        };
    }

    #validateEpochContinuity(proofProposal, currentEpoch) {
        if (!currentEpoch) {
            throw new V1ProtocolError(
                ResultCode.PROOF_PAYLOAD_MISMATCH,
                "Current epoch state is missing."
            );
        }

        if (typeof currentEpoch.epoch !== "bigint") {
            throw new V1ProtocolError(
                ResultCode.PROOF_PAYLOAD_MISMATCH,
                "Current epoch state must include epoch as a BigInt."
            );
        }

        if (!b4a.isBuffer(currentEpoch.epoch_record_hash)) {
            throw new V1ProtocolError(
                ResultCode.PROOF_PAYLOAD_MISMATCH,
                "Current epoch state must include epoch_record_hash as a buffer."
            );
        }

        const proposalEpoch = proofProposal.epoch.readBigUInt64BE(0);
        if (proposalEpoch !== currentEpoch.epoch + 1n) {
            throw new V1ProtocolError(
                ResultCode.PROOF_PAYLOAD_MISMATCH,
                "Epoch proof proposal is not for the next epoch."
            );
        }

        if (!b4a.equals(proofProposal.previous_epoch_record_hash, currentEpoch.epoch_record_hash)) {
            throw new V1ProtocolError(
                ResultCode.PROOF_PAYLOAD_MISMATCH,
                "Previous epoch record hash does not match current epoch state."
            );
        }
    }
}

export default ConsensusEpochProofProposalOperationHandler;
