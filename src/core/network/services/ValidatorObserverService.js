import PeerWallet from "trac-wallet";
import b4a from "b4a";
import { MAX_WRITERS_FOR_ADMIN_INDEXER_CONNECTION } from '../../../utils/constants.js';
import { bufferToAddress } from '../../state/utils/address.js';
import { sleep } from '../../../utils/helpers.js';
import Scheduler from "../../../utils/Scheduler.js";
import Network from "../Network.js";

const DELAY_INTERVAL = 50;
const VALIDATOR_CANDIDATES_PER_CYCLE = 10;
const POLL_INTERVAL = (VALIDATOR_CANDIDATES_PER_CYCLE + 1) * DELAY_INTERVAL;
const MAX_POOL_SIZE = 10000;

const DEBUG = false;
const debugLog = (...args) => {
    if (DEBUG) {
        console.log('DEBUG [ValidatorObserverService] ==> ', ...args);
    }
};

class ValidatorObserverService {
    #config;
    #state;
    #network;
    #scheduler;
    #address;
    #isInterrupted;
    #activeWriterArray = [];
    #addressIndex = new Map();
    #isSyncing = false;
    #lastSyncedIndex = 0;

    /**
     * @param {Network} network
     * @param {State} state
     * @param {string} address
     * @param {object} config
     **/
    constructor(network, state, address, config) {
        this.#config = config;
        this.#network = network;
        this.#state = state;
        this.#address = address;
        this.#isInterrupted = false;
        
        if (DEBUG) {
            this.initTimestamp = Date.now();
            this.reachedMax = false;
            this.end = 0;
            this.begin = 0;
        }
    }

    get state() {
        return this.#state;
    }

    async start() {
        if (!this.#shouldRun()) {
            console.info('ValidatorObserverService can not start. Disabled by configuration.');
            return;
        }
        if (this.#scheduler && this.#scheduler.isRunning) {
            console.info('ValidatorObserverService is already started');
            return;
        }

        this.#isInterrupted = false;
        this.#scheduler = new Scheduler(next => this.#worker(next), POLL_INTERVAL);
        this.#scheduler.start();
    }

    async stopValidatorObserver(waitForCurrent = true) {
        if (!this.#scheduler) return;
        this.#isInterrupted = true;
        await this.#scheduler.stop(waitForCurrent);
        this.#scheduler = null;
        console.info('ValidatorObserverService: closing gracefully...');
    }

    async #worker(next) {
        this.#scheduleSync();
        if (!this.#network.validatorConnectionManager.maxConnectionsReached()) {
            if (DEBUG) this.begin = Date.now();
            
            // Fetch global state once per cycle to prevent I/O bottlenecks
            const adminEntry = await this.state.getAdminEntry();
            const validatorListLength = await this.#lengthEntry(); 
            
            const promises = [];
            for (let i = 0; i < VALIDATOR_CANDIDATES_PER_CYCLE; i++) {
                promises.push(
                    this.#findValidator(this.#address, adminEntry, validatorListLength).catch(err => {
                        if (DEBUG) console.error('Validator search error:', err.message);
                    })
                );
                await sleep(DELAY_INTERVAL); 
            }
            await Promise.all(promises);

