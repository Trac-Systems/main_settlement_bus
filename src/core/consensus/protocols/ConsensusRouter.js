import { decodeConsensusMessage } from '../../../codecs/consensus/v1/consensusV1OperationCodec.js'
import b4a from 'b4a'
import { ConsensusOperationType, CONSENSUS_MESSAGE_MAX_BYTE_SIZE } from '../../../utils/constants.js'
import { publicKeyToAddress } from '../../../utils/helpers.js'
import { Logger } from '../../../utils/logger.js'
import ConsensusEpochProofProposalOperationHandler from '../v1/handlers/ConsesusEpochProofProposalOperationHandler.js'

class ConsensusRouterV1 {
    #config
    #logger
    #epochProofProposalHandler
    #pendingRequestService
    constructor(
        state,
        wallet,
        config,
        pendingRequestService
    ) {
        this.#config = config
        this.#logger = new Logger(config);
        this.#epochProofProposalHandler = new ConsensusEpochProofProposalOperationHandler(
            state,
            wallet,
            config,
        );
        this.#pendingRequestService = pendingRequestService;
    }

    async route(incomingMessage, connection, protocolSession) {
        if (protocolSession.closed) return;

        if (!this.#preValidate(incomingMessage)) {
            this.#closeConsensusChannel(connection, protocolSession, 'Pre-validation failed for incoming Consensus V1 message')
            return;
        }
        let decodedMessage;

        try {
            decodedMessage = decodeConsensusMessage(incomingMessage)
        } catch (error) {
            this.#closeConsensusChannel(connection, protocolSession, `Failed to decode incoming Consensus V1 message: ${error.message}`)
            return;
        }

        // again in the next switch statement
        if (!decodedMessage || !Number.isInteger(decodedMessage.type) || decodedMessage.type <= 0) {
            this.#closeConsensusChannel(connection, protocolSession, `Invalid Consensus V1 message type: ${decodedMessage?.type}`)
            return;
        }

        let pendingApproval;
        try {
            switch (decodedMessage.type) {
                case ConsensusOperationType.PROOF_PROPOSAL:
                    await this.#epochProofProposalHandler.handleRequest(decodedMessage, connection, protocolSession);
                    break;
                case ConsensusOperationType.PROOF_PROPOSAL_APPROVAL: {
                    const pendingEntry = this.#pendingRequestService.getPendingRequest(decodedMessage.session_id)
                    // Responses can arrive after a timeout or cancellation.
                    if (!pendingEntry) break;

                    const expectedPeer = pendingEntry.requestedTo ? b4a.from(pendingEntry.requestedTo, 'hex') : null;
                    if (expectedPeer && !b4a.equals(expectedPeer, connection.remotePublicKey)) {
                        this.#closeConsensusChannel(connection, protocolSession, 'Consensus V1 message: approval received from unexpected peer')
                        break;
                    }
                    if (pendingEntry.session && pendingEntry.session !== protocolSession) break;

                    pendingApproval = pendingEntry;
                    const response = await this.#epochProofProposalHandler.handleApproval(
                        decodedMessage,
                        connection,
                        protocolSession,
                        pendingEntry.proofProposal
                    );
                    // Validation may finish after this request was cancelled or replaced.
                    if (this.#pendingRequestService.getPendingRequest(decodedMessage.session_id) === pendingEntry) {
                        this.#pendingRequestService.resolvePendingRequest(decodedMessage.session_id, response);
                    }
                    break;
                }
                default:
                    this.#closeConsensusChannel(connection, protocolSession, `Unsupported Consensus V1 message type: ${decodedMessage.type}`)
            }
        } catch (error) {
            if (pendingApproval && this.#pendingRequestService.getPendingRequest(decodedMessage.session_id) === pendingApproval) {
                this.#pendingRequestService.rejectPendingRequest(decodedMessage.session_id, error);
            }
            this.#logError(connection, `Unhandled error while routing Consensus V1 message: ${error.message}`)
        }
    }

    #preValidate(incomingMessage) {
        return !(!incomingMessage || !b4a.isBuffer(incomingMessage) || incomingMessage.length === 0 || incomingMessage.length > CONSENSUS_MESSAGE_MAX_BYTE_SIZE);
    }

    #closeConsensusChannel(connection, protocolSession, reason) {
        this.#logError(connection, reason);
        protocolSession.close();
    }

    #logError(connection, reason) {
        const sender = publicKeyToAddress(connection.remotePublicKey, this.#config)
        this.#logger.error(`ConsensusRouterV1: ${reason}, sender: ${sender}`)
    }
}

export default ConsensusRouterV1
