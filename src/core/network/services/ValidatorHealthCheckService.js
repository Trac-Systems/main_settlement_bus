import ReadyResource from 'ready-resource';
import b4a from 'b4a';
import { generateUUID } from '../../../utils/helpers.js';
import { EventType } from '../../../utils/constants.js';

// -- Debug Mode --
// TODO: Implement a better debug system in the future. This is just temporary.
const DEBUG = false;
const debugLog = (...args) => {
    if (DEBUG) {
        console.log('DEBUG [ValidatorHealthCheckService] ==> ', ...args);
    }
};

const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 300000; // 5 minutes
class ValidatorHealthCheckService extends ReadyResource {
    #config;
    #intervalMs;
    #timers;

    /**
     * @param {object} config
     */
    constructor(config = {}) {
        super();
        this.#config = config;
        this.#timers = new Map();

        const interval = this.#config.validatorHealthCheckInterval;
        this.#intervalMs = interval == null ? DEFAULT_HEALTH_CHECK_INTERVAL_MS : this.#checkInterval(interval);

        debugLog('initialized with intervalMs', this.#intervalMs);
    }

    get size() {
        return this.#timers.size;
    }

    async _open() {
        debugLog('open: health check service ready');
    }

    async _close() {
        debugLog('close: stopping all health checks');
        this.#stopAll();
        this.#timers.clear();
    }

    /**
     * Start periodic health checks for a validator.
     * @param {String} publicKey
     */
    start(publicKey) {
        if (!this.opened) {
            throw new Error('start: service not ready. Call ready() before start().');
        }
        const publicKeyHex = this.#normalizePublicKey(publicKey);
        if (this.#timers.has(publicKeyHex)) {
            debugLog('start: already scheduled for', publicKey);
            return false; // TODO: Implement better error handling
        }

        const timerId = setInterval(() => {
            this.#emitHealthCheck(publicKeyHex);
        }, this.#intervalMs);

        this.#timers.set(publicKeyHex, { timerId, intervalMs: this.#intervalMs });
        debugLog('start: scheduled health checks for', publicKeyHex, 'every', this.#intervalMs, 'ms');

        return true;
    }

    /**
     * Stop periodic health checks for a validator.
     * @param {String} publicKey
     * @returns {boolean} true if stopped, false if not scheduled
     */
    stop(publicKey) {
        const publicKeyHex = this.#normalizePublicKey(publicKey);
        const entry = this.#timers.get(publicKeyHex);
        if (!entry) {
            debugLog(`stop: did not find scheduled health check for public key ${publicKey}. Aborting`);
            return false;
        }
        clearInterval(entry.timerId);
        this.#timers.delete(publicKeyHex);
        debugLog('stop: cancelled health checks for', publicKeyHex);
        return true;
    }

    /**
     * Check if a validator is scheduled.
     * @param {String} publicKey
     * @returns {boolean}
     */
    has(publicKey) {
        return this.#timers.has(this.#normalizePublicKey(publicKey));
    }

    async #emitHealthCheck(publicKey) {
        try {
            const requestId = generateUUID();
            this.emit(EventType.VALIDATOR_HEALTH_CHECK, { publicKey, requestId });
            debugLog(`Emitted health check event for ${publicKey} with requestId ${requestId}`);
        } catch (error) {
            console.error(`ValidatorHealthCheckService: Failed to emit health check for ${publicKey}: ${error?.message || error}`);
        }
    }

    #stopAll() {
        debugLog('stopAll: cancelling health checks for', this.#timers.size, 'validators');
        for (const publicKey of this.#timers.keys()) {
            this.stop(publicKey);
        }
    }

    #checkInterval(intervalMs) {
        const ms = Number(intervalMs);
        if (!Number.isFinite(ms) || ms <= 0) {
            throw new RangeError(`ValidatorHealthCheckService: invalid intervalMs value: ${intervalMs}`);
        }
        return ms;
    }

    // TODO: This method is used in multiple places. Consider moving it to a utility file or exposing it from PeerWallet.
    #normalizePublicKey(publicKey) {
        if (b4a.isBuffer(publicKey)) return publicKey.toString('hex');
        if (typeof publicKey === 'string') return publicKey.toLowerCase();
        throw new TypeError('ValidatorHealthCheckService: publicKey must be a Buffer or hex string');
    }
}

export default ValidatorHealthCheckService;
