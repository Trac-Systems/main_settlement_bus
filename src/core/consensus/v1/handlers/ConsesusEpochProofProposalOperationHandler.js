import V1EpochProofProposalRequest from "../validators/V1EpochProofProposalRequest.js";
import V1EpochProofProposalApproval from "../validators/V1EpochProofProposalApproval.js";
import {networkMessageFactory} from "../../../../messages/network/v1/networkMessageFactory.js";
import b4a from "b4a";
import { V1ProtocolError } from "../../../network/protocols/v1/V1ProtocolError.js";
import { ConsensusResultCode, ResultCode } from "../../../../utils/constants.js";
import DummyVDFVerifier from "../../services/DummyVDFVerifier.js";
import { consensusMessageFactory } from "../../../../messages/consensus/v1/consensusMessageFactory.js";
import { bufferToAddress } from "../../../state/utils/address.js";

// Minion interface to verify & sign proposals
class ConsensusEpochProofProposalOperationHandler {
    #requestValidator;
    #responseValidator;
    #wallet;
    #config;
    #state;
    #vdfVerifier;

    constructor(state, wallet, config) {
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
        this.#vdfVerifier = new DummyVDFVerifier(); // TODO: Replace with a real VDF Verifier
        this.#requestValidator = new V1EpochProofProposalRequest(config);
        this.#responseValidator = new V1EpochProofProposalApproval(config);
    }

    /**
     * Handles a leader's consensus v1 epoch proof proposal from the minion side.
     * @param {object} message Decoded consensus v1 message containing `proof_proposal` and `session_id`.
     * @param {object} connection Peer connection context used by the request validator.
     * @returns {Promise<object>} Signed consensus v1 proof proposal response.
     * @throws {V1ProtocolError|Error} If request validation or response building fails.
     */
    async handleRequest(message, connection) {
        await this.#requestValidator.validate(message, connection);
        const proofProposal = message.proof_proposal;
        const currentEpoch = await this.#state.currentEpoch();

        this.#validateEpochContinuity(proofProposal, currentEpoch);
        await this.#verifyVdf(proofProposal);

        return await this.#buildProofProposalResponse(message.session_id, proofProposal);
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

    // TODO: update this with trac-vdf
    async #verifyVdf(proofProposal) {
        const vdfIsValid = await this.#vdfVerifier.verify(proofProposal)
        if (!vdfIsValid) {
            throw new V1ProtocolError(
                ResultCode.PROOF_PAYLOAD_MISMATCH,
                "VDF proof verification failed."
            );
        }
    }

    async #buildProofProposalResponse(sessionId, proofProposal) {
        const proposer = bufferToAddress(proofProposal.proposer, this.#config.addressPrefix);

        // TODO: In here we are basically getting some fields represented as buffers from
        // the received proofProposal, converting them to numbers, just to convert them
        // back to buffers internally. This should be optimized
        return await consensusMessageFactory(this.#wallet, this.#config).buildProofProposalResponse(
            sessionId,
            proofProposal.network_id.readUInt16BE(0),
            proofProposal.epoch.readBigUInt64BE(0),
            proofProposal.previous_epoch_record_hash,
            proposer,
            proofProposal.vdf_parameters_hash,
            proofProposal.vdf_proof,
            proofProposal.signature,
            ConsensusResultCode.OK,
            this.#wallet.address
        );
    }
}

export default ConsensusEpochProofProposalOperationHandler;
