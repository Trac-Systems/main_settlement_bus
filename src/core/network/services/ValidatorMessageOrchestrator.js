import { generateUUID, publicKeyToAddress } from '../../../utils/helpers.js';
import { operationToPayload } from '../../../utils/applyOperations.js';
import { networkMessageFactory } from "../../../messages/network/v1/networkMessageFactory.js";
import { NETWORK_CAPABILITIES, NetworkResultCode } from "../../../utils/constants.js";
import {
    unsafeEncodeApplyOperation
} from "../../../codecs/apply/applyOperationCodec.js";
import { normalizeMessageByOperationType } from "../../../utils/normalizers.js";
import { resultToValidatorAction, SENDER_ACTION } from "../protocols/validators/v1/connectionPolicies.js";
import { isPeerConnectionError } from '../shared/PeerConnectionManager.js';
/**
 * ValidatorMessageOrchestrator coordinates message submission, retry, and validator management.
 * It works with ValidatorConnectionManager and ledger state to ensure reliable message delivery.
 */
class ValidatorMessageOrchestrator {
    #config;
    #wallet;
    #idempotentSuccessCodes = new Set([
        NetworkResultCode.RESULT_CODE_TX_ALREADY_EXISTS,
        NetworkResultCode.RESULT_CODE_OPERATION_ALREADY_COMPLETED,
    ]);
    /**
     * Attempts to send a message to validators with retries and state checks.
     * @param {ValidatorConnectionManager} validatorConnectionManager - The connection manager instance
     * @param {object} state - The state to look for the message outcome
     * @param {Config} config - Configuration options:
     */
    constructor(validatorConnectionManager, state, config, wallet) {
        this.validatorConnectionManager = validatorConnectionManager;
        this.state = state;
        this.#config = config;
        this.#wallet = wallet;
    }

    /**
     * Picks a validator for an outgoing message while avoiding requester self-validation.
     *
     * ValidatorObserverService already prevents connecting to the local node itself.
     * This method handles a different case: for a given message, we avoid selecting
     * a validator whose address equals `message.address` (requester), because
     * validator-side checks reject that flow.
     *
     * @param {object} [message] Outgoing operation payload.
     * @param {string} [message.address] Requester address (bech32m).
     * @returns {Promise<string|null>} Selected validator public key hex, or null when unavailable.
     */
    async #pickValidatorForMessage(message) {
        const requesterAddress = message?.address;

        if (!requesterAddress) return null
        
        const connected = this.validatorConnectionManager.connectedPeers();
        if (!Array.isArray(connected) || connected.length === 0) {
            return null;
        }

        const eligible = connected.filter((publicKey) => {
            return publicKeyToAddress(publicKey, this.#config) !== requesterAddress;
        });

        const pool = [...(eligible.length > 0 ? eligible : connected)];
        while (pool.length > 0) {
            const index = Math.floor(Math.random() * pool.length);
            const [publicKey] = pool.splice(index, 1);
            const address = publicKeyToAddress(publicKey, this.#config);
            if (await this.state.isValidatorAddress(address)) return publicKey;
            this.validatorConnectionManager.remove(publicKey);
        }
        return null;
    }

    /**
     * Sends a message to a single randomly selected connected validator.
     * @param {object} message - The message object to be sent
     * @param retries - The current retry count for this message
     * @returns {Promise<boolean>} - true if successful, false otherwise
     */
    async send(message, retries = 0) {
        if (retries > this.#config.maxRetries) {
            console.warn(`ValidatorMessageOrchestrator: Max retries reached for message ${JSON.stringify(message)}. Aborting send.`);
            return false;
        }

        const validatorPublicKey = await this.#pickValidatorForMessage(message);
        if (!validatorPublicKey) return false;
        console.log("Sending message to validator:", publicKeyToAddress(validatorPublicKey, this.#config));

        const validatorConnection = this.validatorConnectionManager.getConnection(validatorPublicKey);
        if (!validatorConnection) return this.send(message, retries + 1);
        const { preferredProtocol, supportedProtocols } = validatorConnection.protocolSessions.validator;

        if (preferredProtocol === supportedProtocols.LEGACY) {
            try {
                if (await this.#attemptSendMessageForLegacy(validatorPublicKey, validatorConnection, message)) return true;
            } catch {
                const sent = await this.send(message, retries + 1);
                if (!sent) this.validatorConnectionManager.remove(validatorPublicKey, validatorConnection);
                return sent;
            }
            this.validatorConnectionManager.remove(validatorPublicKey, validatorConnection);
            return this.send(message, retries + 1);
        }

        if (preferredProtocol !== supportedProtocols.V1) return false;

        const normalizedMessage = normalizeMessageByOperationType(message, this.#config);
        const encodedTransaction = unsafeEncodeApplyOperation(normalizedMessage);
        const v1Message = await networkMessageFactory(this.#wallet, this.#config)
            .buildBroadcastTransactionRequest(generateUUID(), encodedTransaction, NETWORK_CAPABILITIES);

        // Signing is asynchronous; a replacement may use a different protocol.
        if (this.validatorConnectionManager.getConnection(validatorPublicKey) !== validatorConnection) {
            return this.send(message, retries + 1);
        }

        try {
            const resultCode = await this.validatorConnectionManager.sendSingleMessage(v1Message, validatorPublicKey);
            if (await this.#isIdempotentSuccess(resultCode, message)) return true;

            const action = resultToValidatorAction(resultCode);
            if (action === SENDER_ACTION.SUCCESS) {
                this.#recordSuccessfulSend(validatorPublicKey, validatorConnection);
                return true;
            }
            if (action === SENDER_ACTION.NO_ROTATE) return false;

            this.validatorConnectionManager.remove(validatorPublicKey, validatorConnection);
            if (action !== SENDER_ACTION.ROTATE) {
                console.warn(`ValidatorMessageOrchestrator: Unknown result code ${resultCode} from validator ${validatorPublicKey}`);
            }
            return false;
        } catch (error) {
            if (isPeerConnectionError(error)) {
                console.warn(`ValidatorMessageOrchestrator: Connection Error: ${error.message}`);
            } else {
                this.validatorConnectionManager.remove(validatorPublicKey, validatorConnection);
            }
            return this.send(message, retries + 1);
        }
    }

    /**
     * Determines whether a non-OK result code should be treated as a success due to idempotency.
     *
     * This handles the retry scenario where a requester did not receive or accept the response
     * from the first validator that committed the transaction. On retry, a second validator may
     * return TX_ALREADY_EXISTS or OPERATION_ALREADY_COMPLETED because the tx was already
     * processed. Those codes are not errors — they confirm the operation succeeded.
     *
     * To safely treat these as success, we check whether the local unsigned state for the tx
     * has been committed. This ensures we only acknowledge idempotent success when the state
     * change is actually observable locally, not just because the result code matched.
     */
    async #isIdempotentSuccess(resultCode, message) {
        if (!this.#idempotentSuccessCodes.has(resultCode)) return false;

        const txHash = this.#extractTxHash(message);
        if (!txHash) return false;

        // A short wait covers the race where a first validator committed the tx
        // and a retried validator only observes it as "already exists/completed".
        const timeout = this.#config.messageValidatorResponseTimeout ?? 2000;
        return await this.waitForUnsignedState(txHash, timeout);
    }

    async waitForUnsignedState(txHash, timeout) {
        return this.state.waitForUnsigned(txHash, timeout);
    }

    #extractTxHash(message) {
        if (!message || !Number.isInteger(message.type)) return null;

        const payloadKey = operationToPayload(message.type);
        const txHash = message?.[payloadKey]?.tx;
        return typeof txHash === 'string' && txHash.length > 0 ? txHash : null;
    }

    // TODO: Delete this function after legacy protocol is deprecated
    async #attemptSendMessageForLegacy(validatorPublicKey, validatorConnection, message) {
        const deductedTxType = operationToPayload(message.type);
        await this.validatorConnectionManager.sendSingleMessage(message, validatorPublicKey);
        const appeared = await this.state.waitForUnsigned(
            message[deductedTxType].tx,
            this.#config.messageValidatorResponseTimeout
        );
        if (appeared) {
            this.#recordSuccessfulSend(validatorPublicKey, validatorConnection);
            return true;
        }
        return false;
    }

    #recordSuccessfulSend(publicKey, connection) {
        // A late response belongs to the transport that sent the request.
        if (this.validatorConnectionManager.getConnection(publicKey) !== connection) return;
        this.incrementSentCount(publicKey);
        if (this.shouldRemove(publicKey)) {
            this.validatorConnectionManager.remove(publicKey, connection);
        }
    }

    incrementSentCount(validatorPubKey) {
        this.validatorConnectionManager.incrementSentCount(validatorPubKey);
    }

    shouldRemove(validatorPubKey) {
        return this.validatorConnectionManager.getSentCount(validatorPubKey) >= this.#config.messageThreshold;
    }
}

export default ValidatorMessageOrchestrator;
