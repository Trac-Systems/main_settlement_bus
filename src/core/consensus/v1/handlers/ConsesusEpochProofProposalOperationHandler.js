import V1EpochProofProposalRequest from "../validators/V1EpochProofProposalRequest.js";
import V1EpochProofProposalApproval from "../validators/V1EpochProofProposalApproval.js";
import { getResultCode } from "../V1ConsensusProtocolError.js"
import { ConsensusResultCode, CustomEventType } from "../../../../utils/constants.js";
import { consensusMessageFactory } from "../../../../messages/consensus/v1/consensusMessageFactory.js";
import { bufferToAddress } from "../../../state/utils/address.js"
import ConnectionOperationHandler from "../../../network/protocols/shared/ConnectionOperationHandler.js";
import { shouldBanConsensusPeer, handleInvalidConsensusMessage, handleConsensusLocalError } from "../../ConsensusPeerPolicy.js";
import { Logger } from "../../../../utils/logger.js";
import { publicKeyToAddress } from "../../../../utils/helpers.js";


class ConsensusEpochProofProposalOperationHandler extends ConnectionOperationHandler {
    #proofProposalRequestValidator;
    #proofProposalApprovalValidator;
    #wallet;
    #state;
    #logger;

    constructor(state, wallet, config) {
        super(config)
        this.#state = state;
        this.#wallet = wallet;
        this.#logger = new Logger(config);
        this.#proofProposalRequestValidator = new V1EpochProofProposalRequest(config, state);
        this.#proofProposalApprovalValidator = new V1EpochProofProposalApproval(config, state);
    }

    /**
     * Handles a leader's consensus v1 epoch proof proposal from the minion side.
     * @param {object} message Decoded consensus v1 message containing `proof_proposal` and `session_id`.
     * @param {object} connection Peer connection context used by the request validator.
     * @param protocolSession Protocol session context used by the request validator.
     * @returns {Promise<void>} Resolves after responding, unless the consensus session is closed or the peer is banned.
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
            this.#emitEvent(CustomEventType.EPOCH_PROPOSAL_VALIDATION_FAILURE, {
                ...eventContext,
                resultCode,
                error: validationError
            });
        }
        finally {
            // Network bans and disconnects this peer when it receives the failure event.
            if (!shouldBanConsensusPeer(validationError)) {
                await this.#sendEpochProofProposalApprovalResponse(
                    message?.session_id,
                    connection,
                    protocolSession,
                    message,
                    resultCode
                );
            }
        }
    }

    /**
     * Handles a minion's consensus v1 epoch proof proposal approval from the requester side.
     *
     * Failure events include `error` only for locally detected validation failures;
     * authenticated peer rejections carry their result code without an error.
     *
     * @param {object} message Decoded consensus v1 message containing `proof_proposal_response`.
     * @param {object} connection Peer connection context used by the response validator.
     * @param _protocolSession Protocol session context used by the response validator.
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

        let result;
        try {
            result = await this.#proofProposalApprovalValidator.validate(message, connection, proofProposal);
        } catch (error) {
            const resultCode = getResultCode(error);
            this.#emitEvent(CustomEventType.EPOCH_PROPOSAL_APPROVAL_FAILURE, {
                ...eventContext,
                resultCode,
                error: error
            });
            return { resultCode };
        }

        const event = result.resultCode === ConsensusResultCode.OK
            ? CustomEventType.EPOCH_PROPOSAL_APPROVAL_SUCCESS
            : CustomEventType.EPOCH_PROPOSAL_APPROVAL_FAILURE;

        this.#emitEvent(event, {
            ...eventContext,
            ...result
        });
        return result;
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
            proofProposal.difficulty,
            proofProposal.discriminant_bit_size,
            proofProposal.proof,
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
            if (protocolSession.closed) return;
            if (!this.#isValidResponseSessionId(messageId)) {
                const sender = publicKeyToAddress(connection.remotePublicKey, this.config);
                handleInvalidConsensusMessage(protocolSession, this.#logger, `${this.constructor.name}: invalid Consensus V1 message session_id, sender: ${sender}`);
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

            if (!protocolSession.closed) protocolSession.sendAndForget(response);

        } catch (error) {
            this.displayError(
                "failed to build/send response to sender",
                connection.remotePublicKey,
                error
            );
        }
    }

    displayError(step, senderPublicKey, error) {
        const sender = publicKeyToAddress(senderPublicKey, this.config);
        handleConsensusLocalError(this.#logger, `${this.constructor.name}: Consensus V1 message ${step}, sender: ${sender}: ${error?.message ?? 'Unexpected error'}`);
    }

}

export default ConsensusEpochProofProposalOperationHandler;
