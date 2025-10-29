// PoolService.js
import { BATCH_SIZE, PROCESS_INTERVAL_MS } from '../../../utils/constants.js';
import { sleep } from '../../../utils/helpers.js';
import { safeDecodeApplyOperation } from '../../../utils/protobuf/operationHelpers.js';
import Scheduler from '../../../utils/Scheduler.js';
import * as operationsUtils from '../../../utils/operations.js';
import b4a from 'b4a';
class PoolService {
    #state;
    #address;
    #options;
    #tx_pool = [];
    #scheduler = null;
    tx_history = new Map();

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

    remove_tx_from_tx_pool(txBuffer) {
        for (let i = 0; i < this.#tx_pool.length; i++) {
            const decodedPayload = safeDecodeApplyOperation(this.#tx_pool[i]);
            const operationKey = operationsUtils.operationToPayload(decodedPayload.type);
            const operation = decodedPayload[operationKey];
            const tx = operation.tx;
            if (b4a.equals(txBuffer, tx)) {
                this.#tx_pool.splice(i, 1);
                console.log(`Removed duplicate tx from pool at index ${i}`);
                break;
            }
        }
    }
    
    async start() {
        if (!this.options.enable_wallet) {
            console.info('PoolService can not start. Wallet is not enabled');
            return;
        }
        if (this.scheduler && this.scheduler.isRunning) {
            console.info('PoolService is already started');
            return;
        }

        this.#scheduler = this.#createScheduler();
        this.#scheduler.start();
    }

    async #worker(next) {
        try {
            await this.#processTransactions();
            if (this.#tx_pool.length > 0) {
                next(0);
            } else {
                next(PROCESS_INTERVAL_MS);
            }
        } catch (error) {
            throw new Error(`PoolService worker error: ${error.message}`);
        }
    }

    #createScheduler() {
        return new Scheduler((next) => this.#worker(next), PROCESS_INTERVAL_MS);
    }

    async #processTransactions() {
        const canValidate = await this.#checkValidationPermissions();

        if (canValidate && this.#tx_pool.length > 0) {
            const batch = this.#prepareBatch();
            await this.#state.append(batch);
        }
    }

    async #checkValidationPermissions() {
        const isAdminAllowedToValidate = await this.state.isAdminAllowedToValidate();
        const isNodeAllowedToValidate = await this.state.allowedToValidate(this.address);
        return isNodeAllowedToValidate || isAdminAllowedToValidate;
    }
 
    #prepareBatch() {
        const length = Math.min(this.tx_pool.length, BATCH_SIZE);
        const batch = this.tx_pool.slice(0, length);
        this.tx_pool.splice(0, length);
        return batch;
    }

    #extractTransactionHash(bufferPayload) {
        const decodedPayload = safeDecodeApplyOperation(bufferPayload);
        const operationKey = operationsUtils.operationToPayload(decodedPayload.type);
        const operation = decodedPayload[operationKey];
        const tx = operation.tx;
        return tx.toString('hex');
    }

    addTransaction(payload) {
        this.tx_pool.push(payload);
    }

    async stopPool(waitForCurrent = true) {
        if (!this.#scheduler) return;
        await this.#scheduler.stop(waitForCurrent);
        this.#scheduler = null;
        console.info('PoolService: closing gracefully...');
    }
}

export default PoolService;