            if (DEBUG) this.end = Date.now();
            debugLog('Worker cycle completed in (ms):', this.end - this.begin, '| Validator Connections:', this.#network.validatorConnectionManager.connectionCount(), " | Pending: ", this.#network.pendingConnectionsCount());
        }
        else if (DEBUG) {
            if (!this.reachedMax) {
                this.reachedMax = true;
                debugLog('Max validator connections reached. Skipping this cycle.');
                const now = Date.now();
                const elapsed = now - this.initTimestamp;
                debugLog('>>> Time elapsed since start (ms):', elapsed);
            }
        }
        next(POLL_INTERVAL);
    }

    async #findValidator(address, adminEntry, validatorListLength) {
        if (!this.#shouldRun()) return;
        
        const maxAttempts = 50; 
        let attempts = 0;
        let isValidatorValid = false;
        let validatorAddressBuffer = null; 

        while (attempts < maxAttempts && !isValidatorValid) {
            validatorAddressBuffer = this.#selectActiveWriter();
            if (!validatorAddressBuffer) break;

            isValidatorValid = await this.#isValidatorValid(address, validatorAddressBuffer, validatorListLength, adminEntry);
            attempts++;
        }

        if (attempts >= maxAttempts) {
            debugLog('Max attempts reached without finding a valid validator.');
        } else {
            debugLog(`Found valid validator to connect after ${attempts} attempts.`);
        }

        if (!isValidatorValid) return;

        const validatorAddress = bufferToAddress(validatorAddressBuffer, this.#config.addressPrefix);
        const validatorPubKeyBuffer = PeerWallet.decodeBech32m(validatorAddress);
        const validatorPubKeyHex = validatorPubKeyBuffer.toString('hex');

        if (validatorAddress !== adminEntry?.address || validatorListLength < MAX_WRITERS_FOR_ADMIN_INDEXER_CONNECTION) {
            this.#network.tryConnect(validatorPubKeyHex, 'validator');
        }
    }

    async #isValidatorValid(forbiddenAddress, validatorAddressBuffer, validatorListLength, adminEntry) {
        if (validatorAddressBuffer === null || b4a.byteLength(validatorAddressBuffer) !== this.#config.addressLength) return false;

        const validatorAddress = bufferToAddress(validatorAddressBuffer, this.#config.addressPrefix);
        if (validatorAddress === forbiddenAddress) return false;

        const validatorPubKeyBuffer = PeerWallet.decodeBech32m(validatorAddress);
        const validatorEntry = await this.state.getNodeEntry(validatorAddress);

        if (this.#network.isConnectionPending(validatorPubKeyBuffer.toString('hex'))) {
            return false;
        }

        if (validatorAddress === adminEntry?.address && validatorListLength >= MAX_WRITERS_FOR_ADMIN_INDEXER_CONNECTION) {
            if (this.#network.validatorConnectionManager.exists(validatorPubKeyBuffer)) {
                this.#network.validatorConnectionManager.remove(validatorPubKeyBuffer);
            }
        }

        if (this.#network.validatorConnectionManager.connected(validatorPubKeyBuffer) ||
            this.#network.validatorConnectionManager.maxConnectionsReached() ||
            validatorEntry === null ||
            !validatorEntry.isWriter ||
            (validatorEntry.isIndexer && (validatorAddress !== adminEntry?.address || validatorListLength >= MAX_WRITERS_FOR_ADMIN_INDEXER_CONNECTION))
        ) {
            return false;
        }

        return true;
    }

    #shouldRun() {
        return this.#config.enableValidatorObserver && !this.#isInterrupted;
    }

    async #lengthEntry() {
        const lengthEntry = await this.state.getWriterLength();
        return Number.isInteger(lengthEntry) && lengthEntry > 0 ? lengthEntry : 0;
    }

    #addActiveWriter(addrBuffer) {
        if (this.#addressIndex.size >= MAX_POOL_SIZE) return;

        const hex = addrBuffer.toString('hex');
        if (this.#addressIndex.has(hex)) return;

        this.#addressIndex.set(hex, this.#activeWriterArray.length);
        this.#activeWriterArray.push(addrBuffer);
    }

    #removeActiveWriter(addrBuffer) {
        const hex = addrBuffer.toString('hex');
        const index = this.#addressIndex.get(hex);
        if (index === undefined) return;

        const lastIndex = this.#activeWriterArray.length - 1;
        const lastBuffer = this.#activeWriterArray[lastIndex];
        const lastHex = lastBuffer.toString('hex');

        if (index !== lastIndex) {
            this.#activeWriterArray[index] = lastBuffer;
            this.#addressIndex.set(lastHex, index);
        }

        this.#activeWriterArray.pop();
        this.#addressIndex.delete(hex);
    }

    #selectActiveWriter() {
        const arr = this.#activeWriterArray;
        return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
    }

    async #syncActiveWriters() {
        const length = await this.state.getWriterLength();

        if (!length || length <= 0) {
            this.#activeWriterArray = [];
            this.#addressIndex.clear();
            this.#lastSyncedIndex = 0;
            return;
        }

        if (length < this.#lastSyncedIndex) {
            this.#lastSyncedIndex = 0;
        }

        // Cleanup: Verify existing pool in chunks to prevent I/O spam
        const currentEntries = [...this.#addressIndex.keys()];
        const chunkSize = 200; 
        
        for (let i = 0; i < currentEntries.length; i += chunkSize) {
            const chunk = currentEntries.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (hex) => {
                const writerBuffer = b4a.from(hex, 'hex');
                const writerAddress = bufferToAddress(writerBuffer, this.#config.addressPrefix);
                const entry = await this.state.getNodeEntry(writerAddress);

                if (!entry?.isWriter) {
                    this.#removeActiveWriter(writerBuffer);
                }
            }));
        }

        // Growth: Sync new entries from the ledger
        if (length > this.#lastSyncedIndex) {
            for (let i = this.#lastSyncedIndex; i < length; i++) {
                const writerBuffer = await this.state.getWriterIndex(i);
                if (!writerBuffer) continue;

                const writerAddress = bufferToAddress(writerBuffer, this.#config.addressPrefix);
                const entry = await this.state.getNodeEntry(writerAddress);

                if (entry?.isWriter) {
                    this.#addActiveWriter(writerBuffer);
                }
            }
            this.#lastSyncedIndex = length; 
        }
    }

    #scheduleSync() {
        if (this.#isSyncing) return;

        this.#isSyncing = true;
        this.#syncActiveWriters()
            .catch(err => {
                console.error('ValidatorObserverService sync error:', err);
            })
            .finally(() => {
                this.#isSyncing = false;
            });
    }
}

export default ValidatorObserverService;