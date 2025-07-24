
import { BATCH_SIZE, PROCESS_INTERVAL_MS } from '../../../utils/constants.js';
import { sleep } from '../../../utils/helpers.js';
class PoolService {
    #shouldStopPool = false;
    #tx_pool = [];

    constructor(state) {
        this.state = state;
    }
    
    get tx_pool() {
        return this.#tx_pool;
    }
    
    async start() {
        // Pool should be running only when node is a writer. However, for now we will run it always.
        while (!this.#shouldStopPool) {
            if (this.tx_pool.length > 0) {
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
