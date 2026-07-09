import {EventType, ResultCode} from '../../../utils/constants.js';
import {publicKeyToAddress} from "../../../utils/helpers.js";
import { PeerConnectionManager } from '../../shared/PeerConnectionManager.js'
import ValidatorHealthCheckService from './ValidatorHealthCheckService.js'
/**
 * @typedef {import('hyperswarm').Connection} Connection
 */

class ValidatorConnectionManager extends PeerConnectionManager {
    #healthCheckService
    #messages
    // Note: _connections is using publicKey (Buffer) as key
    // As Buffers are objects, we will rely on internal conversions done by JS to compare them.
    // It would be better to handle these conversions manually by using hex strings as keys to avoid issues
    /**
     * @param {Config} config
     **/
    constructor(maxValidators, config, logger, messages) {
        super(maxValidators, config, logger, messages);
        this.#messages = messages
        this.#healthCheckService = new ValidatorHealthCheckService(config);
    }

    async _open() {
        await this.#healthCheckService.ready();
        this.#subscribeToHealthChecks();
    }

    async _close() {
        await this.#healthCheckService.close();
    }

    /**
     * Subscribes to periodic validator health checks.
     * @param {ReadyResource} healthCheckService
     */
    // TODO: We should consider moving this to ValidatorObserver instead.
    // Keep here only if we forsee having health checks for non-validator connections in the future. 
    // For now, it seems that it would be better to keep this logic here.
    #subscribeToHealthChecks() {
        this.#healthCheckService.on(EventType.VALIDATOR_HEALTH_CHECK, (publicKey, requestId) => {
            this.#healthCheckHandler(publicKey, requestId);
        });
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

    async add(publicKey, connection) {
        if (!connection.protocolSession) connection.protocolSession = this.#messages.createProtomux(connection);
        this._add(publicKey, connection, { initializeProtocolSession: false });
        
        try {
            if (!connection.protocolSession.isProbed()) await connection.protocolSession.probe();
        } catch (err) {
            this._logger.debug(`failed to probe peer with publicKey ${publicKey}: ${err?.message ?? err}`);
        }        
        
        if (connection.protocolSession.isHealthCheckSupported()) {
            this.#healthCheckService.start(publicKey);
        } else {
            this.#healthCheckService.stop(publicKey);
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
                    entry.connection.protocolSession.close();
                    entry.connection.end();
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
