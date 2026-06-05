import V1EpochProofProposalRequest from "../validators/V1EpochProofProposalRequest.js";
import V1EpochProofProposalResponse from "../validators/V1EpochProofProposalResponse.js";
import {networkMessageFactory} from "../../../../messages/network/v1/networkMessageFactory.js";
import { V1ProtocolError } from "../../../network/protocols/v1/V1ProtocolError.js";
import { CustomEventType, ResultCode } from "../../../../utils/constants.js";
import b4a from "b4a";
import tracCryptoApi from "trac-crypto-api";
import { epochProofFromBuffer } from "./epochProposal/epochProofData.js";

// TODO: this class calls applyRateLimit, displayError, sendResponseAndMaybeClose, resolvePendingResponse,
// and handlePendingResponseError but does not define them and extends nothing. It should extend a base handler class.

// Minion interface to verify & sign proposals
class ConsensusEpochProofProposalOperationHandler {
    #v1EpochProofProposalRequestValidator;
    #v1EpochProofProposalResponseValidator;
    #state
    #wallet
    #config

    constructor(state, wallet, config) {
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
        this.#v1EpochProofProposalRequestValidator = new V1EpochProofProposalRequest(config);
        this.#v1EpochProofProposalResponseValidator = new V1EpochProofProposalResponse(config);
    }

    // leader requests approval to minion
    async handleRequest(message, connection) {
        try {
            this.applyRateLimit(connection);
            await this.#v1EpochProofProposalRequestValidator.validate(message, connection.remotePublicKey);
            await this.#validateDataHash(message.epoch_proof_proposal_request)

            const lastEpochProofBuffer = await this.#state.currentEpoch();
            const lastEpochProof = lastEpochProofBuffer ? epochProofFromBuffer(lastEpochProofBuffer) : null;
            const epochProof = epochProofFromBuffer(message.epoch_proof_proposal_request.data);
            
            this.#validatePreviousEpoch(epochProof, lastEpochProof);
            this.#validateVdf(epochProof);
        } catch (error) {
            this.displayError(
                "failed to process epoch proof proposal request from sender",
                connection.remotePublicKey,
                error
            );
            return;
        }

        try {
            const proposalHash = message.epoch_proof_proposal_request.hash
            const signature = this.#wallet.sign(proposalHash)
            const response = await this.#buildEpochResponse(message.id, connection.capabilities, signature)
            
            const result = await this.sendResponseAndMaybeClose(
                connection,
                response,
                false
            );

            this.#state.emit(CustomEventType.EPOCH_PROPOSAL_SUBMITTED)
            return result;
        } catch (error) {
            // some error handler there
            this.displayError(
                "failed to build/send epoch proof proposal response to sender",
                connection.remotePublicKey,
                error
            );
        }
    }

    // TODO: validates the response from line 61 to the end
    // is valid signature and is a valid approver
    async handleResponse(message, connection) {
        try {
            this.applyRateLimit(connection);
            await this.resolvePendingResponse(
                message,
                connection,
                this.#v1EpochProofProposalResponseValidator,
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

    async #validateDataHash(message) {
        const proposalHash = message.hash
        const proofData = message.data
        const computeHash = await tracCryptoApi.hash.blake3(proofData);
        if (!b4a.equals(computeHash, proposalHash)) {
            throw new V1ProtocolError(ResultCode.INVALID_PAYLOAD, 'There is a hash mismatch for the proof');
        }
    }

    #validatePreviousEpoch(proofData, previousEpoch) {
        if (!previousEpoch || proofData.epoch !== previousEpoch.epoch + 1n) {
            throw new V1ProtocolError(ResultCode.INVALID_EPOCH, 'Epoch sequence mismatch');
        }
        
        if (proofData.protocolVersion !== previousEpoch.protocolVersion) {
            throw new V1ProtocolError(ResultCode.INVALID_EPOCH, 'Protocol version mismatch');
        }
        
        if (proofData.prevEpochHash !== previousEpoch.prevEpochHash) {
            throw new V1ProtocolError(ResultCode.INVALID_EPOCH, 'Previous epoch hash mismatch');
        }
        
        if (proofData.networkId !== previousEpoch.networkId) {
            throw new V1ProtocolError(ResultCode.INVALID_EPOCH, 'Network id mismatch');
        }
    }

    #validateVdf(proofData) {
        if (!proofData.vdfOutput) {
            throw new V1ProtocolError(ResultCode.INVALID_EPOCH, 'Inconsistent vdf data');
        }
    }

    async #buildEpochResponse(id, capabilities, signature) {
        try {
            return await networkMessageFactory(this.#wallet, this.#config).buildEpochProofProposalResponse(
                id,
                capabilities,
                ResultCode.OK,
                signature
            );
        } catch (error) {
            throw new V1ProtocolError(ResultCode.UNEXPECTED_ERROR, `Failed to build broadcast transaction response: ${error.message}`);
        }
    }
}

export default ConsensusEpochProofProposalOperationHandler;
