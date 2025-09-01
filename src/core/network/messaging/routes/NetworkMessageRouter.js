import b4a from "b4a";

import GetRequestHandler from "../handlers/GetRequestHandler.js";
import ResponseHandler from "../handlers/ResponseHandler.js";
import OperationHandler from "../handlers/OperationHandler.js";
import SubnetworkOperationHandler from "../handlers/SubnetworkOperationHandler.js";
import {NETWORK_MESSAGE_TYPES, OperationType} from '../../../../utils/constants.js';
import WhitelistedEventHandler from "../handlers/WhitelistedEventHandler.js";

class NetworkMessageRouter {
    #network;
    #handlers;
    #options;
    constructor(network, state, wallet, options = {}) {
        this.#network = network;
        this.#handlers = {
            get: new GetRequestHandler(wallet, state),
            response: new ResponseHandler(network, state, wallet),
            roleAccessOperation: new OperationHandler(state, wallet, network),
            subNetworkTransaction: new SubnetworkOperationHandler(network, state, wallet, options),
            whitelistedEvent: new WhitelistedEventHandler(network, state, wallet, options)
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
                await this.#handlers.roleAccessOperation.handle(incomingMessage, connection);
                this.network.swarm.leavePeer(connection.remotePublicKey);

            }
            else if (this.#isSubnetworkOperation(incomingMessage)) {
                await this.#handlers.subNetworkTransaction.handle(incomingMessage, connection);
                this.network.swarm.leavePeer(connection.remotePublicKey);
            }
            else if (incomingMessage.type === OperationType.APPEND_WHITELIST
                && this.#options.enable_auto_transaction_consent === true) {
                    await this.#handlers.whitelistedEvent.handle(incomingMessage, connection);
                this.network.swarm.leavePeer(connection.remotePublicKey);
            }
            else {
                this.network.swarm.leavePeer(connection.remotePublicKey);
            }
            
        } catch (error) {
            throw new Error(`Failed to route message: ${error.message}`);
        }
    }

    #isGetRequest(message) {
        return Object.values(NETWORK_MESSAGE_TYPES.GET).includes(message);
    }


    #isResponse(message) {
        return Object.values(NETWORK_MESSAGE_TYPES.RESPONSE).includes(message.op);
    }

    #isRoleAccessOperation(message) {
        return [OperationType.ADMIN_RECOVERY, OperationType.ADD_WRITER, OperationType.REMOVE_WRITER].includes(message.type);
    }

    #isSubnetworkOperation(message) {
        return [OperationType.BOOTSTRAP_DEPLOYMENT, OperationType.TX].includes(message.type);
    }
}


export default NetworkMessageRouter;
