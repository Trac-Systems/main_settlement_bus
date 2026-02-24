// PoolService.js
import {BATCH_SIZE, PROCESS_INTERVAL_MS} from '../../../utils/constants.js';
import Scheduler from '../../../utils/Scheduler.js';
import Denque from "denque";
import b4a from "b4a";

class TransactionPoolService {
    #state;
    #address;
    #config;
    #tx_pool = new Denque();
    #transactionCommitService
    #scheduler = null;
    #queuedTxHashes

    /**
     * @param {State} state
     * @param {string} address
     * @param transactionCommitService
     * @param {object} config
     **/
    constructor(state, address, transactionCommitService, config) {
        this.#state = state;
        this.#address = address;
        this.#transactionCommitService = transactionCommitService;
        this.#queuedTxHashes = new Set(); // to improve lookup performance when checking for duplicate transactions
        this.#config = config;
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

    async start() {
        if (!this.#config.enableWallet) {
            console.info('TransactionPoolService can not start. Wallet is not enabled');
            return;
        }
        if (this.#scheduler && this.#scheduler.isRunning) {
            console.info('TransactionPoolService is already started');
            return;
        }

        this.#scheduler = this.#createScheduler();
        this.#scheduler.start();
    }

    async #worker(next) {
        try {
            await this.#processTransactions();
            if (this.#tx_pool.size() > 0) {
                next(0);
            } else {
                next(PROCESS_INTERVAL_MS);
            }
        } catch (error) {
            throw new Error(`TransactionPoolService worker error: ${error.message}`);
        }
    }

    #createScheduler() {
        return new Scheduler((next) => this.#worker(next), PROCESS_INTERVAL_MS);
    }

    async #processTransactions() {
        const canValidate = await this.#checkValidationPermissions();
        if (!canValidate || this.#tx_pool.size() === 0) return;

        const batchItems = this.#prepareBatch();
        const encodedBatch = batchItems.map(item => item.encodedTx);
        const batchTxHashes = batchItems.map(item => item.txHash);
        try {
            const receipts = await this.#state.appendWithProofOfPublication(encodedBatch, batchTxHashes);

            const receiptsByHash = new Map();
            for (const receipt of receipts) {
                if (receipt.txHash) receiptsByHash.set(receipt.txHash, receipt);
            }

            for (const item of batchItems) {
                const receipt = receiptsByHash.get(item.txHash);

                if (!receipt) {
                    this.#transactionCommitService.rejectPendingCommit(
                        item.txHash,
                        new TransactionPoolMissingCommitReceiptError(item.txHash)
                    );
                    continue;
                }

                if (!receipt.proof) {
                    this.#transactionCommitService.rejectPendingCommit(
                        item.txHash,
                        new TransactionPoolProofUnavailableError(
                            item.txHash,
                            receipt.blockNumber,
                            receipt.proofError,
                            receipt.appendedAt
                        )
                    );
                    continue;
                }

                this.#transactionCommitService.resolvePendingCommit(item.txHash, receipt);
            }
        } catch (error) {
            for (const item of batchItems) {
                this.#transactionCommitService.rejectPendingCommit(item.txHash, error);
            }
            console.error(
                `TransactionPoolService: failed to process batch (size=${batchItems.length}): ${error?.message ?? 'unknown error'}`
            );
        }
    }

    async #checkValidationPermissions() {
        const isAdminAllowedToValidate = await this.state.isAdminAllowedToValidate();
        const isNodeAllowedToValidate = await this.state.allowedToValidate(this.address);
        return isNodeAllowedToValidate || isAdminAllowedToValidate;
    }

    #prepareBatch() {
        const batch = [];
        const batchSize = Math.min(this.#tx_pool.size(), BATCH_SIZE);

        for (let i = 0; i < batchSize; i++) {
            const tx = this.#tx_pool.shift();
            this.#queuedTxHashes.delete(tx.txHash);
            batch.push(tx);
        }
        return batch;
    }

    addTransaction(txHash, encodedTx) {
        this.validateEnqueue();
        if (!txHash || !encodedTx || typeof txHash !== 'string' || !b4a.isBuffer(encodedTx)) {
            throw new TransactionPoolInvalidIncomingDataError()
        }
        if (this.hasTransaction(txHash)) {
            throw new TransactionPoolAlreadyQueuedError(txHash);
        }
        this.#queuedTxHashes.add(txHash);
        const txData = {txHash, encodedTx};
        this.tx_pool.push(txData);
    }

    async stopPool(waitForCurrent = true) {
        if (!this.#scheduler) return;
        await this.#scheduler.stop(waitForCurrent);
        this.#scheduler = null;
        this.#queuedTxHashes.clear();
        this.#tx_pool.clear();
        console.info('TransactionPoolService: closing gracefully...');
    }

    validateEnqueue() {
        if (this.#tx_pool.size() >= this.#config.txPoolSize) {
            throw new TransactionPoolFullError(this.#config.txPoolSize);
        }
    }

    hasTransaction(txHash) {
        return this.#queuedTxHashes.has(txHash);
    }
}

export class TransactionPoolProofUnavailableError extends Error {
    constructor(txHash, blockNumber, reason = 'unknown', appendedAt = 0) {
        const appendedAtValue = appendedAt instanceof Date ? appendedAt.getTime() : appendedAt;
        const safeAppendedAt = Number.isSafeInteger(appendedAtValue) ? appendedAtValue : 0;
        super(`Proof unavailable for txHash ${txHash} at block ${blockNumber} at appendedAt ${safeAppendedAt}. Reason: ${reason}`);
        this.txHash = txHash;
        this.blockNumber = blockNumber;
        this.appendedAt = safeAppendedAt;
        this.reason = reason;
    }
}

export class TransactionPoolMissingCommitReceiptError extends Error {
    constructor(txHash) {
        super(`Missing commit receipt for txHash ${txHash}`);
        this.txHash = txHash;
    }
}

export class TransactionPoolInvalidIncomingDataError extends Error {
    constructor(message = 'Invalid transaction pool incoming data') {
        super(message);
    }
}

export class TransactionPoolFullError extends Error {
    constructor(maxSize) {
        super(`Transaction pool is full. Maximum size of ${maxSize} reached.`);
        this.maxSize = maxSize
    }

}

export class TransactionPoolAlreadyQueuedError extends Error {
    constructor(txHash) {
        super(`Transaction with hash ${txHash} is already queued in the transaction pool.`);
    }
}


export default TransactionPoolService;
