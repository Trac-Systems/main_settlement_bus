import { normalizeBuffer } from "../../../../utils/buffer.js";
import { NETWORK_MESSAGE_TYPES } from '../../../../utils/constants.js';
import b4a from 'b4a';

class OperationHandler {
    #handleIncomingEvent

    constructor(handleIncomingEvent) {
        this.#handleIncomingEvent = handleIncomingEvent;
    }

    get handleIncomingEvent() {
        return this.#handleIncomingEvent;
    }

    async handle(message, connection) {
        if (message.op === NETWORK_MESSAGE_TYPES.OPERATION.ADD_WRITER ||
            message.op === NETWORK_MESSAGE_TYPES.OPERATION.REMOVE_WRITER ||
            message.op === NETWORK_MESSAGE_TYPES.OPERATION.ADD_ADMIN ||
            message.op === NETWORK_MESSAGE_TYPES.OPERATION.WHITELISTED) {
            const messageBuffer = normalizeBuffer(message.transactionPayload);
            if (!messageBuffer) {
                const peer = b4a.toString(connection.remotePublicKey, 'hex');
                throw new Error(`Invalid operation message from peer ${peer}`);
            }
            this.handleIncomingEvent(messageBuffer)
        }
    }
}

export default OperationHandler;