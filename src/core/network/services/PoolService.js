
import { BATCH_SIZE, PROCESS_INTERVAL_MS } from '../../../utils/constants.js';
import { sleep } from '../../../utils/helpers.js';
class PoolService {
    #shouldStopPool = false;
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
        while (!this.#shouldStopPool) {
            const isAdminAllowedToValidate = await this.state.isAdminAllowedToValidate();
            const isNodeAllowedToValidate = await this.state.allowedToValidate(this.address);
            const canValidate = isNodeAllowedToValidate || isAdminAllowedToValidate;
            if (canValidate && this.tx_pool.length > 0) {
                const length = this.tx_pool.length;
                const batch = [];
                for (let i = 0; i < length; i++) {
                    if (i >= BATCH_SIZE) break;
                    batch.push(this.tx_pool[i]);
                }
                await this.state.append(batch);
                this.tx_pool.splice(0, batch.length);
            }
            await sleep(PROCESS_INTERVAL_MS);
        }
    }

    addTransaction(tx) {
        this.tx_pool.push(tx);
    }

    stopPool() {
        this.#shouldStopPool = true;
    }

}

export default PoolService;
