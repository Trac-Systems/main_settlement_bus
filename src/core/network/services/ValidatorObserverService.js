import SchedulableService from "../../../utils/scheduler/SchedulableService.js";
import { Logger } from "../../../utils/logger.js";
import b4a from "b4a";
import { bufferToAddress } from "../../../core/state/utils/address.js";
import tracCryptoApi from "trac-crypto-api";
import { WRITER_BYTE_LENGTH, CONNECTION_STATUS } from "../../../utils/constants.js";
import { publicKeyToAddress } from "../../../utils/helpers.js";

// Internal constants
const VALIDATOR_CANDIDATES_PER_CYCLE = 10;
const MAX_KEY_DECODE_CACHE_SIZE = 10_000;

class ValidatorObserverService extends SchedulableService {
    #network;
    #state;
    #address;
    #config;
    #logger;
    #hasBootstrapped;    // Whether initial connection phase is complete
    #bootstrapStartedAt; // Timestamp to enforce bootstrap timeout
    #adminCache;         // Cached admin entry with TTL
    #writersCache;       // Cached writer list with dynamic TTL
    #keyDecodeCache;

    /**
     * @param {Object} network - The network layer instance (e.g., Hyperswarm wrapper).
     * @param {Object} state - The state manager instance interacting with Autobase.
     * @param {string} address - The physical address of the current node.
     * @param {Object} config - The application configuration object.
     */
    constructor(network, state, address, config) {
        super();
        this.#network = network;
        this.#state = state;
        this.#address = address;
        this.#config = config;
        this.#logger = new Logger(config);
        this.#hasBootstrapped = false;
        this.#bootstrapStartedAt = 0;
        this.#adminCache = { entry: null, lastUpdated: 0 };
        this.#writersCache = { list: [], lastUpdated: 0 };
        this.#keyDecodeCache = new Map();
    }

    /**
     * Selects a subset of valid validator candidates to connect to.
     *
     * Rules:
     * - Assumes writers list is already pre-filtered and deduplicated from scan phase.
     * - Excludes self.
     * - Excludes already connected or pending nodes.
     * - Revalidates roles and the admin threshold before connecting.
     * - Randomizes selection (Fisher-Yates) to avoid bias.
     * @param {Array<Object>} writers - The deduplicated list of active writers.
     * @returns {{candidates: Array<Object>, slots: number}} The selected candidates and the number of available connection slots.
     */
    #selectCandidates(writers) {
        const manager = this.#network.validatorConnectionManager;
        // Target calculation: ensures the observer deducts its own slot from the network size 
        // only if it belongs to the valid writers list.
        const isSelfInWriters = writers.some(w => w.address === this.#address);
        const networkSize = isSelfInWriters ? writers.length - 1 : writers.length;
        const target = Math.min(networkSize, this.#config.maxValidators);
        
        const totalConnected = manager.connectionCount();

        const available = writers.filter((w) => {
            if (w.address === this.#address) return false;

            const isConnected = manager.connected(w.publicKey);
            
            // Checks if we are ALREADY trying to connect to this specific node
            const isPending = this.#network.isConnectionPending(w.publicKeyHex);

            // Skips nodes we are already interacting with
            if (isConnected || isPending) return false;
            
            return true;
        });

        const result = [...available];

        // Fisher-Yates shuffle
        for (let i = 0; i < result.length; i++) {
            const j = i + Math.floor(Math.random() * (result.length - i));
            [result[i], result[j]] = [result[j], result[i]];
        }

        // Open slots based ONLY on who is ALREADY connected,
        // Ignoring pending/non-active nodes to avoid blocking the queue.
        const slots = Math.max(0, target - totalConnected);
        const limit = Math.min(slots, VALIDATOR_CANDIDATES_PER_CYCLE, result.length);
        
        return {
            candidates: result.slice(0, limit),
            slots: slots,
        }
    }
   
    /**
     * Removes active connections to writers that are no longer valid (e.g., removed/soft-deleted).
     * @param {Uint8Array} publicKey - The public key of the stale connection to be removed.
     */
    #enforceNoStaleConnections(publicKey) {
        const manager = this.#network.validatorConnectionManager;

        if (manager.connected(publicKey)) {
            // leave the transport to the swarm
            manager.remove(publicKey);
            this.#logger.debug(`Removed stale validator connection: ${b4a.toString(publicKey, "hex")}`);
        }
    }
    
    /**
     * Determines whether the observer should run.
     * Controlled by a config flag + runtime interruption.
     * @returns {boolean} True if the observer is enabled and not interrupted.
     */
    #shouldRun() {
        return !this.isInterrupted;
    }
    
