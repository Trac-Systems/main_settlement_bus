import b4a from "b4a";
import { NETWORK_MESSAGE_TYPES } from '../../../../utils/constants.js';
import * as operation from '../../../../utils/applyOperations.js';
import { EventEmitter } from "events";
import { LegacyProtocolEventType } from "../../../../utils/constants.js";

class NetworkMessageRouter extends EventEmitter {
    #network;
    #config;

    constructor(network, config) {
        super();
        this.#network = network;
        this.#config = config;
    }

    async route(incomingMessage, connection, messageProtomux) {
        try {
            switch (true) {
                case this.#isGetRequest(incomingMessage):
                    this.#network.emit(LegacyProtocolEventType.GET, incomingMessage, connection, messageProtomux);
                    break;

                case this.#isResponse(incomingMessage):
                this.#network.emit(LegacyProtocolEventType.RESPONSE, incomingMessage, connection);
                    break;

                case this.#isRoleAccessOperation(incomingMessage):
                    this.#network.emit(LegacyProtocolEventType.ROLE_TRANSACTION, incomingMessage, connection);
                    break;

                case this.#isSubnetworkOperation(incomingMessage):
                    this.#network.emit(LegacyProtocolEventType.SUBNETWORK_TRANSACTION, incomingMessage, connection);
                    break;

                case this.#isTransferOperation(incomingMessage):
                    this.#network.emit(LegacyProtocolEventType.TRANSFER_TRANSACTION, incomingMessage, connection);
                    break;

                default:
                    connection.end();
                    break;
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
