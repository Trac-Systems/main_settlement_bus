
import Protomux from 'protomux';
import b4a from 'b4a';
import c from 'compact-encoding';
import NetworkMessageRouter from './legacy/NetworkMessageRouter.js';
import NetworkMessageRouterV1 from './v1/NetworkMessageRouter.js';
import ProtocolSession from './ProtocolSession.js';
import Network from '../Network.js';
class NetworkMessages {
    #legacyMessageRouter;
    #v1MessageRouter;
    #network;
    #config;
    #protocol_versions;

    /**
     * @param {Network} network
     * @param {object} config
     **/
    constructor(network, config) {
        this.#network = network;
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

    initializeMessageRouter(state, wallet) {
        this.#legacyMessageRouter = new NetworkMessageRouter(
            this.#network,
            state,
            wallet,
            this.#config
        );
        this.#v1MessageRouter = new NetworkMessageRouterV1(
            this.#network,
            state,
            wallet,
            this.#config
        );
    }

    async setupProtomuxMessages(connection) {
        // Attach a Protomux instance to this Hyperswarm connection.
        // Protomux multiplexes multiple logical protocol channels over a single encrypted stream.
        const mux = Protomux.from(connection);
        connection.userData = mux;

        // "legacy" protocol: JSON payloads (compact-encoding c.json).
        // This keeps backward-compatibility with older nodes that only speak the legacy protocol.
        const legacy_channel = mux.createChannel({
            protocol: this.#protocol_versions.legacy,
            onopen() { },
            onclose() { }
        });

        legacy_channel.open();

        const legacy_message = legacy_channel.addMessage({
            encoding: c.json,
            onmessage: async (incomingMessage) => {
                try {
                    if (typeof incomingMessage === 'object' || typeof incomingMessage === 'string') {
                        await this.#legacyMessageRouter.route(incomingMessage, connection, legacy_message);
                    } else {
                        throw new Error('NetworkMessages: Received message is undefined');
                    }
                } catch (error) {
                    console.error(`NetworkMessages: Failed to handle incoming message: ${error.message}`);
                } finally {
                    // Stop attempting to maintain a direct joinPeer connection after handling a message.
                    // NOTE: hyperswarm.leavePeer does NOT destroy an existing connection.
                    //TODO: We need to change this.
                    this.#network.swarm.leavePeer(connection.remotePublicKey);
                }
            }
        });

        // "v1" protocol: binary payloads (protobuf over compact-encoding c.raw).
        // It runs on a different Protomux protocol name so legacy and v1 can coexist.
        const v1_channel = mux.createChannel({
            protocol: this.#protocol_versions.v1,
            onopen() { },
            onclose() { }
        });

        v1_channel.open();

        const v1_message = v1_channel.addMessage({
            encoding: c.raw,
            onmessage: async (incomingMessage) => {
                try {
                    if (b4a.isBuffer(incomingMessage)) {
                        await this.#v1MessageRouter.route(incomingMessage, connection, v1_message);
                    } else {
                        throw new Error('NetworkMessages: v1 message must be a buffer');
                    }
                } catch (error) {
                    console.error(`NetworkMessages: Failed to handle incoming v1 message: ${error.message}`);
                } finally {
                    // Same rationale as legacy: stop attempting direct reconnections after processing.
                    this.#network.swarm.leavePeer(connection.remotePublicKey);
                }
            }
        });

        // ProtocolSession is attached to the Hyperswarm connection so other parts of the system (e.g. tryConnect)
        // can send messages without knowing how Protomux was initialized.
        const protocolSession = new ProtocolSession(legacy_message, v1_message);
        connection.protocolSession = protocolSession;
        return {
            protocolChannels: { legacy: legacy_channel, v1: v1_channel },
        };
    }
}

export default NetworkMessages;
