import V1EpochProofProposalRequest from "../validators/V1EpochProofProposalRequest.js";
import V1EpochProofProposalApproval from "../validators/V1EpochProofProposalApproval.js";
import { getResultCode } from "../V1ConsensusProtocolError.js"
import { ConsensusResultCode, CustomEventType } from "../../../../utils/constants.js";
import { consensusMessageFactory } from "../../../../messages/consensus/v1/consensusMessageFactory.js";
import { bufferToAddress } from "../../../state/utils/address.js"
import ConnectionOperationHandler from "../../../network/protocols/shared/ConnectionOperationHandler.js";


class ConsensusEpochProofProposalOperationHandler extends ConnectionOperationHandler {
    #proofProposalRequestValidator;
    #proofProposalApprovalValidator;
    #wallet;
    #state;

    constructor(state, wallet, config) {
        super(config)
        this.#state = state;
        this.#wallet = wallet;
        this.#proofProposalRequestValidator = new V1EpochProofProposalRequest(config, state);
        this.#proofProposalApprovalValidator = new V1EpochProofProposalApproval(config, state);
    }

    /**
     * Handles a leader's consensus v1 epoch proof proposal from the minion side.
     * @param {object} message Decoded consensus v1 message containing `proof_proposal` and `session_id`.
     * @param {object} connection Peer connection context used by the request validator.
     * @returns {Promise<void>} Resolves after sending a signed consensus v1 proof proposal response.
     */
    async handleRequest(message, connection, protocolSession) {
        const eventContext = this.#buildRequestEventContext(message, connection);
        this.#emitEvent(CustomEventType.EPOCH_PROPOSAL_RECEIVED, eventContext);

        let resultCode = ConsensusResultCode.OK;
        let validationError;
        let proofProposal;
        try {
            await this.#proofProposalRequestValidator.validate(message, connection);
            proofProposal = message.proof_proposal;
            this.#emitEvent(CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS, {
                ...eventContext,
                resultCode,
                proofProposal
            });
        } catch (e) {
            validationError = e;
            resultCode = getResultCode(e);
            // TODO: If INVALID_ADDRESS_ASSERTION is introduced, blacklist the specific remote address/pubKey.
            this.#emitEvent(CustomEventType.EPOCH_PROPOSAL_VALIDATION_FAILURE, {
                ...eventContext,
                resultCode,
                error: validationError
            });
        }
        finally {
            await this.#sendEpochProofProposalApprovalResponse(
                message?.session_id,
                connection,
                protocolSession,
                message,
                resultCode
            );
        }
    }

    /**
     * Handles a minion's consensus v1 epoch proof proposal approval from the requester side.
     *
     * @param {object} message Decoded consensus v1 message containing `proof_proposal_response`.
     * @param {object} connection Peer connection context used by the response validator.
     * @param {object} proofProposal Original proof proposal used by the response validator.
     * @returns {Promise<{resultCode: number, approval?: object}>} Approval handling outcome with a ConsensusResultCode value.
     */

    async handleApproval(
        message,
        connection,
        _protocolSession,
        proofProposal
    ) {
        const eventContext = this.#buildApprovalEventContext(message, connection, proofProposal);
        this.#emitEvent(CustomEventType.EPOCH_PROPOSAL_APPROVAL_RECEIVED, eventContext); // NOTE: Maybe not needed. Investigate. For now, this will be only a placeholder

        let resultCode = ConsensusResultCode.OK;
        let approval;
        try {
            await this.#proofProposalApprovalValidator.validate(message, connection, proofProposal);
            approval = message.proof_proposal_response.approval;
        } catch (e) {
            resultCode = getResultCode(e);
            this.#emitEvent(CustomEventType.EPOCH_PROPOSAL_APPROVAL_FAILURE, {
                ...eventContext,
                resultCode,
                error: e
            });
            return { resultCode };
        }

        this.#emitEvent(CustomEventType.EPOCH_PROPOSAL_APPROVAL_SUCCESS, {
            ...eventContext,
            resultCode,
            approval
        });
        return { resultCode, approval };
    }

    #buildRequestEventContext(message, connection) {
        const remotePublicKey = connection?.remotePublicKey;

        return {
            message,
            connection,
            sessionId: message?.session_id,
            remotePublicKey,
        };
    }

    // TODO: This function is mostly copy-past from the one above. Refactor
    #buildApprovalEventContext(message, connection, proofProposal) {
        const remotePublicKey = connection?.remotePublicKey;

        return {
            message,
            connection,
            sessionId: message?.session_id,
            remotePublicKey,
            proofProposal
        };
    }

    #emitEvent(eventName, context) {
        try {
            this.#state.emit(eventName, context);
        } catch (error) {
            this.displayError(`failed to emit ${eventName}`, context?.remotePublicKey, error);
        }
    }

    async #buildProofProposalApproval(sessionId, proofProposal, resultCode) {
        const proposer = bufferToAddress(proofProposal.proposer, this.config.addressPrefix);

        // TODO: In here we are basically getting some fields represented as buffers from
        // the received proofProposal, converting them to numbers, just to convert them
        // back to buffers internally. This should be optimized
        return await consensusMessageFactory(this.#wallet, this.config).buildProofProposalResponse(
            sessionId,
            proofProposal.network_id.readUInt16BE(0),
            proofProposal.epoch.readBigUInt64BE(0),
            proofProposal.previous_epoch_record_hash,
            proposer,
            proofProposal.vdf_parameters_hash,
            proofProposal.vdf_proof,
            proofProposal.signature,
            resultCode,
            this.#wallet.address
        );
    }

    async #buildProofProposalRejection(sessionId, resultCode) {
        return await consensusMessageFactory(this.#wallet, this.config).buildProofProposalRejectionResponse(
            sessionId,
            resultCode
        );
    }

    #isValidResponseSessionId(sessionId) {
        return typeof sessionId === 'string' && sessionId.length > 0 && sessionId.length <= 64;
    }

    async #sendEpochProofProposalApprovalResponse(
        messageId,
        connection,
        protocolSession,
        message,
        resultCode
    ) {
        try {
            if (!this.#isValidResponseSessionId(messageId)) {
                connection.end();
                return;
            }

            const response = resultCode === ConsensusResultCode.OK
                ? await this.#buildProofProposalApproval(
                    messageId,
                    message.proof_proposal,
                    resultCode,
                )
                : await this.#buildProofProposalRejection(
                    messageId,
                    resultCode
                );

            await this.sendResponseAndMaybeClose(
                protocolSession,
                connection,
                response,
            );

        } catch (error) {
            this.displayError(
                "failed to build/send response to sender",
                connection.remotePublicKey,
                error
            );
            connection.end();
        }
    }

}

export default ConsensusEpochProofProposalOperationHandler;
