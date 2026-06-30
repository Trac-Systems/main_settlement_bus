import { decodeConsensusMessage } from '../../../codecs/consensus/v1/consensusV1OperationCodec.js'
import b4a from 'b4a'
import { ConsensusOperationType, CONSENSUS_MESSAGE_MAX_BYTE_SIZE } from '../../../utils/constants.js'
import { publicKeyToAddress } from '../../../utils/helpers.js'
import ConsensusEpochProofProposalOperationHandler from '../v1/handlers/ConsesusEpochProofProposalOperationHandler.js'

class ConsensusRouterV1 {
    #config
    #epochProofProposalHandler
    #pendingRequestService
    constructor(
        state,
        wallet,
        config,
        pendingRequestService
    ) {
        this.#config = config
        this.#epochProofProposalHandler = new ConsensusEpochProofProposalOperationHandler(
            state,
            wallet,
            config,
        );
        this.#pendingRequestService = pendingRequestService;
    }

    async route(incomingMessage, connection) {
        if (!this.#preValidate(incomingMessage)) {
            this.#disconnect(connection, 'Pre-validation failed for incoming V1 message')
            return;
        }
        let decodedMessage;

        try {
            decodedMessage = decodeConsensusMessage(incomingMessage)
        } catch (error) {
            this.#disconnect(connection, `Failed to decode incoming Consensus message: ${error.message}`)
            return;
        }

        // TODO: Decide if we really need to check decodedMessage.type here, since this is done
        // again in the next switch statement
        if (!decodedMessage || !Number.isInteger(decodedMessage.type) || decodedMessage.type <= 0) {
            this.#disconnect(connection, `Invalid V1 message type: ${decodedMessage?.type}`)
            return;
        }

        try {
            switch (decodedMessage.type) {
                case ConsensusOperationType.PROOF_PROPOSAL:
                    await this.#epochProofProposalHandler.handleRequest(decodedMessage, connection);
                    break;
                case ConsensusOperationType.PROOF_PROPOSAL_APPROVAL:
                    const proofProposal = this.#pendingRequestService.getPendingRequest(decodedMessage.session_id)
                    if (!proofProposal) {
                        // TODO ; do something if falsy - this means that message is not stored in the pendingRequestService
                    }
                    await this.#epochProofProposalHandler.handleApproval(decodedMessage, connection, proofProposal);
                    break;
                default:
                    this.#disconnect(connection, `Unsupported V1 message type: ${decodedMessage.type}`)
            }
        } catch (error) {
            this.#disconnect(connection, `Unhandled error while routing V1 message: ${error.message}`)
        }
    }

    #preValidate(incomingMessage) {
        return !(!incomingMessage || !b4a.isBuffer(incomingMessage) || incomingMessage.length === 0 || incomingMessage.length > CONSENSUS_MESSAGE_MAX_BYTE_SIZE);
    }

    #disconnect(connection, reason) {
        const sender = publicKeyToAddress(connection.remotePublicKey, this.#config)
        console.error(`NetworkMessageRouterV1: ${reason}, sender: ${sender}`)
        connection.end();
    }
}

export default ConsensusRouterV1
