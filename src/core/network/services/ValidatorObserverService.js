import PeerWallet from "trac-wallet";
import b4a from "b4a";
import { MAX_WRITERS_FOR_ADMIN_INDEXER_CONNECTION, TRAC_ADDRESS_SIZE } from '../../../utils/constants.js';
import { bufferToAddress } from '../../state/utils/address.js';
import { sleep } from '../../../utils/helpers.js';
import Scheduler from "../../../utils/Scheduler.js";

const POLL_INTERVAL = 1000
const DELAY_INTERVAL = 250

class ValidatorObserverService {
    #enable_validator_observer;
    #enable_wallet;
    #state;
    #network;
    #scheduler;
    #address;

    constructor(network, state, address, options = {}) {
        this.#enable_wallet = options.enable_wallet !== false;
        this.#network = network;
        this.#state = state;
        this.#address = address;
    }

    get state() {
        return this.#state;
    }

    // Original comment for this:
    // TODO: AFTER WHILE LOOP SIGNAL TO THE PROCESS THAT VALIDATOR OBSERVER STOPPED OPERATING. 
    // OS CALLS, ACCUMULATORS, MAYBE THIS IS POSSIBLE TO CHECK I/O QUEUE IF IT COINTAIN IT. FOR NOW WE ARE USING SLEEP.
    async start() {
        if (!this.#shouldRun()) {
            console.info('PoolService can not start. Wallet is not enabled');
            return;
        }
        if (this.#scheduler && this.#scheduler.isRunning) {
            console.info('PoolService is already started');
            return;
        }

        this.#scheduler = new Scheduler(next => this.#worker(next), POLL_INTERVAL);
        this.#scheduler.start();
    }

    async stopValidatorObserver(waitForCurrent = true) {
        if (!this.#scheduler) return;
        await this.#scheduler.stop(waitForCurrent);
        this.#scheduler = null;
        console.info('PoolService: closing gracefully...');
    }


    async #worker(next) {
        if (this.#network.validator_stream === null) {
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
        if (this.#network.validator_stream !== null) return;

        const rndIndex = Math.floor(Math.random() * length);
        const validatorAddressBuffer = await this.state.getWriterIndex(rndIndex);

        if (validatorAddressBuffer === null || b4a.byteLength(validatorAddressBuffer) !== TRAC_ADDRESS_SIZE) return;

        const validatorAddress = bufferToAddress(validatorAddressBuffer);
        if (validatorAddress === address) return;

        const validatorPubKey = PeerWallet.decodeBech32m(validatorAddress).toString('hex');
        const validatorEntry = await this.state.getNodeEntry(validatorAddress);
        const adminEntry = await this.state.getAdminEntry();

        // Connection validation rules:
        // - Cannot connect if already connected to a validator
        // - Validator must exist and be a writer
        // - Cannot connect to indexers, except for admin-indexer
        // - Admin-indexer connection is allowed only when writers length has less than 25 writers
        if (
            this.#network.validator_stream !== null ||
            this.#network.validator !== null ||
            validatorEntry === null ||
            !validatorEntry.isWriter ||
            (validatorEntry.isIndexer && (adminEntry === null || validatorAddress !== adminEntry.address || length >= MAX_WRITERS_FOR_ADMIN_INDEXER_CONNECTION))
        ) {
            return;
        }

        await this.#network.tryConnect(validatorPubKey, 'validator');
    };

    #shouldRun() {
        return this.#enable_wallet
    }

    async #lengthEntry() {
        const lengthEntry = await this.state.getWriterLength();
        return Number.isInteger(lengthEntry) && lengthEntry > 0 ? lengthEntry : 0;
    }
}

export default ValidatorObserverService;
