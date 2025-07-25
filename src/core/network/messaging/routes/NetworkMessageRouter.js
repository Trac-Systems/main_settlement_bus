
import b4a from "b4a";

import GetRequestHandler from "../handlers/GetRequestHandler.js";
import ResponseHandler from "../handlers/ResponseHandler.js";
import OperationHandler from "../handlers/OperationHandler.js";
import TransactionHandler from "../handlers/TransactionHandler.js";
import { NETWORK_MESSAGE_TYPES } from '../../../../utils/constants.js';

class NetworkMessageRouter {
    #network;
    #handlers;

    constructor(network, state, wallet, handleIncomingEvent, options = {}) {
        this.#network = network;
        this.#handlers = {
            get: new GetRequestHandler(wallet, state),
            response: new ResponseHandler(network, state, wallet),
            operation: new OperationHandler(handleIncomingEvent),
            transaction: new TransactionHandler(network, state, wallet, options)
        }
    }

    get network() {
        return this.#network;
    }

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
            else {
                await this.#handlers.transaction.handle(incomingMessage, connection);
                this.network.swarm.leavePeer(connection.remotePublicKey);
            }
            
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
}


export default NetworkMessageRouter;
