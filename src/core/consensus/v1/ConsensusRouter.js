import { decodeV1networkOperation } from '../../../codecs/network/v1/networkV1OperationCodec.js'
import b4a from 'b4a'
import { NetworkOperationType, V1_PROTOCOL_PAYLOAD_MAX_SIZE } from '../../../utils/constants.js'
import { publicKeyToAddress } from '../../../utils/helpers.js'
import V1EpochProofProposalOperationHandler from './handlers/ConsesusEpochProofProposalOperationHandler.js'

class ConsensusRouterV1 {
    #config
    #epochProofProposalHandler

    constructor(
        state,
        wallet,
        config
    ) {
        this.#config = config
        this.#epochProofProposalHandler = new V1EpochProofProposalOperationHandler(
            state,
            wallet,
            config
        );
    }

    async route(incomingMessage, connection) {
        if (!this.#preValidate(incomingMessage)) {
            this.#disconnect(connection, 'Pre-validation failed for incoming V1 message')
            return;
        }
        let decodedMessage;

        try {
            decodedMessage = decodeV1networkOperation(incomingMessage)
        } catch (error) {
            this.#disconnect(connection, `Failed to decode incoming V1 message: ${error.message}`)
            return;
        }

        // TODO: Decide if we really need to check decodedMessage.type here, since this is done
        // again in the next switch statement
        if (!decodedMessage || !Number.isInteger(decodedMessage.type) || decodedMessage.type <= 0) {
            this.#disconnect(connection, `Invalid V1 message type: ${decodedMessage?.type}`)
            return;
        }

        // We received a v1 message, so we set the connection protocol accordingly
        connection.protocolSession.setV1AsPreferredProtocol()

        try {
            switch (decodedMessage.type) {
                case NetworkOperationType.EPOCH_PROOF_PROPOSAL_REQUEST:
                    await this.#epochProofProposalHandler.handleRequest(decodedMessage, connection);
                    break;
                case NetworkOperationType.EPOCH_PROOF_PROPOSAL_RESPONSE:
                    await this.#epochProofProposalHandler.handleResponse(decodedMessage, connection);
                    break;
                default:
                    this.#disconnect(connection, `Unsupported V1 message type: ${decodedMessage.type}`)
            }
        } catch (error) {
            this.#disconnect(connection, `Unhandled error while routing V1 message: ${error.message}`)
        }
    }

    #preValidate(incomingMessage) {
        return !(!incomingMessage || !b4a.isBuffer(incomingMessage) || incomingMessage.length === 0 || incomingMessage.length > V1_PROTOCOL_PAYLOAD_MAX_SIZE);
    }

    #disconnect(connection, reason) {
        const sender = publicKeyToAddress(connection.remotePublicKey, this.#config)
        console.error(`NetworkMessageRouterV1: ${reason}, sender: ${sender}`)
        connection.end();
    }
}

export default ConsensusRouterV1
