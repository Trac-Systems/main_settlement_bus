import b4a from 'b4a';
import {MAX_PARTIAL_TX_PAYLOAD_BYTE_SIZE, TRANSACTION_POOL_SIZE, MAX_WRITERS_FOR_ADMIN_INDEXER_CONNECTION} from '../../../../../utils/constants.js';
class BaseOperationHandler {
    #network;
    #state;
    #wallet;
    #rateLimiter;
    #disable_rate_limit;
    #options;
    constructor(network, state, wallet, rateLimiter, options = {}) {
        if (new.target === BaseOperationHandler) {
            throw new Error('BaseOperationHandler is abstract and cannot be instantiated directly');
        }
        this.#network = network;
        this.#state = state;
        this.#wallet = wallet;
        this.#rateLimiter = rateLimiter;
        this.#disable_rate_limit = options.disable_rate_limit === true;
        this.#options = options;
    }
    get network() {
        return this.#network;
    }
    get state() {
        return this.#state;
    }
    get wallet() {
        return this.#wallet;
    }
    get options() {
        return this.#options;
    }
    
    async validateBasicRequirements(payload, connection) {
        // Validate if operation can be processed:
        // - Non-writable nodes cannot process operations
        // - Regular indexers cannot process operations
        // - Admin-indexer can process operations only when network has less than MAX_WRITERS_FOR_ADMIN_INDEXER_CONNECTION writers
        const isAllowedToValidate = await this.state.allowedToValidate(this.wallet.address);
        const isAdminAllowedToValidate = await this.state.isAdminAllowedToValidate();
        const canValidate = isAllowedToValidate || isAdminAllowedToValidate;
        if (!canValidate) {
            throw new Error('OperationHandler: State is not writable or is an indexer without admin privileges.');
        }

        if (this.network.transactionPoolService.tx_pool.length >= TRANSACTION_POOL_SIZE) {
            throw new Error("OperationHandler: Transaction pool is full, ignoring incoming transaction.");
        }

        if (b4a.byteLength(JSON.stringify(payload)) > MAX_PARTIAL_TX_PAYLOAD_BYTE_SIZE) {
            throw new Error(`OperationHandler: Payload size exceeds maximum limit of ${MAX_PARTIAL_TX_PAYLOAD_BYTE_SIZE} bytes by ${b4a.byteLength(JSON.stringify(payload)) - MAX_PARTIAL_TX_PAYLOAD_BYTE_SIZE} bytes.`);
        }
        
        if (this.#disable_rate_limit !== true) {
            const shouldDisconnect = this.#rateLimiter.handleRateLimit(connection, this.network);
            if (shouldDisconnect) {
                throw new Error(`OperationHandler: Rate limit exceeded for peer ${b4a.toString(connection.remotePublicKey, 'hex')}. Disconnecting...`);
            }
        }
    }

    async handle(payload, connection) {
        await this.validateBasicRequirements(payload, connection);
        await this.handleOperation(payload, connection);
    }

    async handleOperation(payload, connection) {
        throw new Error('handleOperation must be implemented by child class');
    }

}
export default BaseOperationHandler;
