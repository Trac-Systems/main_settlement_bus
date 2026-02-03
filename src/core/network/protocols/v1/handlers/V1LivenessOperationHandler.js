import BaseStateOperationHandler from "../../shared/handlers/BaseStateOperationHandler.js";
import b4a from "b4a";

class V1LivenessOperationHandler {
    #state;
    #wallet;
    #rateLimiter;
    #txPoolService;
    #config;

    constructor(state, wallet, rateLimiter, txPoolService, config) {
        this.#state = state;
        this.#wallet = wallet;
        this.#rateLimiter = rateLimiter;
        this.#txPoolService = txPoolService;
        this.#config = config;
    }


    handle(operation, connection) {

        if (!this.#config.disableRateLimit) {
            const shouldDisconnect = this.#rateLimiter.handleRateLimit(connection);
            // if (shouldDisconnect) {
            //     throw new Error(`OperationHandler: Rate limit exceeded for peer ${b4a.toString(connection.remotePublicKey, 'hex')}. Disconnecting...`);
            // }
        }
    }
}