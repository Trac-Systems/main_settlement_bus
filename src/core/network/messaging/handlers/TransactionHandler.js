import b4a from 'b4a';
import TransactionRateLimiterService from '../../services/TransactionRateLimiterService.js';
import CompleteStateMessageOperations from "../../../../messages/completeStateMessages/CompleteStateMessageOperations.js";
import {
    MAX_PARTIAL_TX_PAYLOAD_BYTE_SIZE, OperationType,
    TRANSACTION_POOL_SIZE,
} from '../../../../utils/constants.js';
import PartialBootstrapDeployment from "../validators/PartialBootstrapDeployment.js";
import {addressToBuffer, bufferToAddress} from "../../../state/utils/address.js";
import PartialTransaction from "../validators/PartialTransaction.js";

/**
 * THIS CLASS IS ULTRA IMPORTANT BECAUSE IF SOMEONE WILL SEND A TRASH TO VALIDATOR AND IT WON'T BE HANDLED PROPERTLY -
 * FOR EXAMPLE VALIDATOR WILL BROADCAST IT TO THE INDEXER LAYER THEN IT WILL BE BANNED. SO EVERYTHING WHAT IS TRASH
 * MUST BE REFUSED.
 * TODO: WE SHOULD AUDIT VALIDATORS AND MAKE SURE THEY ARE NOT BROADCASTING TRASH TO THE INDEXER LAYER.
 */
class TransactionHandler {
    #disable_rate_limit;
    #network;
    #state;
    #wallet;
    #transactionValidator;
    #partialBootstrapDeploymentValidator
    #partialTransactionValidator
    #rateLimiter;

    constructor(network, state, wallet, options = {}) {
        this.#disable_rate_limit = options.disable_rate_limit === true;
        this.#network = network;
        this.#state = state;
        this.#wallet = wallet;
        this.#partialBootstrapDeploymentValidator = new PartialBootstrapDeployment(this.#state, this.#wallet, this.#network);
        this.#partialTransactionValidator = new PartialTransaction(this.#state, this.#wallet, this.#network)
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

    async handle(payload, connection) {
        if (this.state.isIndexer() || !this.state.isWritable()) {
            throw new Error('TransactionHandler: State is not writable or is an indexer.');
        }

        if (this.network.poolService.tx_pool.length >= TRANSACTION_POOL_SIZE) {
            throw new Error("TransactionHandler: Transaction pool is full, ignoring incoming transaction.");
        }

        if (b4a.byteLength(JSON.stringify(payload)) > MAX_PARTIAL_TX_PAYLOAD_BYTE_SIZE) {
            throw new Error(`TransactionHandler: Payload size exceeds maximum limit of ${MAX_PARTIAL_TX_PAYLOAD_BYTE_SIZE} bytes by ${b4a.byteLength(JSON.stringify(payload)) - MAX_PARTIAL_TX_PAYLOAD_BYTE_SIZE} bytes.`);
        }

        if (this.disable_rate_limit !== true) {
            const shouldDisconnect = this.#rateLimiter.handleRateLimit(connection, this.network);
            if (shouldDisconnect) {
                throw new Error(`TransactionHandler: Rate limit exceeded for peer ${b4a.toString(connection.remotePublicKey, 'hex')}. Disconnecting...`);
            }
        }
        if (payload.type === OperationType.TX) {
            await this.#partialTransactionSubHandler(payload);
        } else if (payload.type === OperationType.BOOTSTRAP_DEPLOYMENT) {
            await this.#partialBootstrapDeploymentSubHandler(payload);
        }
    }

    async #partialTransactionSubHandler(payload) {
        const normalizedPayload = this.#normalizeTransactionOperation(payload);
        const isValid = await this.#partialTransactionValidator.validate(normalizedPayload);
        if (!isValid) {
            throw new Error("TransactionHandler: Transaction validation failed.");
        }

        const completeTransactionOperation = await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
            this.#wallet,
            normalizedPayload.address,
            normalizedPayload.txo.tx,
            normalizedPayload.txo.txv,
            normalizedPayload.txo.iw,
            normalizedPayload.txo.in,
            normalizedPayload.txo.ch,
            normalizedPayload.txo.is,
            normalizedPayload.txo.bs,
            normalizedPayload.txo.mbs
        );
        this.network.poolService.addTransaction(completeTransactionOperation);
    }

    async #partialBootstrapDeploymentSubHandler(payload) {
        const normalizedPayload = this.#normalizeBootstrapDeployment(payload);
        const isValid = await this.#partialBootstrapDeploymentValidator.validate(normalizedPayload);
        if (!isValid) {
            throw new Error("TransactionHandler: bootstrap deployment validation failed.");
        }
        const completeBootstrapDeploymentOperation = await CompleteStateMessageOperations.assembleCompleteBootstrapDeployment(
            this.#wallet,
            normalizedPayload.address,
            normalizedPayload.bdo.tx,
            normalizedPayload.bdo.bs,
            normalizedPayload.bdo.in,
            normalizedPayload.bdo.is,
        )
        this.network.poolService.addTransaction(completeBootstrapDeploymentOperation);

    }

    #normalizeBootstrapDeployment(payload) {
        if (!payload || typeof payload !== 'object' || !payload.bdo) {
            throw new Error('Invalid payload for bootstrap deployment normalization.');
        }
        const {type, address, bdo} = payload;
        if (
            type !== OperationType.BOOTSTRAP_DEPLOYMENT ||
            !address ||
            !bdo.tx || !bdo.bs || !bdo.in || !bdo.is || !bdo.txv
        ) {
            throw new Error('Missing required fields in bootstrap deployment payload.');
        }

        const normalizeHex = field => (typeof field === 'string' ? b4a.from(field, 'hex') : field);
        const normalizedBdo = {
            tx: normalizeHex(bdo.tx),
            txv: normalizeHex(bdo.txv),
            bs: normalizeHex(bdo.bs),
            in: normalizeHex(bdo.in),
            is: normalizeHex(bdo.is)
        };

        return {
            type,
            address: addressToBuffer(address),
            bdo: normalizedBdo
        };
    }

    #normalizeTransactionOperation(payload) {
        if (!payload || typeof payload !== 'object' || !payload.txo) {
            throw new Error('Invalid payload for transaction operation normalization.');
        }
        const {type, address, txo} = payload;
        if (
            type !== OperationType.TX ||
            !address ||
            !txo.tx || !txo.txv || !txo.iw || !txo.in ||
            !txo.ch || !txo.is || !txo.bs || !txo.mbs
        ) {
            throw new Error('Missing required fields in transaction operation payload.');
        }

        const normalizeHex = field => (typeof field === 'string' ? b4a.from(field, 'hex') : field);
        const normalizedTxo = {
            tx: normalizeHex(txo.tx),    // Transaction hash
            txv: normalizeHex(txo.txv),  // Transaction validity
            iw: normalizeHex(txo.iw),    // Writing key
            in: normalizeHex(txo.in),    // Nonce
            ch: normalizeHex(txo.ch),    // Content hash
            is: normalizeHex(txo.is),    // Signature
            bs: normalizeHex(txo.bs),    // External bootstrap
            mbs: normalizeHex(txo.mbs)   // MSB bootstrap key
        };

        return {
            type,
            address: addressToBuffer(address),
            txo: normalizedTxo
        };
    }
}

export default TransactionHandler;
