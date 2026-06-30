import SchedulableService from "../../../utils/scheduler/SchedulableService.js";
import { Logger } from "../../../utils/logger.js";
import { CONNECTION_STATUS } from "../../../utils/constants.js"
import b4a from "b4a";
import { bufferToAddress } from "../../../core/state/utils/address.js";
import tracCryptoApi from "trac-crypto-api";
import { publicKeyToAddress } from "../../../utils/helpers.js";


class IndexerObserverService extends SchedulableService {
    #network
    #state
    #config
    #logger
    #address

    constructor(network, state, address, config) {
        super();

        this.#network = network;
        this.#state = state;
        this.#address = address;
        this.#config = config;
        this.#logger = new Logger(config);
    }

    #shouldRun() {
        return !this.isInterrupted;
    }

    getScheduleInterval() {
        return this.#config.pollInterval;
    }

    async start() {
        super.start();
        this.#logger.info("IndexerObserverService started");
    }

    async stop(waitForCurrent = true) {
        const stopped = await super.stop(waitForCurrent);
        if (!stopped) return;
        this.#logger.info("IndexerObserverService stopped");
    }

    async #tryConnect(candidate) {
        try {
            const result = await this.#network.tryConnect(candidate.publicKeyHex, "indexer");
            if (result && result !== CONNECTION_STATUS.IGNORED) {
                this.#logger.info(`IndexerObserver: connected to indexer ${publicKeyToAddress(candidate.publicKeyHex, this.#config)} (${result})`);
            }
            return result;
        } catch (err) {
            this.#logger.error(`Indexer connection attempt failed: ${err.message}`);
        }
    }

    async #getIndexersCandidates() {
        const entries = await this.#state.getIndexersEntry();
        const candidates = [];

        for (const entry of entries) {
            const writerKeyHex = b4a.toString(entry.key, 'hex');
            const addressBuffer = await this.#state.getRegisteredWriterKey(writerKeyHex);
            if (!addressBuffer) continue;

            const addr = bufferToAddress(addressBuffer, this.#config.addressPrefix);
            if (!addr || addr === this.#address) continue;

            const publicKey = tracCryptoApi.address.decode(addr);
            const publicKeyHex = b4a.toString(publicKey, 'hex');
            candidates.push({ publicKey, publicKeyHex });
        }

        return candidates;
    }

    async #processCandidates(candidates) {
        for (const candidate of candidates) {
            if (!this.#shouldRun()) break;

            const isConnected = this.#network.indexerConnectionManager.connected(candidate.publicKey);
            const isPending = this.#network.isConnectionPending(candidate.publicKeyHex);

            if (isConnected || isPending) continue;

            await this.#tryConnect(candidate);
        }
    }

    async worker(next) {
        const interval = this.#config.pollInterval;
        if (!this.#shouldRun()) return next(interval);

        try {
            const candidates = await this.#getIndexersCandidates();
            if (candidates.length > 0) await this.#processCandidates(candidates);
        } catch (err) {
            this.#logger.error(`IndexerObserver worker error: ${err.message}`);
        }

        next(interval);
    }
}

export default IndexerObserverService;