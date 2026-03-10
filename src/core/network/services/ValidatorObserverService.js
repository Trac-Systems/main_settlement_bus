import { bufferToAddress } from '../../../core/state/utils/address.js';
import Scheduler from '../../../utils/Scheduler.js';
import { Logger } from '../../../utils/logger.js';

const DEFAULT_POLL_INTERVAL = 5000;

class ValidatorObserverService {
    #network;
    #state;
    #selfAddress;
    #config;
    #scheduler;
    #logger;

    constructor(network, state, selfAddress, config) {
        this.#network = network;
        this.#state = state;
        this.#selfAddress = selfAddress;
        this.#config = config;
        this.#logger = new Logger(config);
    }

    async start() {
        if ((this.#scheduler && this.#scheduler.isRunning) || !this.#config.enableValidatorObserver) {
            return;
        }
        
        const interval = this.#config.pollInterval || DEFAULT_POLL_INTERVAL;
        this.#scheduler = new Scheduler(next => this.#worker(next), interval);
        this.#scheduler.start();
        this.#logger.info('ValidatorObserverService started.');
    }

    async stopValidatorObserver(waitForCurrent = true) {
        if (!this.#scheduler) return;
        await this.#scheduler.stop(waitForCurrent);
        this.#scheduler = null;
        this.#logger.info('ValidatorObserverService stopped gracefully.');
    }

    async #worker(next) {
        const interval = this.#config.pollInterval || DEFAULT_POLL_INTERVAL;

        try {
            if (this.#network.validatorConnectionManager.maxConnectionsReached()) {
                this.#logger.debug('Max validator connections reached. Skipping cycle.');
                return next(interval);
            }

            const adminEntry = await this.#state.getAdminEntry();
            const writers = await this.#getActiveWritersFromAutobase();
            const writersCount = writers.length;

            if (writersCount > 0) {
                const randomWriterKey = writers[Math.floor(Math.random() * writersCount)];    
                await this.#tryConnect(randomWriterKey, writersCount, adminEntry);
            }

            this.#logger.debug(`Worker cycle completed. Pool size: ${writersCount} | Connections: ${this.#network.validatorConnectionManager.connectionCount()} | Pending: ${this.#network.pendingConnectionsCount()}`);
        } catch (err) {
            this.#logger.error(`ValidatorObserver worker error: ${err.message}`);
        }

        next(interval);
    }

    async #getActiveWritersFromAutobase() {
        const active = [];
        try {
            for await (const { key, value } of this.#state.base.system.list()) {            
                if (this.#scheduler && !this.#scheduler.isRunning) break;
                
                // Natively ignore removed or indexer nodes
                if (value.isRemoved || value.isIndexer) continue;
                
                const addr = bufferToAddress(key, this.#config.addressPrefix);
                if (addr === this.#selfAddress) continue;

                active.push(key);
            }
        } catch (err) {
            this.#logger.error(`Error iterating Autobase writers: ${err.message}`);
        }
        return active;
    }

    async #tryConnect(pubKey, writersCount, adminEntry) {
        const hex = pubKey.toString('hex');
        const addr = bufferToAddress(pubKey, this.#config.addressPrefix);

        // 1. Connection Guard
        if (this.#network.validatorConnectionManager.exists(pubKey) || 
            this.#network.isConnectionPending(hex)) {
            return;
        }

        // 2. Admin-Indexer Rule
        const isAdmin = addr === adminEntry?.address;
        const maxWriters = this.#config.maxWritersForAdminIndexerConnection;
        if (isAdmin && writersCount >= maxWriters) {
            return;
        }

        // 3. Final State Check: Safety check to prevent the "null" error on Mainnet
        const entry = await this.#state.getNodeEntry(addr);
        
        // FIX: Blindagem contra o erro de byteLength (entry null)
        if (entry && entry.isWriter) {
            this.#logger.info(`Attempting to connect to validator: ${addr}`);
            this.#network.tryConnect(hex, 'validator');
        } else {
            this.#logger.debug(`Skipping ${addr}: Node entry not found or not a writer in state.`);
        }
    }
}

export default ValidatorObserverService;