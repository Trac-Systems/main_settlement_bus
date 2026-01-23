
import Protomux from 'protomux';
import b4a from 'b4a';
import c from 'compact-encoding';
import NetworkMessageRouter from './legacy/NetworkMessageRouter.js';
import NetworkMessageRouterV1 from './v1/NetworkMessageRouter.js';
import ProtocolSession from './ProtocolSession.js';
import Network from '../Network.js';
import LegacyProtocol from './LegacyProtocol.js';
class NetworkMessages {
    #legacyMessageRouter;
    #v1MessageRouter;
    #config;
    #protocol_versions;

    /**
     * @param {object} config
     **/
    constructor(config) {
        this.#config = config;
        // Supported protocol names (Protomux "protocol" strings).
        // - legacy: tied to the current network channel/topic for backwards compatibility
        // - v1: stable versioned name to allow future v2+ to coexist
        this.#protocol_versions = {
            legacy: b4a.toString(this.#config.channel, 'utf8'),
            v1: 'network/v1'
        };
    }

    get protocol_versions() {
        return this.#protocol_versions;
    }

    initializeMessageRouter(state, wallet, rateLimiterService, txPoolService, connectionManager) {
        this.#legacyMessageRouter = new NetworkMessageRouter(
            state,
            wallet,
            rateLimiterService,
            txPoolService,
            connectionManager,
            this.#config
        );
        
        // this.#v1MessageRouter = new NetworkMessageRouterV1(
        //     state,
        //     wallet,
        //     rateLimiterService,
        //                 txPoolService,

        //     this.#config
        // );
    }

    async setupProtomuxMessages(connection) {
        // Attach a Protomux instance to this Hyperswarm connection.
        // Protomux multiplexes multiple logical protocol channels over a single encrypted stream.
        

        const legacyProtocol = new LegacyProtocol(this.#legacyMessageRouter, connection, this.#config);

        // "v1" protocol: binary payloads (protobuf over compact-encoding c.raw).
        // It runs on a different Protomux protocol name so legacy and v1 can coexist.
        const mux = Protomux.from(connection);
        connection.userData = mux;
        const v1Channel = mux.createChannel({
            protocol: this.#protocol_versions.v1,
            onopen() { },
            onclose() { }
        });

        v1Channel.open();

        const v1Session = v1Channel.addMessage({
            encoding: c.raw,
            onmessage: async (incomingMessage) => {
                try {
                    if (b4a.isBuffer(incomingMessage)) {
                        await this.#v1MessageRouter.route(incomingMessage, connection, v1Session);
                    } else {
                        throw new Error('NetworkMessages: v1 message must be a buffer');
                    }
                } catch (error) {
                    console.error(`NetworkMessages: Failed to handle incoming v1 message: ${error.message}`);
                }
            }
        });

        // ProtocolSession is attached to the Hyperswarm connection so other parts of the system (e.g. tryConnect)
        // can send messages without knowing how Protomux was initialized.
        const protocolSession = new ProtocolSession(legacyProtocol.channel, legacyProtocol.session, v1Channel, v1Session);
        
        connection.protocolSession = protocolSession;
    }
}

export default NetworkMessages;
