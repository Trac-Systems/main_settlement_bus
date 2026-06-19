import V1EpochProofProposalRequest from "../validators/V1EpochProofProposalRequest.js";
import V1EpochProofProposalResponse from "../validators/V1EpochProofProposalResponse.js";
import {consensusMessageFactory} from "../../../../messages/consensus/v1/consensusMessageFactory.js";
import { V1ProtocolError } from "../../../network/protocols/v1/V1ProtocolError.js";
import { CustomEventType, ResultCode, ConsensusResultCode } from "../../../../utils/constants.js";
import b4a from "b4a";
import {publicKeyToAddress} from "../../../../utils/helpers.js";
import { bufferToAddress } from '../../../../core/state/utils/address.js';
import { safeDecodeProofProposal } from '../../../../codecs/consensus/v1/consensusV1OperationCodec.js';

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
        const entry = this.#pendingRequestService.getPendingRequest(message.session_id);
        if (!entry) return false;

        this.#pendingRequestService.stopPendingRequestTimeout(message.session_id);
        await validator.validate(message, connection, entry);
        const result = extractResult(message);
        this.#pendingRequestService.resolvePendingRequest(message.session_id, result);
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

            const lastEpochProofBuffer = await this.#state.currentEpoch();
            const lastEpochProof = lastEpochProofBuffer ? safeDecodeProofProposal(lastEpochProofBuffer) : null;

            await this.#validatePreviousEpoch(message.proof_proposal, lastEpochProof);
            await this.#validateVdf(message.proof_proposal);
            await this.#state.emit(CustomEventType.EPOCH_PROPOSAL_SUBMITTED);
        } catch (error) {
            this.displayError(
                "failed to process epoch proof proposal request from sender",
                connection.remotePublicKey,
                error
            );
            try {
                const errorResponse = await this.#buildEpochResponse(message, ConsensusResultCode.UNSPECIFIED);
                connection.consensusProtocolSession.sendAndForget(errorResponse);
            } catch (_) {}
            return;
        }

        try {
            const response = await this.#buildEpochResponse(message);
            connection.consensusProtocolSession.sendAndForget(response);
        } catch (error) {
            this.displayError(
                "failed to build/send epoch proof proposal response to sender",
                connection.remotePublicKey,
                error
            );
        }
    }

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
                message.session_id,
                connection,
                error,
                "Failed to process epoch proof proposal response from sender"
            );
        }
    }

    #extractEpochProofProposalResponse(payload) {
        return {
            code: payload.proof_proposal_response.result,
            result: {
                approver: payload.proof_proposal_response.approval.approver,
                approval_sig: payload.proof_proposal_response.approval.approval_sig
            }
        };
    }

    async #validatePreviousEpoch(proposal, previousEpoch) {
        const proposalEpoch = Number(proposal.epoch.readBigUInt64BE());
        const prevEpoch = Number(previousEpoch?.epoch?.readBigUInt64BE?.() ?? -1);
        if (!previousEpoch || proposalEpoch !== prevEpoch + 1) {
            throw new V1ProtocolError(ResultCode.INVALID_PAYLOAD, 'Epoch sequence mismatch');
        }
        if (!b4a.equals(proposal.protocol_version, previousEpoch.protocol_version)) {
            throw new V1ProtocolError(ResultCode.INVALID_PAYLOAD, 'Protocol version mismatch');
        }
        const expectedPrevHash = await this.#state.getEpochHash(prevEpoch);
        if (!expectedPrevHash || !b4a.equals(proposal.previous_epoch_record_hash, expectedPrevHash)) {
            throw new V1ProtocolError(ResultCode.INVALID_PAYLOAD, 'Previous epoch hash mismatch');
        }
        if (!b4a.equals(proposal.network_id, previousEpoch.network_id)) {
            throw new V1ProtocolError(ResultCode.INVALID_PAYLOAD, 'Network id mismatch');
        }
    }

    async #validateVdf(proposal) {
        if (!proposal.vdf_proof || !b4a.isBuffer(proposal.vdf_proof) || proposal.vdf_proof.length === 0) {
            throw new V1ProtocolError(ResultCode.INVALID_PAYLOAD, 'Inconsistent vdf data');
        }
        const { verifyWesolowski } = await import('@tracsystems/trac-vdf');
        const proof = Buffer.concat([proposal.vdf_parameters_hash, proposal.vdf_proof]);
        const isValid = verifyWesolowski(
            proposal.previous_epoch_record_hash,
            this.#config.vdfDifficulty,
            proof,
            this.#config.vdfDiscriminantSizeBits
        );
        if (!isValid) {
            throw new V1ProtocolError(ResultCode.INVALID_PAYLOAD, 'VDF verification failed');
        }
    }

    async #buildEpochResponse(message, resultCode = ConsensusResultCode.OK) {
        const p = message.proof_proposal;
        try {
            return await consensusMessageFactory(this.#wallet, this.#config).buildProofProposalResponse(
                message.session_id,
                p.network_id.readUInt16BE(0),
                Number(p.epoch.readBigUInt64BE()),
                p.previous_epoch_record_hash,
                bufferToAddress(p.proposer, this.#config.addressPrefix),
                p.vdf_parameters_hash,
                p.vdf_proof,
                p.signature,
                resultCode,
                this.#wallet.address
            );
        } catch (error) {
            throw new V1ProtocolError(ResultCode.UNEXPECTED_ERROR, `Failed to build proof proposal response: ${error.message}`);
        }
    }
}

export default ConsensusEpochProofProposalOperationHandler;
