import b4a from "b4a";
import GetRequestHandler from "../handlers/GetRequestHandler.js";
import ResponseHandler from "../handlers/ResponseHandler.js";
import RoleOperationHandler from "../handlers/RoleOperationHandler.js";
import SubnetworkOperationHandler from "../handlers/SubnetworkOperationHandler.js";
import TransferOperationHandler from "../handlers/TransferOperationHandler.js";
import {NETWORK_MESSAGE_TYPES} from '../../../../utils/constants.js';
import * as operation from '../../../../utils/applyOperations.js';
import TransactionRateLimiterService from "../../services/TransactionRateLimiterService.js";
import State from "../../../state/State.js";
import PeerWallet from "trac-wallet";

class NetworkMessageRouter {
    #network;
    #handlers;
    #config;
    #rateLimiter;

    /**
     * @param {Network} network
     * @param {State} state
     * @param {PeerWallet} wallet
     * @param {object} config
     **/
    constructor(network, state, wallet, config) {
        this.#network = network;
        this.#config = config;
        this.#rateLimiter = new TransactionRateLimiterService();
        this.#handlers = {
            get: new GetRequestHandler(wallet, state),
            response: new ResponseHandler(network, state, wallet, this.#config),
            roleTransaction: new RoleOperationHandler(network, state, wallet, this.#rateLimiter, this.#config),
            subNetworkTransaction: new SubnetworkOperationHandler(network, state, wallet, this.#rateLimiter, this.#config),
            tracNetworkTransaction: new TransferOperationHandler(network, state, wallet, this.#rateLimiter, this.#config),
        }
    }

    async route(incomingMessage, connection, messageProtomux) {
        try {
            const channelString = b4a.toString(this.#config.channel, 'utf8');
            if (this.#isGetRequest(incomingMessage)) {
                await this.#handlers.get.handle(incomingMessage, messageProtomux, connection, channelString);
                this.#network.swarm.leavePeer(connection.remotePublicKey);
            }
            else if (this.#isResponse(incomingMessage)) {
                await this.#handlers.response.handle(incomingMessage, connection, channelString);
                this.#network.swarm.leavePeer(connection.remotePublicKey);
            }
            else if (this.#isRoleAccessOperation(incomingMessage)) {
                await this.#handlers.roleTransaction.handle(incomingMessage, connection);
                this.#network.swarm.leavePeer(connection.remotePublicKey);

            }
            else if (this.#isSubnetworkOperation(incomingMessage)) {
                await this.#handlers.subNetworkTransaction.handle(incomingMessage, connection);
                this.#network.swarm.leavePeer(connection.remotePublicKey);
            }
            else if(this.#isTransferOperation(incomingMessage)) {
                await this.#handlers.tracNetworkTransaction.handle(incomingMessage, connection);
                this.#network.swarm.leavePeer(connection.remotePublicKey);
            }
            else {
                this.#network.swarm.leavePeer(connection.remotePublicKey);
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
