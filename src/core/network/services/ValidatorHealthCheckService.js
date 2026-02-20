import ReadyResource from 'ready-resource';
import b4a from 'b4a';
import { networkMessageFactory } from '../../../messages/network/v1/networkMessageFactory.js';
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

class ValidatorHealthCheckService extends ReadyResource {
    #wallet;
    #config;
    #intervalMs;
    #timers;
    #capabilities;

    /**
     * @param {object} wallet
     * @param {string[]} capabilities
     * @param {object} config
     */
    // TODO: Check if it is actually needed to pass capabilities here
    constructor(wallet, capabilities, config = {}) {
        super();
        this.#wallet = wallet;
        this.#config = config;
        this.#timers = new Map();

        this.#capabilities = this.#checkCapabilities(capabilities);
        this.#intervalMs = this.#checkInterval(this.#config.validatorHealthCheckInterval) || 300000; // Default to 5 minutes

        debugLog('initialized with intervalMs', this.#intervalMs, 'capabilities', this.#capabilities);
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
            debugLog('emitHealthCheck: building liveness request for', publicKey);
            const requestId = generateUUID();
            const message = await networkMessageFactory(this.#wallet, this.#config)
                .buildLivenessRequest(requestId, this.#capabilities); // TODO: Check what are these "capabilities". Maybe the message could be assembles inside the event handler
            this.emit(EventType.VALIDATOR_HEALTH_CHECK, { publicKey, message, requestId }); // TODO: If we assemble the message in the event handler, we don't need to pass it here
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

    #checkCapabilities(capabilities) {
        if (!Array.isArray(capabilities) || capabilities.some(cap => typeof cap !== 'string')) {
            throw new TypeError('ValidatorHealthCheckService: capabilities must be an array of strings');
        }
        return capabilities;
    }

    #normalizePublicKey(publicKey) {
        if (b4a.isBuffer(publicKey)) return publicKey.toString('hex');
        if (typeof publicKey === 'string') return publicKey.toLowerCase();
        throw new TypeError('ValidatorHealthCheckService: publicKey must be a Buffer or hex string');
    }
}

export default ValidatorHealthCheckService;
