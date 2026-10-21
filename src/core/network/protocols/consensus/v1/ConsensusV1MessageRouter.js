import { decodeConsensusMessage } from '../../../../../codecs/consensus/v1/consensusV1OperationCodec.js'
import b4a from 'b4a'
import { ConsensusOperationType, ConsensusResultCode, CONSENSUS_MESSAGE_MAX_BYTE_SIZE } from '../../../../../utils/constants.js'
import { publicKeyToAddress } from '../../../../../utils/helpers.js'
import V1EpochProofProposalOperationHandler from './handlers/V1EpochProofProposalOperationHandler.js'
import V1EpochAppendOperationHandler from './handlers/V1EpochAppendOperationHandler.js';
import { V1ConsensusProtocolError } from './V1ConsensusProtocolError.js';

class ConsensusV1MessageRouter {
    #config
    #connectionPolicy
    #epochProofProposalHandler
    #pendingRequestService
    #appendHandler;
    constructor(
        state,
        wallet,
        config,
        pendingRequestService,
        connectionPolicy,
        appenderSelector = null
    ) {
        this.#config = config
        this.#connectionPolicy = connectionPolicy;
        this.#epochProofProposalHandler = new V1EpochProofProposalOperationHandler(
            state,
            wallet,
            config,
            connectionPolicy
        );
        this.#pendingRequestService = pendingRequestService;
        this.#appendHandler = new V1EpochAppendOperationHandler(state, wallet, config, appenderSelector);
    }

    async route(incomingMessage, connection, protocolSession) {
        if (protocolSession.closed) return;

        if (!this.#preValidate(incomingMessage)) {
            this.#handleInvalidMessage(connection, protocolSession, 'Pre-validation failed for incoming Consensus V1 message')
            return;
        }
        let decodedMessage;

        try {
            decodedMessage = decodeConsensusMessage(incomingMessage)
        } catch (error) {
            this.#handleInvalidMessage(connection, protocolSession, `Failed to decode incoming Consensus V1 message: ${error.message}`)
            return;
        }

        // again in the next switch statement
        if (!decodedMessage || !Number.isInteger(decodedMessage.type) || decodedMessage.type <= 0) {
            this.#handleInvalidMessage(connection, protocolSession, `Invalid Consensus V1 message type: ${decodedMessage?.type}`)
            return;
        }

        let pendingRequest;
        try {
            switch (decodedMessage.type) {
                case ConsensusOperationType.REQUEST:
                    await this.#appendHandler.handleRequest(decodedMessage, connection, protocolSession);
                    break;
                case ConsensusOperationType.REPLY: {
                    const entry = this.#pendingRequestService.getPendingRequest(decodedMessage.session_id);
                    if (
                        !entry || entry.requestType !== ConsensusOperationType.REQUEST ||
                        entry.session !== protocolSession ||
                        entry.requestedTo !== b4a.toString(connection.remotePublicKey, 'hex')
                    ) {
                        break;
                    }
                    pendingRequest = entry;
                    const response = await this.#appendHandler.handleReply(
                        decodedMessage,
                        connection,
                        protocolSession,
                        entry.appendRequest
                    );
                    if (
                        response && !protocolSession.closed &&
                        this.#pendingRequestService.getPendingRequest(decodedMessage.session_id) === entry
                    ) {
                        this.#pendingRequestService.resolvePendingRequest(decodedMessage.session_id, response);
                    }
                    break;
                }
                case ConsensusOperationType.PROOF_PROPOSAL:
                    await this.#epochProofProposalHandler.handleRequest(decodedMessage, connection, protocolSession);
                    break;
                case ConsensusOperationType.PROOF_PROPOSAL_APPROVAL: {
                    const pendingEntry = this.#pendingRequestService.getPendingRequest(decodedMessage.session_id)
                    if (pendingEntry && pendingEntry.requestType !== ConsensusOperationType.PROOF_PROPOSAL) break;
                    const expectedPeer = pendingEntry?.requestedTo ? b4a.from(pendingEntry.requestedTo, 'hex') : null;
                    if (expectedPeer && !b4a.equals(expectedPeer, connection.remotePublicKey)) {
                        this.#handleInvalidMessage(connection, protocolSession, 'Consensus V1 message: approval received from unexpected peer')
                        break;
                    }
                    if (this.#connectionPolicy.shouldIgnoreApproval(pendingEntry, protocolSession)) break;

                    pendingRequest = pendingEntry;
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
                    this.#handleInvalidMessage(connection, protocolSession, `Unsupported Consensus V1 message type: ${decodedMessage.type}`)
            }
        } catch (error) {
            if (pendingRequest && this.#pendingRequestService.getPendingRequest(decodedMessage.session_id) === pendingRequest) {
                this.#pendingRequestService.rejectPendingRequest(decodedMessage.session_id, error);
            }
            const isArbitrationMessage = decodedMessage.type === ConsensusOperationType.REQUEST ||
                decodedMessage.type === ConsensusOperationType.REPLY;
            if (isArbitrationMessage && error instanceof V1ConsensusProtocolError && error.resultCode === ConsensusResultCode.EPOCH_INVALID) {
                return;
            }
            this.#logError(connection, `Unhandled error while routing Consensus V1 message: ${error.message}`)
        }
    }

    #preValidate(incomingMessage) {
        return !(!incomingMessage || !b4a.isBuffer(incomingMessage) || incomingMessage.length === 0 || incomingMessage.length > CONSENSUS_MESSAGE_MAX_BYTE_SIZE);
    }

    #handleInvalidMessage(connection, protocolSession, reason) {
        const sender = publicKeyToAddress(connection.remotePublicKey, this.#config);
        this.#connectionPolicy.handleInvalidMessage(protocolSession, `ConsensusV1MessageRouter: ${reason}, sender: ${sender}`);
    }

    #logError(connection, reason) {
        const sender = publicKeyToAddress(connection.remotePublicKey, this.#config)
        this.#connectionPolicy.handleLocalError(`ConsensusV1MessageRouter: ${reason}, sender: ${sender}`);
    }
}

export default ConsensusV1MessageRouter
