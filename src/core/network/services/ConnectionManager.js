import b4a from 'b4a'
import {EventType, ResultCode} from '../../../utils/constants.js';
import {publicKeyToAddress} from "../../../utils/helpers.js";
import {Logger} from "../../../utils/logger.js";
/**
 * @typedef {import('hyperswarm').Connection} Connection
 */

const DEFAULT_HEALTH_CHECK_FAILURE_THRESHOLD = 3;

export function isConnectionClosing(connection) {
    return Boolean(connection.destroying || connection.destroyed || connection.closed);
}

export class ConnectionManagerError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
    }
}

class ConnectionManager {
    #validators
    #maxValidators
    #config
    #healthCheckService
    #healthCheckFailures
    #healthCheckFailureThreshold
    #boundedHealthCheckHandler
    #logger
    #closed = false
    /**
     * @param {Config} config
     **/
    constructor(config) {
        this.#validators = new Map();
        // consecutive failed health checks per validator
        this.#healthCheckFailures = new Map();
        this.#config = config
        this.#maxValidators = config.maxValidators
        this.#healthCheckFailureThreshold = this.#resolveHealthCheckFailureThreshold(config);
        this.#boundedHealthCheckHandler = this.#healthCheckHandler.bind(this);
        this.#logger = new Logger(config)
    }

