import {EventType, ResultCode} from '../../../utils/constants.js';
import {publicKeyToAddress} from "../../../utils/helpers.js";
import {Logger} from "../../../utils/logger.js";
import { BaseConnectionManager } from '../../shared/BaseConnectionManager.js'
/**
 * @typedef {import('hyperswarm').Connection} Connection
 */

class ValidatorConnectionManager extends BaseConnectionManager {
    #healthCheckService
    #boundedHealthCheckHandler
    // Note: _connections is using publicKey (Buffer) as key
    // As Buffers are objects, we will rely on internal conversions done by JS to compare them.
    // It would be better to handle these conversions manually by using hex strings as keys to avoid issues
    /**
     * @param {Config} config
     **/
    constructor(maxValidators, config, logger, messages) {
        super(maxValidators, config, logger, messages);
        this.#boundedHealthCheckHandler = this.#healthCheckHandler.bind(this);
    }

    /**
     * Subscribes to periodic validator health checks.
     * @param {ReadyResource} healthCheckService
     */
    // TODO: We should consider moving this to ValidatorObserver instead.
    // Keep here only if we forsee having health checks for non-validator connections in the future. 
    // For now, it seems that it would be better to keep this logic here.
    subscribeToHealthChecks(healthCheckService) {
        this._logger.debug('subscribeToHealthChecks: subscribing to health check events');
        if (!healthCheckService || typeof healthCheckService.on !== 'function' || typeof healthCheckService.off !== 'function') {
            throw new Error('ValidatorConnectionManager: health check service must implement on/off');
        }

        if (this.#healthCheckService && this.#boundedHealthCheckHandler) {
            this._logger.debug('subscribeToHealthChecks: removing previous health check handler');
            // Unsubscribe from previous health check service if already subscribed
            // TODO: Maybe we should not allow switching to a new health check service
            this.#healthCheckService.off(EventType.VALIDATOR_HEALTH_CHECK, this.#boundedHealthCheckHandler);
        }

        this.#healthCheckService = healthCheckService; // TODO: Maybe this should be handled in the constructor directly?
        // TODO: declare this method outside this function to avoid redeclaring it every time we subscribe to health checks. We can just bind it to 'this' in the constructor.

        this.#healthCheckService.on(EventType.VALIDATOR_HEALTH_CHECK, this.#boundedHealthCheckHandler);
        this._logger.debug('subscribeToHealthChecks: subscribed to health check events');
    }

    async #healthCheckHandler(publicKey, requestId) {
        if (typeof publicKey !== 'string' || typeof requestId !== 'string') {
            // We can't throw here because this is an event handler, but we should at least log the error and return early to avoid further issues.
            this._logger.error(`healthCheck: malformed event payload. Typeof publicKey = ${typeof publicKey}. Typeof requestId = ${typeof requestId}`);
            return;
        }

        const targetAddress = publicKeyToAddress(publicKey, this._config);

        if (!this.exists(publicKey) || !this.connected(publicKey)) {
            this._logger.debug(`healthCheck: validator not connected, stopping checks. Address = ${targetAddress}; Request ID = ${requestId}`);
            this.#stopHealthCheck(publicKey);
            return;
        }

        const connection = this.getConnection(publicKey);
        if (!connection || !connection.protocolSession || typeof connection.protocolSession.sendHealthCheck !== 'function') {
            this._logger.debug(`healthCheck: missing protocol session, removing validator. Address = ${targetAddress}; Request ID = ${requestId}`);
            this.#stopHealthCheck(publicKey);
            this.remove(publicKey);
            return;
        }

        let success = false;
        try {
            this._logger.debug(`healthCheck: sending liveness request. Address = ${targetAddress}; Request ID = ${requestId}`);

            const resultCode = await connection.protocolSession.sendHealthCheck();
            success = resultCode === ResultCode.OK;
            if (!success) {
                this._logger.debug(`healthCheck: non-OK result code. Address = ${targetAddress}; Request ID = ${requestId}`);
            }
        } catch {
            success = false;
        }

        if (!success) {
            this._logger.debug(`healthCheck: liveness request failed, removing validator. Address = ${targetAddress}; Request ID = ${requestId}`);
            this.remove(publicKey);
            this.#stopHealthCheck(publicKey);
        } else {
            this._logger.debug(`healthCheck: success. Address = ${targetAddress}; Request ID = ${requestId}`);
        }
    };

    #stopHealthCheck(publicKeyHex) {
        const targetAddress = publicKeyToAddress(publicKeyHex, this._config);

        if (!this.#healthCheckService) {
            this._logger.debug(`stopHealthCheck: no health check service, cannot stop checks for ${targetAddress}`);
            return;
        }
        try {
            if (this.#healthCheckService.has(publicKeyHex)) {
                this._logger.debug(`stopHealthCheck: stopping scheduled checks for ${targetAddress}`);
                this.#healthCheckService.stop(publicKeyHex);
            }
        } catch (error) {
            this._logger.debug(`stopHealthCheck: failed to stop health check for validator ${targetAddress}. Error: ${error.message}`);
        }
    }

    /**
     * Removes a validator from the pool.
     * @param {String | Buffer} publicKey - The public key hex string of the validator to remove
     * @param {object} [options]
     * @param {boolean} [options.endConnection=true] - Whether to close the underlying socket.
     */
    remove(publicKey, { endConnection = true } = {}) {
        this._logger.debug(`remove: removing validator ${publicKeyToAddress(publicKey, this._config)}`);
        const publicKeyHex = this._toHexString(publicKey);
        this.#stopHealthCheck(publicKeyHex);
        if (this.exists(publicKeyHex)) {
            const entry = this._connections.get(publicKeyHex);
            if (endConnection && entry && entry.connection && typeof entry.connection.end === 'function') {
                try {
                    entry.connection.end();
                    connection.protocolSession.close();
                } catch (e) {
                    // Ignore errors on connection end
                    this._logger.debug(`remove: failed to end connection: ${e.message}`);
                    // TODO: Consider logging these errors here in verbose mode
                }
            }
            this._logger.debug(`remove: removing validator from map: ${publicKeyToAddress(publicKeyHex, this._config)}. Map size before removal: ${this._connections.size}.`);
            this._connections.delete(publicKeyHex);
            this._logger.debug(`remove: validator removed successfully. Map size is now ${this._connections.size}.`);
        }
    }

    /**
     * Gets the number of messages sent through a validator.
     * @param {String | Buffer} publicKey - The public key hex string of the validator
     * @returns {Number} - The count of messages sent
     */
    getSentCount(publicKey) {
        const publicKeyHex = this._toHexString(publicKey);
        const entry = this._connections.get(publicKeyHex);
        return entry ? (entry.sent || 0) : 0;
    }

    /**
     * Increments the count of messages sent through a validator.
     * @param {String | Buffer} publicKey - The public key hex string of the validator
     */
    incrementSentCount(publicKey) {
        const publicKeyHex = this._toHexString(publicKey);
        const entry = this._connections.get(publicKeyHex);
        if (entry) {
            entry.sent = (entry.sent || 0) + 1;
        }
    }

    prettyPrint() {
        this._logger.info(`Connection count: ${this.connectionCount()}`);
        this._logger.info(`Validator map keys count: ${this._connections.size}`);
        this._logger.info(`Validator map keys:\n${Array.from(this._connections.entries()).map(([publicKey, val]) => {
            const protocols = val.connection?.protocolSession?.preferredProtocol || 'none';
            return `${publicKeyToAddress(publicKey, this._config)}: ${protocols}`;
        }).join('\n')}`);
    }
}

export default ValidatorConnectionManager;
