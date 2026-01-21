import { MessageHeader } from '../../../../utils/protobuf/network.cjs';

class NetworkMessageRouterV1 {
    #network;
    #state;
    #wallet;
    #config;

    constructor(network, state, wallet, config) {
        this.#network = network;
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
    }

    async route(incomingMessage) {
        MessageHeader.decode(incomingMessage);
    }
}

export default NetworkMessageRouterV1;
