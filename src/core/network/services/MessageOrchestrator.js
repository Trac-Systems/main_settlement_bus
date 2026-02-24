import { generateUUID, sleep } from '../../../utils/helpers.js';
import { operationToPayload } from '../../../utils/applyOperations.js';
import PeerWallet from "trac-wallet";
import b4a from "b4a";
import { networkMessageFactory } from "../../../messages/network/v1/networkMessageFactory.js";
import { NETWORK_CAPABILITIES } from "../../../utils/constants.js";
import {
    unsafeEncodeApplyOperation
} from "../../../utils/protobuf/operationHelpers.js";
import { normalizeMessageByOperationType } from "../../../utils/normalizers.js";
/**
 * MessageOrchestrator coordinates message submission, retry, and validator management.
 * It works with ConnectionManager and ledger state to ensure reliable message delivery.
 */
class MessageOrchestrator {
    #config;
    #wallet;
    /**
     * Attempts to send a message to validators with retries and state checks.
     * @param {ConnectionManager} connectionManager - The connection manager instance
     * @param {object} state - The state to look for the message outcome
     * @param {object} config - Configuration options:
     */
    constructor(connectionManager, state, config) {
        this.connectionManager = connectionManager;
        this.state = state;
        this.#config = config;
        this.#wallet = null;
    }

    setWallet(wallet) {
        this.#wallet = wallet;
    }

    /**
     * Sends a message to a single randomly selected connected validator.
     * @param {object} message - The message object to be sent
     * @returns {Promise<boolean>} - true if successful, false otherwise
     */

    async send(message) {
        const validatorPublicKey = this.connectionManager.pickRandomConnectedValidator();
        if (!validatorPublicKey) return false;
        console.log("Sending message to validator:", PeerWallet.encodeBech32m(this.#config.addressPrefix, b4a.from(validatorPublicKey, 'hex')));

        /* NOTE: Since the retry logic for Legacy is handled here, and is very unique to the protocol,
        * it was decided to not change MessageOrchestrator send method in the refactor to make protocols transparent.
        * As the Legacy protocol is going to be deprecated soon, it was decided to keep the retry logic 
        * here instead of abstracting it in the protocol implementation. 
        * If we were to abstract it, we would need to add protocol-specific logic in the ProtocolSession
        * or ProtocolInterface, which would make them less clean and more coupled with the specifics of the protocols.
        * The parts to be refactored in the future are marked with TODO comments.
        */

        // TODO: After Legacy is deprecated, we don't need to check preferred protocol here.
        const validatorConnection = this.connectionManager.getConnection(validatorPublicKey);
        const preferredProtocol = validatorConnection.protocolSession.preferredProtocol;

        if (preferredProtocol === validatorConnection.protocolSession.supportedProtocols.LEGACY) {
            return this.#attemptSendMessageForLegacy(validatorPublicKey, message);
        } else if (preferredProtocol === validatorConnection.protocolSession.supportedProtocols.V1) {
            // TODO: This is probably better placed inside the V1 protocol definition.
            // Both protocols should receive a 'canonical' message and solve the encodings internally
            // Refactor 
            const normalizedMessage = normalizeMessageByOperationType(message, this.#config)
            const encodedTransaction = unsafeEncodeApplyOperation(normalizedMessage)
            const v1Message = await networkMessageFactory(this.#wallet, this.#config)
                .buildBroadcastTransactionRequest(
                    generateUUID(),
                    encodedTransaction,
                    NETWORK_CAPABILITIES
                );

            return this.connectionManager.sendSingleMessage(v1Message, validatorPublicKey);
        }
        return false;
    }

    // TODO: Delete this function after legacy protocol is deprecated
    async #attemptSendMessageForLegacy(validatorPublicKey, message) {
        const startTime = Date.now();
        const deductedTxType = operationToPayload(message.type);
        let attempts = 0;
        while (attempts <= this.#config.maxRetries && Date.now() - startTime < this.#config.messageValidatorResponseTimeout) {
            await this.connectionManager.sendSingleMessage(message, validatorPublicKey);
            const appeared = await this.waitForUnsignedState(message[deductedTxType].tx, this.#config.messageValidatorRetryDelay);
            if (appeared) {
                this.incrementSentCount(validatorPublicKey);
                if (this.shouldRemove(validatorPublicKey)) {
                    this.connectionManager.remove(validatorPublicKey);
                }
                return true;
            }
            attempts++;
        }

        // If all retries fail, remove validator from pool
        this.connectionManager.remove(validatorPublicKey);
        return false;
    }

    async waitForUnsignedState(txHash, timeout) {
        // Polls state for the transaction hash for up to timeout ms
        const start = Date.now();
        let entry = null;
        while (Date.now() - start < timeout) {
            await sleep(200);
            entry = await this.state.get(txHash)
            if (entry) return true;
        }
        return false;
    }

    incrementSentCount(validatorPubKey) {
        this.connectionManager.incrementSentCount(validatorPubKey);
    }

    shouldRemove(validatorPubKey) {
        return this.connectionManager.getSentCount(validatorPubKey) >= this.#config.messageThreshold;
    }
}

export default MessageOrchestrator;
