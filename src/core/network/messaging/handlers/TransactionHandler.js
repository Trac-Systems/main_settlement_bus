import b4a from 'b4a';
import PreTransaction from '../validators/PreTransaction.js';
import TransactionRateLimiterService from '../../services/TransactionRateLimiterService.js';
import StateMessageOperations from "../../../../messages/stateMessages/StateMessageOperations.js";
import {
    MAX_PRE_TX_PAYLOAD_BYTE_SIZE,
    TRANSACTION_POOL_SIZE,
} from '../../../../utils/constants.js';

class TransactionHandler {
    #disable_rate_limit;
    #network;
    #state;
    #wallet;
    #transactionValidator;
    #rateLimiter;

    constructor(network, state, wallet, options = {}) {
        this.#disable_rate_limit = options.disable_rate_limit === true;
        this.#network = network;
        this.#state = state;
        this.#wallet = wallet;
        this.#transactionValidator = new PreTransaction(this.#state, this.#wallet, this.#network);
        this.#rateLimiter = new TransactionRateLimiterService();
    }

    get network() {
        return this.#network;
    }

    get state() {
        return this.#state;
    }

    get transactionValidator() {
        return this.#transactionValidator;
    }

    get rateLimiter() {
        return this.#rateLimiter;
    }

    get disable_rate_limit() {
        return this.#disable_rate_limit;
    }

    async handle(parsedPreTx, connection) {

        if (this.state.isIndexer() || !this.state.isWritable()) return {
            throw: new Error('TransactionHandler: State is not writable or is an indexer.')
        }

        if (this.network.poolService.tx_pool.length >= TRANSACTION_POOL_SIZE) {
            throw new Error("TransactionHandler: Transaction pool is full, ignoring incoming transaction.");
        }

        if (b4a.byteLength(JSON.stringify(parsedPreTx)) > MAX_PRE_TX_PAYLOAD_BYTE_SIZE) {
            throw new Error(`TransactionHandler: Payload size exceeds maximum limit of ${MAX_PRE_TX_PAYLOAD_BYTE_SIZE} bytes by ${b4a.byteLength(JSON.stringify(parsedPreTx)) - MAX_PRE_TX_PAYLOAD_BYTE_SIZE} bytes.`);
        }

        const isValid = await this.transactionValidator.validate(parsedPreTx);

        if (!isValid) {
            throw new Error("TransactionHandler: Transaction validation failed.");
        }

        if (true !== this.disable_rate_limit) {
            const shouldDisconnect = this.#rateLimiter.handleRateLimit(connection, this.network);
            if (shouldDisconnect) {
                throw new Error(`TransactionHandler: Rate limit exceeded for peer ${b4a.toString(connection.remotePublicKey, 'hex')}. Disconnecting...`);
            }
        }

        const postTx = await StateMessageOperations.assemblePostTxMessage(
            this.#wallet,
            parsedPreTx.va,
            b4a.from(parsedPreTx.tx, 'hex'),
            parsedPreTx.ia,
            b4a.from(parsedPreTx.iw, 'hex'),
            b4a.from(parsedPreTx.in, 'hex'),
            b4a.from(parsedPreTx.ch, 'hex'),
            b4a.from(parsedPreTx.is, 'hex'),
            b4a.from(parsedPreTx.bs, 'hex'),
            b4a.from(parsedPreTx.mbs, 'hex')
        );
        this.network.poolService.addTransaction(postTx);

    }
}

export default TransactionHandler;
