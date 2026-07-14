import {EventType, ResultCode} from '../../../utils/constants.js';
import {publicKeyToAddress} from "../../../utils/helpers.js";
import { PeerConnectionManager, PeerConnectionManagerError } from '../../shared/PeerConnectionManager.js'
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
        this.#healthCheckService.on(EventType.VALIDATOR_HEALTH_CHECK, async publicKey => {
            if (!this.exists(publicKey) || !this.connected(publicKey)) {
                this.#stopHealthCheck(publicKey);
                return;
            }

            const connection = this.getConnection(publicKey);
            if (!connection) {
                this.#stopHealthCheck(publicKey);
                this.remove(publicKey);
                return;
            }

            let success = false;
            try {
                const resultCode = await connection.protocolSessions.validator.sendHealthCheck();
                success = resultCode === ResultCode.OK;
            } catch {
                success = false;
            }

            if (!success) {
                this.remove(publicKey);
                this.#stopHealthCheck(publicKey);
            }
        });
    }

    #stopHealthCheck(publicKeyHex) {
        try {
            if (this.#healthCheckService.has(publicKeyHex)) {
                this.#healthCheckService.stop(publicKeyHex);
            }
        } catch {}
    }

    async add(publicKey, connection) {
        this.#messages.attachChannel(connection);
        try {
            if (!connection.protocolSessions.validator.isProbed()) {
                await connection.protocolSessions.validator.probe();
            }
        } catch (err) {
            this._logger.error(`failed to probe peer with publicKey ${publicKey}: ${err?.message ?? err}`);
        }        
        this._add(publicKey, connection);
        
        if (connection.protocolSessions.validator.isHealthCheckSupported()) {
            this.#healthCheckService.start(publicKey);
        } else {
            this.#healthCheckService.stop(publicKey);
        }
    }

    remove(publicKey, connection = null) {
        const publicKeyHex = this._toHexString(publicKey);
        if (!this.exists(publicKeyHex)) return;

        const entry = this._connections.get(publicKeyHex);
        if (connection && entry.connection !== connection) {
            return;
        }

        const targetConnection = connection ?? entry.connection;
        this.#stopHealthCheck(publicKeyHex);
        this._connections.delete(publicKeyHex);
        targetConnection.protocolSessions.validator.close()
    }

    async sendSingleMessage(message, publicKey) {
        const publicKeyHex = this._toHexString(publicKey);
        if (!this.connected(publicKeyHex)) {
            throw new PeerConnectionManagerError(
                `Cannot send message: peer ${publicKeyToAddress(publicKey, this._config)} is not connected.`
            );
        }

        const connection = this.getConnection(publicKeyHex);
        if (!connection) {
            throw new PeerConnectionManagerError(
                `Cannot send message: no valid connection found for peer ${publicKeyToAddress(publicKeyHex, this._config)}.`
            );
        }

        return connection.protocolSessions.validator.send(message);
    }

    sendAndForget(publicKey, message) {
        const connection = this.getConnection(publicKey);
        if (!connection) return;
        connection.protocolSessions.validator.sendAndForget(message);
    }

    async send(publicKey, message) {
        const connection = this.getConnection(publicKey);
        if (!connection) {
            throw new Error(`PeerConnectionManager: no session for ${this._toHexString(publicKey)}`);
        }
        return connection.protocolSessions.validator.send(message);
    }

    prettyPrint() {
        this._logger.info(`Connection count: ${this.connectionCount()}`);
        this._logger.info(`Validator map keys count: ${this._connections.size}`);
        this._logger.info(`Validator map keys:\n${Array.from(this._connections.entries()).map(([publicKey, val]) => {
            const protocols = val.connection?.protocolSessions?.validator?.preferredProtocol || 'none';
            return `${publicKeyToAddress(publicKey, this._config)}: ${protocols}`;
        }).join('\n')}`);
    }
}

export default ValidatorConnectionManager;
