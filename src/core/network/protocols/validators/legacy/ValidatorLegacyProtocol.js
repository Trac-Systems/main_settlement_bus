import Protomux from 'protomux';
import ValidatorProtocolInterface from '../shared/ValidatorProtocolInterface.js';
import b4a from 'b4a';
import c from 'compact-encoding';

class ValidatorLegacyProtocol extends ValidatorProtocolInterface {
    #channel;
    #session;
    #config;
    #router;

    constructor(router, connection, pendingRequestServiceInstance = null, config) {
        super(router, connection, pendingRequestServiceInstance, config);
        this.#config = config;
        this.#router = router;
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

        if (!this.#channel) return; // connection already destroyed before protocol setup completed

        this.#channel.open();

        // Todo: Abstract in a separate function
        this.#session = this.#channel.addMessage({
            encoding: c.json,
            onmessage: async (incomingMessage) => {
                this.#router.route(incomingMessage, connection).catch((err) => {
                    console.error(`ValidatorLegacyProtocol: unhandled router error: ${err.message}`);
                    try {
                        connection.end();
                    } catch {
                    }
                });
            }
        });
    }

    // TODO: Legacy protocol does not require encoding. Consider removing this method after refactoring v1 and the protocol interface
    decode(message) {
        // No-op for legacy protocol
        return message;
    }

    async send(message) {
        this.sendAndForget(message);
        // TODO: Change 'null' to an appropriate response if needed in the future
        return Promise.resolve(null); // This is to maintain consistency with the ValidatorProtocolInterface and v1 protocol.
    }

    sendAndForget(message) {
        this.#session?.send(message);
    }

    close() {
        this.#channel?.close();
    }

}

export default ValidatorLegacyProtocol;