    /**
     * Starts the validator observer loop.
     * Initializes the scheduler and bootstrap state.
     */
    async start() {
        if (!this.#shouldRun()) {
            this.#logger.info('ValidatorObserverService can not start. Disabled by configuration.');
            return;
        }

        this.#bootstrapStartedAt = Date.now();
        this.#hasBootstrapped = false;
        super.start();
        this.#logger.debug("ValidatorObserverService started");
    }

    /**
     * Stops the observer gracefully.
     * Prevents new work and waits for the current cycle to finish if requested.
     * @param {boolean} [waitForCurrent=true] - Whether to wait for the current worker cycle to finish.
     */
    async stop(waitForCurrent = true) {
        const stopped = await super.stop(waitForCurrent);
        if (!stopped) return;
        this.#logger.debug("ValidatorObserverService stopped");
    }

    /**
     * Main worker loop (executed periodically).
     *
     * Flow:
     * 1. Revalidate connected peers against current roles and the admin threshold.
     * 2. Fetch admin + writers (cached).
     * 3. Skip if the connection pool is full.
     * 4. Select candidates.
     * 5. Attempt connections (with pacing).
     * @param {Function} next - Callback to schedule the next execution.
     */
    getScheduleInterval() {
        return this.#config.pollInterval;
    }

    async worker(next) {
        const interval = this.#config.pollInterval;
        if (!this.#shouldRun()) {
            next(interval);
            return;
        }

        try {
            // Recheck bounded connection pools on every cycle, even when discovery
            // is cached or the pool is full. Removing a role preserves replication.
            const manager = this.#network.validatorConnectionManager;
            for (const publicKey of manager.connectedPeers()) {
                if (!await this.#state.isValidatorAddress(publicKeyToAddress(publicKey, this.#config))) {
                    manager.remove(publicKey);
                }
            }
            const adminEntry = await this.#getAdminEntryCached();
            const writers = await this.#getWritersCached(adminEntry);
            
            if (writers.length === 0) return next(interval);

            // CEILING: do not exceed the max connections limit
            if (manager.maxConnectionsReached()) return next(interval); 
            
            const { candidates, slots} = this.#selectCandidates(writers);
            if (candidates.length > 0) {
                await this.#processCandidates(candidates, slots);
            }

        } catch (err) {
            this.#logger.error(`ValidatorObserver worker error: ${err.message}`);
        }

        next(interval);
    }

    /**
     * Returns the cached admin entry with TTL.
     * @returns {Promise<Object>} The admin entry object.
     */
    async #getAdminEntryCached() {
        const now = Date.now();
        const ttl = this.#config.adminCacheTTL;
        if (this.#adminCache.entry && now - this.#adminCache.lastUpdated < ttl) return this.#adminCache.entry;

        const entry = await this.#state.getAdminEntry();
        this.#adminCache = { entry, lastUpdated: now };
        return entry;
    }

    /**
     * Returns the cached writer list with dynamic TTL:
     * - Short TTL during bootstrap (aggressive discovery).
     * - Long TTL after bootstrap (stability).
     *
     * Bootstrap completes when:
     * - Connection pool is full OR
     * - Timeout is reached.
     * @param {Object} adminEntry - The current admin node entry.
     * @returns {Promise<Array<Object>>} The deduplicated list of writers.
     */
    async #getWritersCached(adminEntry) {
        const now = Date.now();
        const cachedList = this.#writersCache.list;
        const lastUpdated = this.#writersCache.lastUpdated;
        const manager = this.#network.validatorConnectionManager;

        if (!this.#hasBootstrapped && manager.maxConnectionsReached()) {
            this.#hasBootstrapped = true;
            this.#logger.debug("Bootstrap complete (pool full)");
        }

        if (!this.#hasBootstrapped && now - this.#bootstrapStartedAt > this.#config.bootstrapTimeout) {
            this.#hasBootstrapped = true;
            this.#logger.debug("Bootstrap complete (timeout)");
        }
        
        const short = this.#config.writersShortCacheTTL;
        const long = this.#config.writersLongCacheTTL;
        
        const dynamicTTL = this.#hasBootstrapped ? long : short;
        if (cachedList.length > 0 && now - lastUpdated < dynamicTTL) return cachedList;
            
        const list = await this.#scanAutobaseWriters(adminEntry);
        this.#writersCache = { list, lastUpdated: now };

