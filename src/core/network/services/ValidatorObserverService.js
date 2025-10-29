import PeerWallet from "trac-wallet";
import b4a from "b4a";
import { MAX_WRITERS_FOR_ADMIN_INDEXER_CONNECTION, TRAC_ADDRESS_SIZE } from '../../../utils/constants.js';
import { bufferToAddress } from '../../state/utils/address.js';
import { sleep } from '../../../utils/helpers.js';
import Scheduler from "../../../utils/Scheduler.js";

const POLL_INTERVAL = 3500 // This was increase since the iterations dont wait for the execution its about 10 * DELAY_INTERVAL
const DELAY_INTERVAL = 250

class ValidatorObserverService {
    #enable_validator_observer;
    #enable_wallet;
    #state;
    #network;
    #scheduler;
    #address;
    #isInterrupted

    constructor(network, state, address, options = {}) {
        this.#enable_wallet = options.enable_wallet !== false;
        this.#network = network;
        this.#state = state;
        this.#address = address;
        this.#isInterrupted = false;
    }

    get state() {
        return this.#state;
    }

    // Original comment for this:
    // TODO: AFTER WHILE LOOP SIGNAL TO THE PROCESS THAT VALIDATOR OBSERVER STOPPED OPERATING. 
    // OS CALLS, ACCUMULATORS, MAYBE THIS IS POSSIBLE TO CHECK I/O QUEUE IF IT COINTAIN IT. FOR NOW WE ARE USING SLEEP.
    async start() {
        if (!this.#shouldRun()) {
            console.info('ValidatorObserverService can not start. Wallet is not enabled');
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
        if (!this.#network.validatorConnectionManager.maxConnections()) {
            const length = await this.#lengthEntry()

            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(this.#findValidator(this.#address, length));
                await sleep(DELAY_INTERVAL); // Low key dangerous as the network progresses
            }
            await Promise.all(promises);
        }
        next(POLL_INTERVAL)
    }

    async #findValidator(address, length) {
        if (this.#network.validatorConnectionManager.maxConnections() || !this.#shouldRun()) return;

        const rndIndex = Math.floor(Math.random() * length);
        const validatorAddressBuffer = await this.state.getWriterIndex(rndIndex);

        if (validatorAddressBuffer === null || b4a.byteLength(validatorAddressBuffer) !== TRAC_ADDRESS_SIZE) return;

        const validatorAddress = bufferToAddress(validatorAddressBuffer);
        if (validatorAddress === address) return;

        const validatorPubKey = PeerWallet.decodeBech32m(validatorAddress).toString('hex');
        const validatorEntry = await this.state.getNodeEntry(validatorAddress);
        const adminEntry = await this.state.getAdminEntry();

        if (validatorAddress === adminEntry?.address && length >= MAX_WRITERS_FOR_ADMIN_INDEXER_CONNECTION) {
            const validatorPubKeyBuffer = b4a.from(validatorPubKey, 'hex')
            if (this.#network.validatorConnectionManager.exists(validatorPubKeyBuffer)) {
                this.#network.validatorConnectionManager.remove(validatorPubKeyBuffer)
            }
        }

        // Connection validation rules:
        // - Cannot connect if already connected to a validator
        // - Validator must exist and be a writer
        // - Cannot connect to indexers, except for admin-indexer
        // - Admin-indexer connection is allowed only when writers length has less than 10 writers
        if (
            this.#network.validatorConnectionManager.connected(validatorPubKey) ||
            validatorEntry === null ||
            !validatorEntry.isWriter ||
            (validatorEntry.isIndexer && (validatorAddress !== adminEntry?.address || length >= MAX_WRITERS_FOR_ADMIN_INDEXER_CONNECTION))
        ) {
            return;
        }

        if (validatorAddress !== adminEntry?.address || length < MAX_WRITERS_FOR_ADMIN_INDEXER_CONNECTION) {
            await this.#network.tryConnect(validatorPubKey, 'validator');
        }
    };

    #shouldRun() {
        return this.#enable_wallet && !this.#isInterrupted
    }

    async #lengthEntry() {
        const lengthEntry = await this.state.getWriterLength();
        return Number.isInteger(lengthEntry) && lengthEntry > 0 ? lengthEntry : 0;
    }
}

export default ValidatorObserverService;
