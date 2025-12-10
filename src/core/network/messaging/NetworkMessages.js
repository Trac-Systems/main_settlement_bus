
import Protomux from 'protomux';
import b4a from 'b4a';
import c from 'compact-encoding';
import NetworkMessageRouter from './routes/NetworkMessageRouter.js';
import Network from '../Network.js';

class NetworkMessages {
    #messageRouter;
    #network;
    #config;

    /**
     * @param {Network} network
     * @param {object} config
     **/
    constructor(network, config) {
        this.#network = network;
        this.#config = config;
    }

    initializeMessageRouter(state, wallet) {
        this.#messageRouter = new NetworkMessageRouter(
            this.#network,
            state,
            wallet,
            this.#config
        );
    }

    async setupProtomuxMessages(connection) {
        const mux = Protomux.from(connection);
        connection.userData = mux;
        const message_channel = mux.createChannel({
            protocol: b4a.toString(this.#config.channel, 'utf8'),
            onopen() { },
            onclose() { }
        });

        message_channel.open();

        const messageProtomux = message_channel.addMessage({
            encoding: c.json,
            onmessage: async (incomingMessage) => {
                try {
                    if (typeof incomingMessage === 'object' || typeof incomingMessage === 'string') {
                        await this.#messageRouter.route(incomingMessage, connection, messageProtomux);
                    } else {
                        throw new Error('NetworkMessages: Received message is undefined');
                    }
                } catch (error) {
                    console.error(`NetworkMessages: Failed to handle incoming message: ${error.message}`);
                } finally {
                    this.network.swarm.leavePeer(connection.remotePublicKey);
                }
            }
        });

        connection.messenger = messageProtomux;
        return { message_channel, message: messageProtomux };
    }
}

export default NetworkMessages;