        return list;
    }

    /**
     * Sequentially processes selected candidates.
     * Applies delay between connection attempts to avoid network bursts.
     * @param {Array<Object>} candidates - The list of selected validator candidates.
     * @param {number} slots - The number of available connection slots.
     */
    async #processCandidates(candidates, slots) {
        const delay = this.#config.validatorConnectionAttemptDelay;

        let attempts = 0;

        for (const candidate of candidates) {
            if (!this.#shouldRun()) break;
            if (attempts >= slots) break;

            const isConnected = this.#network.validatorConnectionManager.connected(candidate.publicKey);
            const isPending = this.#network.isConnectionPending(candidate.publicKeyHex);

            if (isConnected || isPending) continue;

            const result = await this.#tryConnect(candidate);
            if (!result || result === CONNECTION_STATUS.IGNORED) continue;
            this.#logger.debug(`Validator connection to ${candidate.publicKeyHex} resulted in: ${result}`);

            attempts++;

            if (attempts < slots) {
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * Scans Autobase writer entries and builds the active validator list.
     *
     * Rules:
     * - Skips invalid/malformed entries.
     * - Skips non-admin indexers.
     * - Deduplicates active writers by wallet address.
     * - Removes stale connections only when no active writer remains for an address.
     * - Includes only valid and active writer nodes.
     * @param {Object} adminEntry - The current admin node entry.
     * @returns {Promise<Array<Object>>} A promise resolving to the deduplicated array of active writers.
     */
    async #scanAutobaseWriters(adminEntry) {
        // Prevents memory leak in case of a very long-running node
        if (this.#keyDecodeCache.size > MAX_KEY_DECODE_CACHE_SIZE) {
            this.#keyDecodeCache.clear();
        }

        // Historical writer keys can share an address with an active replacement.
        const activeMap = new Map();
        const removedMap = new Map();

        try {
            for await (const { key, value } of this.#state.base.system.list()) {
                if (!this.#shouldRun()) return Array.from(activeMap.values());

                if (!key || b4a.byteLength(key) !== WRITER_BYTE_LENGTH) continue;
                if (!value) continue;

                const writerKeyHex = b4a.toString(key, "hex");
                let decodedIdentity = this.#keyDecodeCache.get(writerKeyHex);

                if (decodedIdentity === undefined) {
                    const addressBuffer = await this.#state.getRegisteredWriterKey(writerKeyHex);

                    if (!addressBuffer || b4a.byteLength(addressBuffer) !== this.#config.addressLength) {
                        // Autobase membership can arrive before the signed address mapping.
                        // Retry on the next scan instead of caching a transient absence forever.
                        continue;
                    }

                    const addr = bufferToAddress(addressBuffer, this.#config.addressPrefix);
                    const publicKey = tracCryptoApi.address.decode(addr);

                    if (!publicKey) {
                        this.#keyDecodeCache.set(writerKeyHex, null);
                        continue;
                    }

                    const publicKeyHex = b4a.toString(publicKey, "hex");
                    decodedIdentity = { addr, publicKey, publicKeyHex };
                    this.#keyDecodeCache.set(writerKeyHex, decodedIdentity);
                }

                if (decodedIdentity === null) continue;

                const { addr, publicKey, publicKeyHex } = decodedIdentity;

                if (value.isRemoved || (value.isIndexer && addr !== adminEntry?.address)) {
                    removedMap.set(addr, publicKey);
                    continue;
                }

                activeMap.set(addr, { key, address: addr, publicKey, publicKeyHex });
            }

            // Writer iteration order does not represent key age. Only a complete scan
            // can establish that a removed writer has no active replacement.
            for (const [addr, publicKey] of removedMap) {
                if (!this.#shouldRun()) break;
                if (!activeMap.has(addr)) this.#enforceNoStaleConnections(publicKey);
            }
        } catch (err) {
            this.#logger.error(`Autobase writer scan error: ${err.message}`);
        }

        return Array.from(activeMap.values());
    }

    /**
     * Attempts to establish a connection with a validator candidate.
     *
     * Revalidates the role because discovery may predate a promotion or removal.
     *
     * Behavior:
     * - Delegates connection attempt to the network layer.
     * @param {Object} candidate - The target validator candidate object.
     * @returns {Promise<string>} The connection status string returned by the network layer.
     */
    async #tryConnect(candidate) {
        try {
            if (!await this.#state.isValidatorAddress(candidate.address)) return CONNECTION_STATUS.IGNORED;
            return await this.#network.tryConnect(candidate.publicKeyHex, "validator");
        } catch (err) {
            this.#logger.error(`Validator connection attempt failed: ${err.message}`);
        }
    }
}

export default ValidatorObserverService;
