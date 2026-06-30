import V1EpochProofProposalRequest from "../validators/V1EpochProofProposalRequest.js";
import V1EpochProofProposalApproval from "../validators/V1EpochProofProposalApproval.js";
import {networkMessageFactory} from "../../../../messages/network/v1/networkMessageFactory.js";
import b4a from "b4a";
import { V1ProtocolError } from "../../../network/protocols/v1/V1ProtocolError.js";
import {getResultCode, V1ConsensusProtocolError} from "../V1ConsensusProtocolError.js"
import {ConsensusResultCode, NETWORK_CAPABILITIES, ResultCode} from "../../../../utils/constants.js";
import { consensusMessageFactory } from "../../../../messages/consensus/v1/consensusMessageFactory.js";
import { bufferToAddress } from "../../../state/utils/address.js";
import { verifyWesolowski } from "@tracsystems/trac-vdf";
import {publicKeyToAddress} from "../../../../utils/helpers.js";
import ConnectionOperationHandler from "../../../network/protocols/shared/ConnectionOperationHandler.js";

// Minion interface to verify & sign proposals

// Responsibilities:
// Validate -> close connections -> emit events to notify system-> send responses 

class ConsensusEpochProofProposalOperationHandler extends ConnectionOperationHandler{
    #proofProposalRequestValidator;
    #proofProposalApprovalValidator;
    #wallet;
    #state;

    constructor(state, wallet, config) {
        super(config)
        this.#state = state;
        this.#wallet = wallet;
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
        // TODO:  -- emit event "epoch_proposal_received"
        let resultCode = ConsensusResultCode.OK;
        try {
            await this.#proofProposalRequestValidator.validate(message, connection);
            //TODO:  -- emit event "epoch_proposal_validation_success"
        } catch (e) {
            resultCode = getResultCode(e);
            //TODO: -- emit event "epoch_proposal_validation_failure"
            // TODO: Add condition if INVALID_ADDRESS_ASSERTION then blacklist specific remogePublicKey
        } finally {
            await this.#sendEpochProofProposalApprovalResponse(message.session_id, connection, message.proof_proposal, resultCode);
        }
    }

    /**
     * Handles a minion's consensus v1 epoch proof proposal approval from the requester side.
     *
     * @param {object} message Decoded consensus v1 message containing `proof_proposal_response`.
     * @param {object} connection Peer connection context used by the response validator.
     * @param proofProposal
     * @returns {Promise<object>} Validated proof proposal approval.
     * @throws {V1ProtocolError|Error} If response validation fails.
     */

    async handleApproval(message, connection, proofProposal) {
        // TODO:  emit event "received_response" (maybe not necessary)
        let resultCode = ConsensusResultCode.OK;
        try {
            await this.#proofProposalApprovalValidator.validate(message, connection, proofProposal);
            const approval = message.proof_proposal_response.approval;
            // TODO:  emit event "response_success" , include  result code and approval
        } catch (e) {
            resultCode = getResultCode(e);
            // TODO:  emit event "response_failure" include result code without approval because this is invalid
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
