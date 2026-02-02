import { decodeV1networkOperation } from '../../../../utils/protobuf/operationHelpers.js';
import b4a from "b4a";
import PeerWallet from 'trac-wallet';
import { NETWORK_CAPABILITIES, ResultCode } from '../../../../utils/constants.js';
import { networkMessageFactory } from '../../../../messages/network/v1/networkMessageFactory.js';

class NetworkMessageRouterV1 {
    // TODO: WE NEED TO LEAVEPEER AND CLOSE THE CONNECTION CRITICAL Throws
    #config;
    #wallet;
    #pendingRequestsService;

    constructor(state, wallet, rateLimiterService, txPoolService, pendingRequestsService, config) {
        this.#config = config;
        this.#wallet = wallet;
        this.#pendingRequestsService = pendingRequestsService;
    }

    async route(incomingMessage, connection) {
        this.#preValidate(incomingMessage, connection);
        connection.protocolSession.setV1AsPreferredProtocol();
        const decodedMessage = decodeV1networkOperation(incomingMessage);
        switch (decodedMessage.type) {
            case 1: {

                const message = await networkMessageFactory(this.#wallet, this.#config).buildLivenessResponse(
                    decodedMessage.id,
                    NETWORK_CAPABILITIES,
                    ResultCode.OK
                );
                connection.protocolSession.sendAndForget(message);
                break;
            }
            case 2: {
                // TODO: How we gonna behave when response will be to old result === false? Decide for v1 and legacy
                const result = this.#pendingRequestsService.resolvePendingRequest(decodedMessage.id)
                break;
            }
            case 3: {
                // handle inoming broadcast request message
                break;
            }
            case 4: {
                // handle incoming broadcast response message
                break;
            }
        }


    }

    #preValidate(incomingMessage, connection) {
        if (!incomingMessage || !b4a.isBuffer(incomingMessage) || incomingMessage.length === 0 || incomingMessage.length > 4096) {
            const sender = PeerWallet.encodeBech32m(this.#config.addressPrefix, connection.remotePublicKey);
            throw new Error(`Invalid incoming V1 message format, sender: ${sender}`);
        }
    }
}

export default NetworkMessageRouterV1;
