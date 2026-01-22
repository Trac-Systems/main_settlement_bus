import Protomux from 'protomux';
import ProtocolInterface from './ProtocolInterface.js';
import NetworkMessageRouter from './legacy/NetworkMessageRouter.js';
import b4a from 'b4a';
import c from 'compact-encoding';

class LegacyProtocol extends ProtocolInterface {
    #network;
    #channel;
    #session;
    #config;

    // TODO: Refactor this so we don't need to pass a reference for the whole network instance
    constructor(network, connection, config) {
        super(connection, config);
        this.#network = network;
        this.#config = config;
        this.init(connection);
    }

    get channel() {
        return this.#channel;
    }
    
    get session() {
        return this.#session;
    }

    init(connection) {
        // TODO: Abstract in a separate function
        const mux = Protomux.from(connection);
        connection.userData = mux;

        this.#channel = mux.createChannel({
            protocol: b4a.toString(this.#config.channel, 'utf8'),
            onopen() { },
            onclose() { }
        });

        this.#channel.open();

        // // TODO: Abstract in a separate function
        // const messageRouter = new NetworkMessageRouter(
        //     this.#network,
        //     this.#config
        // ); // why router is here????????

        // Todo: Abstract in a separate function
        this.#session = this.#channel.addMessage({
            encoding: c.json,
            onmessage: async (incomingMessage) => {
                try {
                    if (typeof incomingMessage === 'object' || typeof incomingMessage === 'string') {
                        await messageRouter.route(incomingMessage, connection, this.#session);
                    } else {
                        throw new Error('NetworkMessages: Received message is undefined');
                    }
                } catch (error) {
                    console.error(`NetworkMessages: Failed to handle incoming message: ${error.message}`);
                }
            }
        });
    }

    send(message) {
        // TODO
    }

    close() {
        // TODO
    }

}

export default LegacyProtocol;
