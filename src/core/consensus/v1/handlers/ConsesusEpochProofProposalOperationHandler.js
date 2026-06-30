import V1EpochProofProposalRequest from "../validators/V1EpochProofProposalRequest.js";
import V1EpochProofProposalApproval from "../validators/V1EpochProofProposalApproval.js";
import { networkMessageFactory } from "../../../../messages/network/v1/networkMessageFactory.js";
import b4a from "b4a";
import { V1ProtocolError } from "../../../network/protocols/v1/V1ProtocolError.js";
import { getResultCode, V1ConsensusProtocolError } from "../V1ConsensusProtocolError.js"
import { ConsensusResultCode, NETWORK_CAPABILITIES, ResultCode } from "../../../../utils/constants.js";
import { consensusMessageFactory } from "../../../../messages/consensus/v1/consensusMessageFactory.js";
import { bufferToAddress } from "../../../state/utils/address.js";
import { verifyWesolowski } from "@tracsystems/trac-vdf";
import { publicKeyToAddress } from "../../../../utils/helpers.js";
import ConnectionOperationHandler from "../../../network/protocols/shared/ConnectionOperationHandler.js";
import ConsensusEpochProofProposalEventHandler from "./ConsensusEpochProofProposalEventHandler.js";

// Minion interface to verify & sign proposals

// Responsibilities:
// Validate -> close connections -> emit events to notify system-> send responses 

class ConsensusEpochProofProposalOperationHandler extends ConnectionOperationHandler {
    #proofProposalRequestValidator;
    #proofProposalApprovalValidator;
    #wallet;
    #state;
    #eventHandler;

    constructor(state, wallet, config) {
        super(config)
        this.#state = state;
        this.#wallet = wallet;
        this.#eventHandler = new ConsensusEpochProofProposalEventHandler(config);
        this.#proofProposalRequestValidator = new V1EpochProofProposalRequest(config);
        this.#proofProposalApprovalValidator = new V1EpochProofProposalApproval(config);
    }

    /**
     * Handles a leader's consensus v1 epoch proof proposal from the minion side.
     * @param {object} message Decoded consensus v1 message containing `proof_proposal` and `session_id`.
     * @param {object} connection P eer connection context used by the request validator.
     * @returns {Promise<object>} Signed consensus v1 proof proposal response.
     * @throws {V1ProtocolError|Error} If request validation or response building fails.
     */
    async handleRequest(message, connection) {
        const eventContext = this.#buildRequestEventContext(message, connection);
        await this.#eventHandler.onEpochProposalReceived(eventContext);

        let resultCode = ConsensusResultCode.OK;
        let validationError;
        let proofProposal;
        try {
            await this.#proofProposalRequestValidator.validate(message, connection);
            proofProposal = message.proof_proposal;
            await this.#eventHandler.onEpochProposalValidationSuccess({
                ...eventContext,
                resultCode,
                proofProposal
            });
        } catch (e) {
            validationError = e;
            resultCode = getResultCode(e);
            // TODO: In the event handler, add condition if INVALID_ADDRESS_ASSERTION, then blacklist specific remote address/pubKey
            await this.#eventHandler.onEpochProposalValidationFailure({
                ...eventContext,
                resultCode,
                error: validationError
            });
        }
        finally {
            await this.#sendEpochProofProposalApprovalResponse(message.session_id, connection, message.proof_proposal, resultCode);
        }
    }

    /**
     * Handles a minion's consensus v1 epoch proof proposal approval from the requester side.
     *
     * @param {object} message Decoded consensus v1 message containing `proof_proposal_response`.
     * @param {object} connection Peer connection context used by the response validator.
     * @param {object} proofProposal Original proof proposal used by the response validator.
     * @returns {Promise<{resultCode: number, approval?: object}>} Approval handling outcome.
     */

    async handleApproval(message, connection, proofProposal) {
        const eventContext = this.#buildApprovalEventContext(message, connection, proofProposal);
        await this.#eventHandler.onApprovalResponseReceived(eventContext); // NOTE: Maybe not needed. Investigate. For now, this will be only a placeholder

        let resultCode = ConsensusResultCode.OK;
        let approval;
        try {
            await this.#proofProposalApprovalValidator.validate(message, connection, proofProposal);
            approval = message.proof_proposal_response.approval;
        } catch (e) {
            resultCode = getResultCode(e);
            await this.#eventHandler.onApprovalResponseFailure({
                ...eventContext,
                resultCode,
                error: e
            });
            return { resultCode };
        }

        await this.#eventHandler.onApprovalResponseSuccess({
            ...eventContext,
            resultCode,
            approval
        });
        return { resultCode, approval };
    }

    #buildRequestEventContext(message, connection) {
        const remotePublicKey = connection?.remotePublicKey; // NOTE: Maybe should use address instead

        return {
            message,
            connection,
            sessionId: message?.session_id,
            remotePublicKey,
            remotePublicKeyHex: this.#toRemotePublicKeyHex(remotePublicKey)
        };
    }

    // TODO: This function is mostly copy-past from the one above. Refactor
    #buildApprovalEventContext(message, connection, proofProposal) {
        const remotePublicKey = connection?.remotePublicKey; // NOTE: Maybe should use address instead

        return {
            message,
            connection,
            sessionId: message?.session_id,
            remotePublicKey,
            remotePublicKeyHex: this.#toRemotePublicKeyHex(remotePublicKey),
            proofProposal
        };
    }

    #toRemotePublicKeyHex(remotePublicKey) {
        if (b4a.isBuffer(remotePublicKey)) return b4a.toString(remotePublicKey, 'hex');
        if (typeof remotePublicKey === 'string') return remotePublicKey.toLowerCase();
        return undefined;
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

    async #sendEpochProofProposalApprovalResponse(
        messageId,
        connection,
        proofProposal,
        resultCode
    ) {
        try {
            const response = await this.#buildProofProposalApproval(
                messageId,
                proofProposal,
                resultCode,
            );

            await this.sendResponseAndMaybeClose(
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
