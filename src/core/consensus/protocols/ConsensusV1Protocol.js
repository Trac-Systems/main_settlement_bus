import Protomux from 'protomux';
import c from 'compact-encoding';
import { encodeConsensusMessage } from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';

class ConsensusV1Protocol {
    #channel;
    #session;
    #router;
    #pendingRequestService;
    #publicKeyHex;

    constructor(router, connection, pendingRequestService) {
        this.#router = router;
        this.#pendingRequestService = pendingRequestService;
        this.#publicKeyHex =connection.remotePublicKey.toString('hex');
        this.#init(connection);
    }

    #init(connection) {
        const mux = Protomux.from(connection);

        this.#channel = mux.createChannel({
            protocol: 'consensus/v1',
            onopen() {},
            onclose() {}
        });

        if (!this.#channel) return; // connection already destroyed before protocol setup completed

        this.#channel.open();

        this.#session = this.#channel.addMessage({
            encoding: c.raw,
            onmessage: (incomingMessage) => {
                this.#router.route(incomingMessage, connection).catch((err) => {
                    console.error(`ConsensusV1Protocol: unhandled router error: ${err.message}`);
                    try { connection.end(); } catch {}
                });
            }
        });
    }

    async send(message) {
        const encodedMessage = encodeConsensusMessage(message);
        const msgReplyPromise = this.#pendingRequestService.registerPendingRequest(this.#publicKeyHex, message);
        try {
            this.#session.send(encodedMessage);
        } catch (error) {
            this.#pendingRequestService.rejectPendingRequest(message.session_id, error);
        }
        return msgReplyPromise;
    }

    sendAndForget(message) {
        this.#session?.send(encodeConsensusMessage(message));
    }

    close() {
        this.#channel?.close();
    }
}

export default ConsensusV1Protocol;
