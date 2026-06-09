import V1EpochProofProposalRequest from "../validators/V1EpochProofProposalRequest.js";
import V1EpochProofProposalResponse from "../validators/V1EpochProofProposalResponse.js";
import {consensusMessageFactory} from "../../../../messages/consensus/v1/consensusMessageFactory.js";
import { V1ProtocolError } from "../../../network/protocols/v1/V1ProtocolError.js";
import { CustomEventType, ResultCode } from "../../../../utils/constants.js";
import b4a from "b4a";
import tracCryptoApi from "trac-crypto-api";
import { epochProofFromBuffer } from "./epochProposal/epochProofData.js";
import {publicKeyToAddress} from "../../../../utils/helpers.js";

// Minion interface to verify & sign proposals
class ConsensusEpochProofProposalOperationHandler {
    #v1EpochProofProposalRequestValidator;
    #v1EpochProofProposalResponseValidator;
    #state
    #wallet
    #config
    #pendingRequestService

    constructor(state, wallet, config, pendingRequestService) {
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
        this.#pendingRequestService = pendingRequestService;
        this.#v1EpochProofProposalRequestValidator = new V1EpochProofProposalRequest(config);
        this.#v1EpochProofProposalResponseValidator = new V1EpochProofProposalResponse(config);
    }

    displayError(step = "undefined step", senderPublicKey, error) {
        const errorMessage = error?.message ?? 'Unexpected error';
        console.error(`${this.constructor.name}: ${step} ${publicKeyToAddress(senderPublicKey, this.#config)}: ${errorMessage}`);
    }

    async #resolvePendingResponse(message, connection, validator, extractResult) {
        const entry = this.#pendingRequestService.getPendingRequest(message.id);
        if (!entry) return false;

        this.#pendingRequestService.stopPendingRequestTimeout(message.id);
        await validator.validate(message, connection, entry);
        const result = extractResult(message);
        this.#pendingRequestService.resolvePendingRequest(message.id, result);
        return true;
    }

    #handlePendingResponseError(messageId, connection, error, step) {
        const protocolError = error instanceof V1ProtocolError
            ? error
            : new V1ProtocolError(ResultCode.UNEXPECTED_ERROR, error?.message ?? "Unexpected Error");
        const rejected = this.#pendingRequestService.rejectPendingRequest(messageId, protocolError);
        if (!rejected) return;
        this.displayError(step, connection.remotePublicKey, protocolError)
    }

    // leader requests approval to minion
    async handleRequest(message, connection) {
        try {
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
            const result =  await connection.consensusProtocolSession.sendAndForget(response);

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
            await this.#resolvePendingResponse(
                message,
                connection,
                this.#v1EpochProofProposalResponseValidator,
                this.#extractEpochProofProposalResponse
            );
        } catch (error) {
            this.#handlePendingResponseError(
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

    // TODO: validate the validation 
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
        
        // this must be proofData.networkId !== this.#config.networkId
        if (proofData.networkId !== previousEpoch.networkId) {
            throw new V1ProtocolError(ResultCode.INVALID_EPOCH, 'Network id mismatch');
        }
    }

    // TODO: import wasm to validate vdf using verify (same thread)
    #validateVdf(proofData) {
        if (!proofData.vdfOutput) {
            throw new V1ProtocolError(ResultCode.INVALID_EPOCH, 'Inconsistent vdf data');
        }
    }

    async #buildEpochResponse(id, capabilities, signature) {
        try {
            // TODO: pass the correct params to the buildProofProposalResponse function
            return await consensusMessageFactory(this.#wallet, this.#config).buildProofProposalResponse(
                id,
                capabilities,
                ResultCode.OK,
                signature
            );
        } catch (error) {
            // TODO: Update or create to use a consensus error
            throw new V1ProtocolError(ResultCode.UNEXPECTED_ERROR, `Failed to build broadcast transaction response: ${error.message}`);
        }
    }
}

export default ConsensusEpochProofProposalOperationHandler;
