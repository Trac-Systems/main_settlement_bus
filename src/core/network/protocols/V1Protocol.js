import Protomux from 'protomux';
import ProtocolInterface from './ProtocolInterface.js';
import b4a from 'b4a';
import c from 'compact-encoding';
import { encodeV1networkOperation, decodeV1networkOperation } from '../../../utils/protobuf/operationHelpers.js';

class V1Protocol extends ProtocolInterface {
    #channel;
    #session;
    #config;
    #router;
    #publicKeyHex;
    #pendingRequestServiceInstance;

    constructor(router, connection, pendingRequestServiceInstance, config) {
        super(router, connection, pendingRequestServiceInstance, config);
        this.#config = config; // TODO: We are ot using config anywhere. Consider deleting it
        this.#router = router;
        this.#publicKeyHex = connection.remotePublicKey.toString('hex');
        this.#pendingRequestServiceInstance = pendingRequestServiceInstance;
        this.init(connection);
    }

    get channel() {
        return this.#channel;
    }

    get session() {
        return this.#session;
    }

    init(connection) {
        const mux = Protomux.from(connection);
        connection.userData = mux;

        this.#channel = mux.createChannel({
            protocol: 'network/v1',
            onopen() { },
            onclose() { }
        });

        this.#channel.open();

        this.#session = this.#channel.addMessage({
            encoding: c.raw,
            onmessage: async (incomingMessage) => {
                try {
                    if (b4a.isBuffer(incomingMessage)) {
                        await this.#router.route(incomingMessage, connection, this.#session);
                    } else {
                        throw new Error('NetworkMessages: v1 message must be a buffer');
                    }
                } catch (error) {
                    console.error(`NetworkMessages: Failed to handle incoming v1 message: ${error.message}`);
                }
            }
        });
    }

    // TODO: Consider making this method private/internal-only, just like 'encode'
    // NOTE: This method might be moved to v1/NetworkMessageRouter.js as it is only used there
    decode(message) {
        return decodeV1networkOperation(message);
    }

    async send(message) {
        this.#session.send(encodeV1networkOperation(message));
        const msgReplyPromise = this.#pendingRequestServiceInstance.registerPendingRequest(this.#publicKeyHex, message);
        return msgReplyPromise;
    }

    sendAndForget(message) {
        this.#session.send(encodeV1networkOperation(message));
    }

    close() {
        this.#channel.close();
    }
}

export default V1Protocol;