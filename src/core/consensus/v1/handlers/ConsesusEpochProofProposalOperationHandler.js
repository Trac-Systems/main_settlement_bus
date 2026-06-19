import V1EpochProofProposalRequest from "../validators/V1EpochProofProposalRequest.js";
import V1EpochProofProposalApproval from "../validators/V1EpochProofProposalApproval.js";
import {networkMessageFactory} from "../../../../messages/network/v1/networkMessageFactory.js";
import { V1ProtocolError } from "../../../network/protocols/v1/V1ProtocolError.js";
import { ResultCode } from "../../../../utils/constants.js";
import b4a from "b4a";
import tracCryptoApi from "trac-crypto-api";
import { epochProofFromBuffer } from "./epochProposal/epochProofData.js";

// Minion interface to verify & sign proposals
class ConsensusEpochProofProposalOperationHandler {
    #v1EpochProofProposalRequestValidator;
    #v1EpochProofProposalResponseValidator;
    #state
    #wallet

    constructor(state, wallet, config) {
        this.#state = state;
        this.#wallet = wallet;
        this.#v1EpochProofProposalRequestValidator = new V1EpochProofProposalRequest(config);
        this.#v1EpochProofProposalResponseValidator = new V1EpochProofProposalApproval(config);
    }

    // leader requests approval to minion
    async handleRequest(message, connection) {
        try {
            this.applyRateLimit(connection);
            await this.#v1EpochProofProposalRequestValidator.validate(message, connection.remotePublicKey);
            await this.#validateDataHash(message.epoch_proof_proposal_request)
            const lastEpochProof = await this.#state.currentEpoch()
            const epochProof = epochProofFromBuffer(message.epoch_proof_proposal_request.data)
            
            this.#validatePreviousEpoch(epochProof, lastEpochProof)
            this.#validateVdf(epochProof)
        } catch (error) {
            this.displayError(
                "failed to process epoch proof proposal request from sender",
                connection.remotePublicKey,
                error
            );
        }

        try {
            const proposalHash = message.epoch_proof_proposal_request.hash
            const signature = this.#wallet.sign(proposalHash)
            const response = await this.#buildEpochResponse(message.id, connection.capabilities, signature)
            return await this.sendResponseAndMaybeClose(
                connection,
                response,
                false
            );
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
        const proposalHash = message.epoch_proof_proposal_request.hash
        const proofData = message.epoch_proof_proposal_request.data
        if (!b4a.equals(await tracCryptoApi.hash.blake3(proofData, proposalHash))) {
            throw new V1ProtocolError(ResultCode.INVALID_PAYLOAD, 'There is a hash mismatch for the proof');
        }
    }

    async #validatePreviousEpoch(proofData, previousEpoch) {
        if (!previousEpoch || proofData.epoch !== previousEpoch.data.epoch + 1) {
            throw new V1ProtocolError(ResultCode.INVALID_EPOCH, 'There is a mismatch between the proof and the last computed epoch');
        }
        
        if (proofData.protocolVersion !== previousEpoch.protocolVersion) {
            throw new V1ProtocolError(ResultCode.INVALID_EPOCH, 'There is a mismatch between the proof and the last computed epoch');
        }
        
        if (proofData.prevEpochHash !== previousEpoch.prevEpochHash) {
            throw new V1ProtocolError(ResultCode.INVALID_EPOCH, 'There is a mismatch between the proof and the last computed epoch');
        }
        
        if (proofData.networkId !== previousEpoch.networkId) {
            throw new V1ProtocolError(ResultCode.INVALID_EPOCH, 'There is a mismatch between the proof and the last computed epoch');
        }
        
        // TODO: check if more validations are required
        
        // if (proofData.commiteeHash !== previousEpoch.commiteeHash) {
        //     throw new V1ProtocolError(ResultCode.INVALID_EPOCH, 'There is a mismatch between the proof and the last computed epoch');
        // }
        
        // if (proofData.leaderId !== previousEpoch.leaderId) {
        //     throw new V1ProtocolError(ResultCode.INVALID_EPOCH, 'There is a mismatch between the proof and the last computed epoch');
        // }
        
        // if (proofData.vdfParamsHash !== previousEpoch.vdfParamsHash) {
        //     throw new V1ProtocolError(ResultCode.INVALID_EPOCH, 'There is a mismatch between the proof and the last computed epoch');
        // }
        
        // if (proofData.vdfOutput !== previousEpoch.vdfOutput) {
        //     throw new V1ProtocolError(ResultCode.INVALID_EPOCH, 'There is a mismatch between the proof and the last computed epoch');
        // }
    }

    async #validateVdf(proofData) {
        if (!proofData.vdfOutput) {
            throw new V1ProtocolError(ResultCode.INVALID_EPOCH, 'Inconsistent vdf data');
        }
    }

    async #buildEpochResponse(id, capabilities, signature) {
        try {
            return await networkMessageFactory(this.#wallet, this.config).buildEpochProofProposalResponse(
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
