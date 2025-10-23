import b4a from "b4a";

import GetRequestHandler from "../handlers/GetRequestHandler.js";
import ResponseHandler from "../handlers/ResponseHandler.js";
import RoleOperationHandler from "../handlers/RoleOperationHandler.js";
import SubnetworkOperationHandler from "../handlers/SubnetworkOperationHandler.js";
import TransferOperationHandler from "../handlers/TransferOperationHandler.js";
import {NETWORK_MESSAGE_TYPES} from '../../../../utils/constants.js';
import * as operation from '../../../../utils/operations.js';
import TransactionRateLimiterService from "../../services/TransactionRateLimiterService.js";

class NetworkMessageRouter {
    #network;
    #handlers;
    #options;
    #rateLimiter;
    constructor(network, state, wallet, options = {}) {
        this.#network = network;
        this.#rateLimiter = new TransactionRateLimiterService();
        this.#handlers = {
            get: new GetRequestHandler(wallet, state),
            response: new ResponseHandler(network, state, wallet),
            RoleTransaction: new RoleOperationHandler(network, state, wallet, this.#rateLimiter, options),
            subNetworkTransaction: new SubnetworkOperationHandler(network, state, wallet, this.#rateLimiter, options),
            tracNetworkTransaction: new TransferOperationHandler(network, state, wallet, this.#rateLimiter, options),
        }
        this.#options = options;
    }

    get network() {
        return this.#network;
    }

    async route(incomingMessage, connection, messageProtomux) {
        try {
            // TODO: Add a check here — only a writer should be able to process the handlers isRoleAccessOperation,isSubnetworkOperation
            // and admin nodes until the writers' index is less than 25. OperationType.APPEND_WHITELIST can be processed by only READERS

            const channelString = b4a.toString(this.network.channel, 'utf8');
            if (this.#isGetRequest(incomingMessage)) {
                await this.#handlers.get.handle(incomingMessage, messageProtomux, connection, channelString);
                this.network.swarm.leavePeer(connection.remotePublicKey);
            }
            else if (this.#isResponse(incomingMessage)) {
                await this.#handlers.response.handle(incomingMessage, connection, channelString);
                this.network.swarm.leavePeer(connection.remotePublicKey);
            }
            else if (this.#isRoleAccessOperation(incomingMessage)) {
                await this.#handlers.RoleTransaction.handle(incomingMessage, connection);
                this.network.swarm.leavePeer(connection.remotePublicKey);

            }
            else if (this.#isSubnetworkOperation(incomingMessage)) {
                await this.#handlers.subNetworkTransaction.handle(incomingMessage, connection);
                this.network.swarm.leavePeer(connection.remotePublicKey);
            }
            else if(this.#isTransferOperation(incomingMessage)) {
                await this.#handlers.tracNetworkTransaction.handle(incomingMessage, connection);
                this.network.swarm.leavePeer(connection.remotePublicKey);
            }
            else {
                this.network.swarm.leavePeer(connection.remotePublicKey);
            }
            
        } catch (error) {
            throw new Error(`Failed to route message: ${error.message}. Pubkey of requester is ${connection.remotePublicKey ? b4a.toString(connection.remotePublicKey, 'hex') : 'unknown'}`);
        }
    }

    #isGetRequest(message) {
        return Object.values(NETWORK_MESSAGE_TYPES.GET).includes(message);
    }


    #isResponse(message) {
        return Object.values(NETWORK_MESSAGE_TYPES.RESPONSE).includes(message.op);
    }

    #isRoleAccessOperation(message) {
        return operation.isRoleAccess(message.type)
    }

    #isSubnetworkOperation(message) {
        return operation.isTransaction(message.type) ||
            operation.isBootstrapDeployment(message.type)
    }

    #isTransferOperation(message) {
        return operation.isTransfer(message.type)
    }
}


export default NetworkMessageRouter;
