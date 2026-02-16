import { generateUUID, sleep } from '../../../utils/helpers.js';
import { operationToPayload } from '../../../utils/applyOperations.js';
import PeerWallet from "trac-wallet";
import b4a from "b4a";
import {networkMessageFactory} from "../../../messages/network/v1/networkMessageFactory.js";
import {NETWORK_CAPABILITIES} from "../../../utils/constants.js";
import {
    safeDecodeApplyOperation,
    safeEncodeApplyOperation,
    unsafeEncodeApplyOperation
} from "../../../utils/protobuf/operationHelpers.js";
import {normalizeMessageByOperationType} from "../../../utils/normalizers.js";
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

        const validatorConnection = this.connectionManager.getConnection(validatorPublicKey);
        const preferredProtocol = validatorConnection.protocolSession.preferredProtocol;

        if (preferredProtocol === validatorConnection.protocolSession.supportedProtocols.LEGACY) {

            const startTime = Date.now();
            while (Date.now() - startTime < this.#config.messageValidatorResponseTimeout) {
                const success = await this.#attemptSendMessageForLegacy(validatorPublicKey, message);
                if (success) {
                    return true;
                }

            }

        } else if (preferredProtocol === validatorConnection.protocolSession.supportedProtocols.V1) {
            const normalizedMessage = normalizeMessageByOperationType(message, this.#config)
            const encodedTransaction = unsafeEncodeApplyOperation(normalizedMessage)
            const v1Message = await networkMessageFactory(this.#wallet, this.#config)
                .buildBroadcastTransactionRequest(
                    generateUUID(),
                    encodedTransaction,
                    NETWORK_CAPABILITIES
                );

            const success = await this.#attemptSendMessageForV1(validatorPublicKey, v1Message);
            if (success) {
                return true;
            }
        }
        return false;
    }

    async #attemptSendMessageForV1(validator, message) {
        return this.connectionManager.sendSingleMessage(message, validator);
    }

    async #attemptSendMessageForLegacy(validatorPublicKey, message) {
        let attempts = 0;
        const deductedTxType = operationToPayload(message.type);
        while (attempts <= this.#config.maxRetries) {
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
