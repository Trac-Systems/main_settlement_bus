import Protomux from 'protomux';
import ProtocolInterface from './ProtocolInterface.js';
import c from 'compact-encoding';
import {encodeV1networkOperation, decodeV1networkOperation} from '../../../utils/protobuf/operationHelpers.js';

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
            onopen() {
            },
            onclose() {
            }
        });

        this.#channel.open();

        this.#session = this.#channel.addMessage({
            encoding: c.raw,
            onmessage: (incomingMessage) => {
                this.#router.route(incomingMessage, connection).catch((err) => {
                    console.error(`V1Protocol: unhandled router error: ${err.message}`);
                    try {
                        connection.end();
                    } catch {
                    }
                });
            }
        });
    }

    // TODO: Consider making this method private/internal-only, just like 'encode'
    // NOTE: This method might be moved to v1/NetworkMessageRouter.js as it is only used there
    decode(message) {
        return decodeV1networkOperation(message);
    }

    async send(message) {
        const encodedMessage = encodeV1networkOperation(message);
        const msgReplyPromise = this.#pendingRequestServiceInstance.registerPendingRequest(this.#publicKeyHex, message);
        try {
            this.#session.send(encodedMessage);
        } catch (error) {
            this.#pendingRequestServiceInstance.rejectPendingRequest(message.id, error);
        }
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