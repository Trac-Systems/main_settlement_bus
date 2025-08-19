import b4a from 'b4a';
import PreTransaction from '../validators/PreTransaction.js';
import TransactionRateLimiterService from '../../services/TransactionRateLimiterService.js';
import StateMessageOperations from "../../../../messages/stateMessages/StateMessageOperations.js";
import {
    MAX_PRE_TX_PAYLOAD_BYTE_SIZE, OperationType,
    TRANSACTION_POOL_SIZE,
} from '../../../../utils/constants.js';
import PartialBootstrapDeployment from "../validators/PartialBootstrapDeployment.js";
import {addressToBuffer, bufferToAddress} from "../../../state/utils/address.js";

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
    #rateLimiter;

    constructor(network, state, wallet, options = {}) {
        this.#disable_rate_limit = options.disable_rate_limit === true;
        this.#network = network;
        this.#state = state;
        this.#wallet = wallet;
        this.#transactionValidator = new PreTransaction(this.#state, this.#wallet, this.#network);
        this.#partialBootstrapDeploymentValidator = new PartialBootstrapDeployment(this.#state, this.#wallet, this.#network);
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

        if (b4a.byteLength(JSON.stringify(payload)) > MAX_PRE_TX_PAYLOAD_BYTE_SIZE) {
            throw new Error(`TransactionHandler: Payload size exceeds maximum limit of ${MAX_PRE_TX_PAYLOAD_BYTE_SIZE} bytes by ${b4a.byteLength(JSON.stringify(payload)) - MAX_PRE_TX_PAYLOAD_BYTE_SIZE} bytes.`);
        }

        if (this.disable_rate_limit !== true) {
            const shouldDisconnect = this.#rateLimiter.handleRateLimit(connection, this.network);
            if (shouldDisconnect) {
                throw new Error(`TransactionHandler: Rate limit exceeded for peer ${b4a.toString(connection.remotePublicKey, 'hex')}. Disconnecting...`);
            }
        }
        // TODO: TEMPORARY SOLUTION, WE SHOULD CHANGE PRE_TX AND POST_TX TO TX WHICH IS PARTIAL AND COMPLETE
        if (payload.op === OperationType.PRE_TX) {
            await this.#partialTransactionSubHandler(payload);
        } else if (payload.type === OperationType.BOOTSTRAP_DEPLOYMENT) {
            await this.#partialBootstrapDeploymentSubHandler(payload);
        }
    }

    async #partialTransactionSubHandler(parsedPreTx) {
        const isValid = await this.transactionValidator.validate(parsedPreTx);
        if (!isValid) {
            throw new Error("TransactionHandler: Transaction validation failed.");
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
        console.log(postTx)
        this.network.poolService.addTransaction(postTx);
    }

    async #partialBootstrapDeploymentSubHandler(payload) {
        const normalizedPayload = this.#normalizeBootstrapDeployment(payload);// maybe it does need to be normalized yet
        const isValid = await this.#partialBootstrapDeploymentValidator.validate(normalizedPayload);
        if (!isValid) {
            throw new Error("TransactionHandler: bootstrap deploymend validation failed.");
        }
        const completeBootstrapDeploymentOperation = await StateMessageOperations.assembleCompleteBootstrapDeployment(
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
            !bdo.tx || !bdo.bs || !bdo.in || !bdo.is
        ) {
            throw new Error('Missing required fields in bootstrap deployment payload.');
        }

        const normalizeHex = field => (typeof field === 'string' ? b4a.from(field, 'hex') : field);
        const normalizedBdo = {
            tx: normalizeHex(bdo.tx),
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
}

export default TransactionHandler;
