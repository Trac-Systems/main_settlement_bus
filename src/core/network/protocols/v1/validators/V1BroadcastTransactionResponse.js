import V1BaseOperation from "./V1BaseOperation.js";
import {MAX_PARTIAL_TX_PAYLOAD_BYTE_SIZE} from "../../../../../utils/constants.js";
import b4a from "b4a";
import {InvalidPayloadError} from "../V1ProtocolError.js";

class V1BroadcastTransactionResponse extends V1BaseOperation {
    constructor(config) {
        super(config);
    }

    async validate(payload, connection, pendingRequestServiceEntry) {
        this.isPayloadSchemaValid(payload);
        this.validateResponseType(payload, pendingRequestServiceEntry);
        this.validatePeerCorrectness(connection.remotePublicKey, pendingRequestServiceEntry);
        await this.validateSignature(payload, connection.remotePublicKey);
        return true;
    }


}

export default V1BroadcastTransactionResponse;
