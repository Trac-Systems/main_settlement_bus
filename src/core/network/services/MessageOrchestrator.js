import { sleep } from '../../../utils/helpers.js';

/**
 * MessageOrchestrator coordinates message submission, retry, and validator management.
 * It works with ConnectionManager and ledger state to ensure reliable message delivery.
 */
class MessageOrchestrator {
    /**
     * Attempts to send a message to validators with retries and state checks.
     * @param {ConnectionManager} connectionManager - The connection manager instance
     * @param {object} state - The state to look for the message outcome
     * @param {object} options - { messageThreshold: number, maxRetries: number, retryDelay: number (miliseconds), timeout: number (miliseconds) }
     * messageThreshold: How many successful sends before removing a validator from the pool
     * maxRetries: How many times to retry sending a message to a single validator
     * retryDelay: How long to wait between retries (ms)
     * timeout: Overall timeout for sending a message (ms)
     */
    constructor(connectionManager, state, options = {}) {
        this.connectionManager = connectionManager;
        this.state = state;
        // TODO: Adjust these default values or fetch them from config
        this.messageThreshold = options.messageThreshold || 1;
        this.maxRetries = options.maxRetries || 3; // Amount of retries for a single validator
        this.retryDelay = options.retryDelay || 1000; // How long to wait before retrying (ms)
        this.timeout = options.timeout || 3 * this.maxRetries * this.retryDelay;
    }

    /**
     * Sends a message to a single randomly selected connected validator.
     * @param {object} message - The message object to be sent
     * @returns {Promise<boolean>} - true if successful, false otherwise
     */
    async send(message) {
        const startTime = Date.now();
        while (Date.now() - startTime < this.timeout) {
            const validator = this.connectionManager.pickRandomConnectedValidator();
            if (!validator) return false;

            const success = await this.#attemptSendMessage(validator, message);
            if (success) {
                return true;
            }
        }
        return false;
    }

    async #attemptSendMessage(validator, message) {
        let attempts = 0;
        while (attempts < this.maxRetries) {
            this.connectionManager.sendSingleMessage(message, validator);

            const appeared = await this.waitForUnsignedState(message.tro.tx, this.retryDelay);
            if (appeared) {
                this.incrementSentCount(validator);
                if (this.shouldRemove(validator)) {
                    this.connectionManager.remove(validator);
                }
                return true;
            }
            attempts++;
        }

        // If all retries fail, remove validator from pool
        this.connectionManager.remove(validator);
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
        return this.connectionManager.getSentCount(validatorPubKey) >= this.messageThreshold;
    }
}

export default MessageOrchestrator;
