
import { BATCH_SIZE, PROCESS_INTERVAL_MS } from '../../../utils/constants.js';
import { sleep } from '../../../utils/helpers.js';
class PoolService {
    #processInterval = null;
    #state;
    #address;
    #options;
    #tx_pool = []; // TODO: Probably it is a good idea to limit the size of the pool in the future.

    constructor(state, address, options = {}) {
        this.#state = state;
        this.#address = address;
        this.#options = options;
    }

    get tx_pool() {
        return this.#tx_pool;
    }

    get state() {
        return this.#state;
    }

    get address() {
        return this.#address;
    }

    get options() {
        return this.#options;
    }

    async start() {
        if (!this.options.enable_wallet) {
            console.log('PoolService can not start. Wallet is not enabled');
            return;
        }

        const interval = setInterval(async () => {
            try {
                await this.#processTransactions();
            } catch (error) {
                console.error('error in the PoolService:', error);
                this.stopPool();
            }
        }, PROCESS_INTERVAL_MS);

        this.#processInterval = interval;
    }

    async #processTransactions() {
        const canValidate = await this.#checkValidationPermissions();

        if (canValidate && this.tx_pool.length > 0) {
            const batch = this.#prepareBatch();
            await this.state.append(batch);
        }
    }

    async #checkValidationPermissions() {
        const isAdminAllowedToValidate = await this.state.isAdminAllowedToValidate();
        const isNodeAllowedToValidate = await this.state.allowedToValidate(this.address);
        return isNodeAllowedToValidate || isAdminAllowedToValidate;
    }

    #prepareBatch() {
        const length = Math.min(this.tx_pool.length, BATCH_SIZE);
        const batch = this.tx_pool.slice(0,length);
        this.tx_pool.splice(0, length);
        return batch;
    }

    addTransaction(tx) {
        this.tx_pool.push(tx);
    }

    stopPool() {
        if (this.#processInterval) {
            clearInterval(this.#processInterval);
            this.#processInterval = null;
        }
    }

}

export default PoolService;
