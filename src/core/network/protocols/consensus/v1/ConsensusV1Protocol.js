import Protomux from 'protomux';
import c from 'compact-encoding';
import { encodeConsensusMessage } from '../../../../../codecs/consensus/v1/consensusV1OperationCodec.js';

class ConsensusV1Protocol {
    #channel;
    #session;
    #router;
    #pendingRequestService;
    #publicKeyHex;
    #connectionPolicy;

    constructor(router, connection, pendingRequestService, onClose, connectionPolicy) {
        this.#router = router;
        this.#pendingRequestService = pendingRequestService;
        this.#publicKeyHex =connection.remotePublicKey.toString('hex');
        this.#connectionPolicy = connectionPolicy;
        this.#init(connection, onClose);
    }

    get closed() {
        return !this.#channel || this.#channel.closed;
    }

    #init(connection, onClose) {
        const mux = Protomux.from(connection);

        this.#channel = mux.createChannel({
            protocol: 'consensus/v1',
            onopen() {},
            onclose: () => {
                this.#pendingRequestService.rejectPendingRequestsForSession(this, new Error('Consensus session closed before response'));
                onClose(this);
            }
        });

        if (!this.#channel) return; // connection already destroyed before protocol setup completed

        this.#session = this.#channel.addMessage({
            encoding: c.raw,
            onmessage: (incomingMessage) => {
                this.#router.route(incomingMessage, connection, this).catch((err) => {
                    this.#connectionPolicy.handleLocalError(`ConsensusV1Protocol: unhandled router error for Consensus V1 message, peer: ${this.#publicKeyHex}: ${err.message}`);
                });
            }
        });
        this.#channel.open();
    }

    async send(message) {
        if (this.closed) throw new Error('Consensus session is closed');
        const encodedMessage = encodeConsensusMessage(message);
        const msgReplyPromise = this.#pendingRequestService.registerPendingRequest(this.#publicKeyHex, message, this);
        try {
            this.#session.send(encodedMessage);
        } catch (error) {
            this.#pendingRequestService.rejectPendingRequest(message.session_id, error);
        }
        return msgReplyPromise;
    }

    sendAndForget(message) {
        if (this.closed) return;
        this.#session?.send(encodeConsensusMessage(message));
    }

    close() {
        this.#channel?.close();
    }
}

export default ConsensusV1Protocol;
