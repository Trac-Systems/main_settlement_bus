
import b4a from "b4a";
//import PreTransaction from "../../validators/PreTransaction.js";
//import StateMessageOperations from "../../../../messages/stateMessages/StateMessageOperations.js";
import GetRequestHandler from "../handlers/GetRequestHandler.js";
import ResponseHandler from "../handlers/ResponseHandler.js";
import OperationHandler from "../handlers/OperationHandler.js";
//import TransactionRateLimiterService from "../../services/TransactionRateLimiterService.js";
import { 
    MAX_PRE_TX_PAYLOAD_BYTE_SIZE,
    TRANSACTION_POOL_SIZE,
    NETWORK_MESSAGE_TYPES
} from '../../../../utils/constants.js';

class NetworkMessageRouter {
    // #rateLimiter;
    #network;
    #handlers;

    constructor(network, state, wallet, handleIncomingEvent) {
        this.#network = network;
        //this.#rateLimiter = new TransactionRateLimiterService();
        this.#handlers = {
            get: new GetRequestHandler(wallet, state),
            response: new ResponseHandler(network, state, wallet),
            operation: new OperationHandler(handleIncomingEvent)
        }
    }

    get network() {
        return this.#network;
    }


    // get rateLimiter() {
    //     return this.#rateLimiter;
    // }

    async route(incomingMessage, connection, messageProtomux) {
        try {
            const channelString = b4a.toString(this.network.channel, 'utf8');

            if (this.#isGetRequest(incomingMessage)) {
                await this.#handlers.get.handle(incomingMessage, messageProtomux, connection, channelString);
                this.network.swarm.leavePeer(connection.remotePublicKey);

            } else if (this.#isResponse(incomingMessage)) {
                await this.#handlers.response.handle(incomingMessage, connection, channelString);
                this.network.swarm.leavePeer(connection.remotePublicKey);

            } else if (this.#isOperation(incomingMessage)) {
                await this.#handlers.operation.handle(incomingMessage, connection);
                this.network.swarm.leavePeer(connection.remotePublicKey);
            }
            // else {
            //     await this.#handlePreTransaction(incomingMessage, connection);
            //     this.network.swarm.leavePeer(connection.remotePublicKey);
            // }
        } catch (error) {
            throw new Error(`Failed to route message: ${error}`);
        }
    }

    #isGetRequest(message) {
        return Object.values(NETWORK_MESSAGE_TYPES.GET).includes(message);
    }


    #isResponse(message) {
        return Object.values(NETWORK_MESSAGE_TYPES.RESPONSE).includes(message.op);
    }

    #isOperation(message) {
        return Object.values(NETWORK_MESSAGE_TYPES.OPERATION).includes(message.op);
    }

    // async #handlePreTransaction(incomingMessage, connection) {
    //     if (this.state.isIndexer() || !this.state.isWritable()) return;
    //     if (true !== this.network.disable_rate_limit) {
    //         const shouldDisconnect = this.#rateLimiter.handleRateLimit(connection, this.network);
    //         if (shouldDisconnect) {
    //             throw new Error(`Rate limit exceeded for peer ${b4a.toString(connection.remotePublicKey, 'hex')}. Disconnecting...`);
    //         }
    //     }

    //     if (this.network.poolService.tx_pool.length >= TRANSACTION_POOL_SIZE) {
    //         throw new Error("Transaction pool is full, ignoring incoming transaction.");
    //     }

    //     if (b4a.byteLength(JSON.stringify(incomingMessage)) > MAX_PRE_TX_PAYLOAD_BYTE_SIZE) {
    //         throw new Error(`Payload size exceeds maximum limit of ${MAX_PRE_TX_PAYLOAD_BYTE_SIZE} bytes by .`);
    //     }

    //     const parsedPreTx = incomingMessage;
    //     console.log("Parsed PreTransaction:", parsedPreTx);
    //     const validator = new PreTransaction(this.state, this.wallet, this.network);
    //     const isValid = await validator.validate(parsedPreTx);

    //     if (isValid) {
    //         const postTx = await StateMessageOperations.assemblePostTxMessage(
    //             this.wallet,
    //             parsedPreTx.va,
    //             b4a.from(parsedPreTx.tx, 'hex'),
    //             parsedPreTx.ia,
    //             b4a.from(parsedPreTx.iw, 'hex'),
    //             b4a.from(parsedPreTx.in, 'hex'),
    //             b4a.from(parsedPreTx.ch, 'hex'),
    //             b4a.from(parsedPreTx.is, 'hex'),
    //             b4a.from(parsedPreTx.bs, 'hex'),
    //             b4a.from(parsedPreTx.mbs, 'hex')
    //         );
    //         this.network.poolService.addTransaction(postTx);
    //     }
    // }
}


export default NetworkMessageRouter;