    /**
     * Subscribes to periodic validator health checks.
     * @param {ReadyResource} healthCheckService
     */
    // TODO: We should consider moving this to ValidatorObserver instead.
    // Keep here only if we forsee having health checks for non-validator connections in the future. 
    // For now, it seems that it would be better to keep this logic here.
    subscribeToHealthChecks(healthCheckService) {
        if (this.#closed) return;
        this.#logger.debug('subscribeToHealthChecks: subscribing to health check events');
        if (!healthCheckService || typeof healthCheckService.on !== 'function' || typeof healthCheckService.off !== 'function') {
            throw new Error('ConnectionManager: health check service must implement on/off');
        }

        if (this.#healthCheckService === healthCheckService) return;
        if (this.#healthCheckService) {
            for (const key of this.#validators.keys()) this.#stopHealthCheck(key);
            this.#healthCheckService.off(EventType.VALIDATOR_HEALTH_CHECK, this.#boundedHealthCheckHandler);
        }

        this.#healthCheckService = healthCheckService;
        this.#healthCheckService.on(EventType.VALIDATOR_HEALTH_CHECK, this.#boundedHealthCheckHandler);
        this.#logger.debug('subscribeToHealthChecks: subscribed to health check events');
    }

    close() {
        this.#closed = true;
        for (const key of this.#validators.keys()) this.remove(key, { endConnection: false });
        this.#healthCheckService?.off(EventType.VALIDATOR_HEALTH_CHECK, this.#boundedHealthCheckHandler);
        this.#healthCheckService = null;
    }

    async #healthCheckHandler(publicKey, requestId) {
        if (typeof publicKey !== 'string' || typeof requestId !== 'string') {
            // We can't throw here because this is an event handler, but we should at least log the error and return early to avoid further issues.
            this.#logger.error(`healthCheck: malformed event payload. Typeof publicKey = ${typeof publicKey}. Typeof requestId = ${typeof requestId}`);
            return;
        }

        const targetAddress = publicKeyToAddress(publicKey, this.#config);

        if (!this.exists(publicKey) || !this.connected(publicKey)) {
            this.#logger.debug(`healthCheck: validator not connected, stopping checks. Address = ${targetAddress}; Request ID = ${requestId}`);
            this.#stopHealthCheck(publicKey);
            return;
        }

        const entry = this.#validators.get(publicKey);
        const connection = entry.connection;
        if (!connection || !connection.protocolSession || typeof connection.protocolSession.sendHealthCheck !== 'function') {
            this.#logger.debug(`healthCheck: missing protocol session, removing validator. Address = ${targetAddress}; Request ID = ${requestId}`);
            this.remove(publicKey);
            return;
        }

        let success = false;
        try {
            this.#logger.debug(`healthCheck: sending liveness request. Address = ${targetAddress}; Request ID = ${requestId}`);

            const resultCode = await connection.protocolSession.sendHealthCheck();
            success = resultCode === ResultCode.OK;
            if (!success) {
                this.#logger.debug(`healthCheck: non-OK result code. Address = ${targetAddress}; Request ID = ${requestId}`);
            }
        } catch {
            success = false;
        }

        // A detach and re-add can reuse both the key and the transport during the request.
        if (this.#validators.get(publicKey) !== entry) return;
        if (!success) {
            const failures = this.#countHealthCheckFailure(publicKey);
            this.#logger.debug(`healthCheck: liveness request failed. Address = ${targetAddress}; Request ID = ${requestId}; Consecutive failures = ${failures}`);
            if (failures >= this.#healthCheckFailureThreshold) {
                this.#logger.debug(`healthCheck: failure threshold reached, removing validator. Address = ${targetAddress}; Request ID = ${requestId}`);
                this.remove(publicKey);
            }
        } else {
            this.#clearHealthCheckFailures(publicKey);
            this.#logger.debug(`healthCheck: success. Address = ${targetAddress}; Request ID = ${requestId}`);
        }
    };

    #stopHealthCheck(publicKeyHex) {
        const targetAddress = publicKeyToAddress(publicKeyHex, this.#config);

        if (!this.#healthCheckService) {
            this.#logger.debug(`stopHealthCheck: no health check service, cannot stop checks for ${targetAddress}`);
            return;
        }
        try {
            if (this.#healthCheckService.has(publicKeyHex)) {
                this.#logger.debug(`stopHealthCheck: stopping scheduled checks for ${targetAddress}`);
                this.#healthCheckService.stop(publicKeyHex);
            }
        } catch (error) {
            this.#logger.debug(`stopHealthCheck: failed to stop health check for validator ${targetAddress}. Error: ${error.message}`);
        }
    }

    #resolveHealthCheckFailureThreshold(config) {
        const threshold = Number(config.validatorHealthCheckFailureThreshold);
        if (!Number.isInteger(threshold) || threshold < 1) return DEFAULT_HEALTH_CHECK_FAILURE_THRESHOLD;
        return threshold;
    }

    #countHealthCheckFailure(publicKey) {
        const publicKeyHex = this.#toHexString(publicKey);
        const failures = (this.#healthCheckFailures.get(publicKeyHex) || 0) + 1;
        this.#healthCheckFailures.set(publicKeyHex, failures);
        return failures;
    }

    #clearHealthCheckFailures(publicKey) {
        this.#healthCheckFailures.delete(this.#toHexString(publicKey));
    }

    /**
     * Retrieves the Hyperswarm connection object for a given validator public key.
     * @param {String | Buffer} publicKey - The public key (Buffer or hex string) of the validator.
     * @returns {Connection|undefined} - The connection object if found, otherwise undefined.
     */
    getConnection(publicKey) {
        const publicKeyHex = this.#toHexString(publicKey);
        const entry = this.#validators.get(publicKeyHex);
        return entry ? entry.connection : undefined;
    }

    /**
     * Checks whether a connection is the one currently tracked for a validator.
     * @param {String | Buffer} publicKey - The public key (Buffer or hex string) of the validator.
     * @param {Object} connection - The connection object to compare with the tracked one.
     * @returns {Boolean} - Returns true if the tracked connection is the given connection, false otherwise.
     */
    isCurrent(publicKey, connection) {
        const publicKeyHex = this.#toHexString(publicKey);
        const entry = this.#validators.get(publicKeyHex);
        return !!entry && entry.connection === connection;
    }

    /**
     * Sends a message through a specific validator without increasing sent messages count.
     * @param {Object} message - The message to send to the validator.
     * @param {String | Buffer} publicKey - A validator public key hex string to be fetched from the pool.
     * @returns {Promise<*>} A promise returned by `validator.connection.protocolSession.send(message)`.
     * @throws {ConnectionManagerError} If the validator is not connected.
     * @throws {ConnectionManagerError} If the validator has no valid connection or protocol session.
     */
    async sendSingleMessage(message, publicKey) {
        let publicKeyHex = this.#toHexString(publicKey);
        if (!this.connected(publicKeyHex)) {
            throw new ConnectionManagerError(
                `Cannot send message: validator ${publicKeyToAddress(publicKey, this.#config)} is not connected.`
            );
        }
        const validator = this.#validators.get(publicKeyHex);
        if (!validator || !validator.connection || !validator.connection.protocolSession) {
            throw new ConnectionManagerError(
                `Cannot send message: no valid connection found for validator ${publicKeyToAddress(publicKey, this.#config)}.`
            );
        }
        return validator.connection.protocolSession.send(message)
    }

    /**
     * Adds a validator to the pool if not already present.
     * @param {String | Buffer} publicKey - The public key hex string of the validator to add
     * @param {Object} connection - The connection object associated with the validator
     * @returns {Boolean} - Returns true if the validator was added, false otherwise
     */
    addValidator(publicKey, connection) {
        if (this.#closed || isConnectionClosing(connection)) return false;
        const publicKeyHex = this.#toHexString(publicKey);
        if (this.maxConnectionsReached()) {
            this.#logger.debug('addValidator: max connections reached.');
            return false;
        }
        if (this.exists(publicKeyHex)) return false;

        this.#logger.debug(`addValidator: adding validator ${publicKeyToAddress(publicKeyHex, this.#config)}`);
        const onClose = () => {
            if (this.isCurrent(publicKeyHex, connection)) this.remove(publicKeyHex, { endConnection: false });
        };
        this.#validators.set(publicKeyHex, { connection, sent: 0, onClose });
        connection.on('close', onClose);
        return true;
    }

    /**
     * Removes a validator from the pool.
     * @param {String | Buffer} publicKey - The public key hex string of the validator to remove
     * @param {object} [options]
     * @param {boolean} [options.endConnection=true] - Whether to close the underlying socket.
     */
    remove(publicKey, { endConnection = true } = {}) {
        this.#logger.debug(`remove: removing validator ${publicKeyToAddress(publicKey, this.#config)}`);
        const publicKeyHex = this.#toHexString(publicKey);
        const entry = this.#validators.get(publicKeyHex);
        if (!entry) return;

        this.#validators.delete(publicKeyHex);
        entry.connection.off('close', entry.onClose);
        this.#stopHealthCheck(publicKeyHex);
        this.#clearHealthCheckFailures(publicKeyHex);
        if (endConnection && typeof entry.connection.end === 'function') {
            try {
                entry.connection.end();
            } catch (e) {
                this.#logger.debug(`remove: failed to end connection: ${e.message}`);
            }
        }
    }

    /**
     * Checks if the maximum number of connections has been reached.
     * @returns {Boolean} - Returns true if the maximum number of connections has been reached, false otherwise.
     */
    // Note: this function name is a bit misleading. It checks if we have reached max connections and returns boolean
    // The name leads to think it returns the number of max connections
    maxConnectionsReached() {
        return this.connectionCount() >= this.#maxValidators
    }

    /**
     * Gets a list of all currently connected validators' public keys.
     * @returns {Array} - An array of public key hex strings of connected validators
     */
    connectedValidators() {
        return Array.from(this.#validators.keys()).filter(pk => this.connected(pk));
    }

    /**
     * Gets the current number of connected validators.
     * @returns {Number} - The count of connected validators
     */
    connectionCount() {
        return this.connectedValidators().length;
    }

    /**
     * Checks if a validator is currently connected.
     * @param {String | Buffer} publicKey - The public key hex string of the validator to check
     * @returns {Boolean} - Returns true if the validator is connected, false otherwise
     */
    connected(publicKey) {
        const publicKeyHex = this.#toHexString(publicKey);
        return this.exists(publicKeyHex) && this.#validators.get(publicKeyHex).connection !== null;
    }

    /**
     * Checks if a validator exists in the pool.
     * @param {String | Buffer} publicKey - The public key hex string of the validator to check
     * @returns {Boolean} - Returns true if the validator exists, false otherwise
     */
    exists(publicKey) {
        const publicKeyHex = this.#toHexString(publicKey);
        return this.#validators.has(publicKeyHex);
    }

    /**
     * Gets the number of messages sent through a validator.
     * @param {String | Buffer} publicKey - The public key hex string of the validator
     * @returns {Number} - The count of messages sent
     */
    getSentCount(publicKey) {
        const publicKeyHex = this.#toHexString(publicKey);
        const entry = this.#validators.get(publicKeyHex);
        return entry ? (entry.sent || 0) : 0;
    }

    /**
     * Increments the count of messages sent through a validator.
     * @param {String | Buffer} publicKey - The public key hex string of the validator
     */
    incrementSentCount(publicKey) {
        const publicKeyHex = this.#toHexString(publicKey);
        const entry = this.#validators.get(publicKeyHex);
        if (entry) {
            entry.sent = (entry.sent || 0) + 1;
        }
    }

    prettyPrint() {
        this.#logger.info(`Connection count: ${this.connectionCount()}`);
        this.#logger.info(`Validator map keys count: ${this.#validators.size}`);
        this.#logger.info(`Validator map keys:\n${Array.from(this.#validators.entries()).map(([publicKey, val]) => {
            const protocols = val.connection?.protocolSession?.preferredProtocol || 'none';
            return `${publicKeyToAddress(publicKey, this.#config)}: ${protocols}`;
        }).join('\n')}`);
    }

    /**
     * Picks a random validator from the given array of validator public keys.
     * @param {String[]} validatorPubKeys - An array of validator public key hex strings
     * @returns {String|null} - A randomly selected validator public key
     */
    pickRandomValidator(validatorPubKeys) {
        if (validatorPubKeys.length === 0) {
            return null;
        }
        const index = Math.floor(Math.random() * validatorPubKeys.length);
        return validatorPubKeys[index];
    }

    /**
     * Picks a random connected validator.
     * @returns {String|null} - A randomly selected connected validator public key, or null if none are connected
     */
    pickRandomConnectedValidator() {
        const connected = this.connectedValidators();
        if (connected.length === 0) return null;
        return this.pickRandomValidator(connected);
    }

    #toHexString(publicKey) {
        return b4a.isBuffer(publicKey) ? publicKey.toString('hex') : publicKey;
    }
}

export default ConnectionManager;
