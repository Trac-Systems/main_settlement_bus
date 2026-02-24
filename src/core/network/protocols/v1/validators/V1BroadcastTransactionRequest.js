import V1BaseOperation from "./V1BaseOperation.js";
import b4a from "b4a";
import {V1InvalidPayloadError} from "../V1ProtocolError.js";

class V1BroadcastTransactionRequest extends V1BaseOperation {
    #config;

    constructor(config) {
        super(config);
        this.#config = config;
    }

    async validate(payload, remotePublicKey) {
        this.isPayloadSchemaValid(payload);
        this.isDataPropertySizeValid(payload);
        await this.validateSignature(payload, remotePublicKey);
        return true;
    }

    isDataPropertySizeValid(payload) {
        if (b4a.byteLength(payload.broadcast_transaction_request.data) > this.#config.maxPartialTxPayloadByteSize) {
            throw new V1InvalidPayloadError(`The 'data' field exceeds the maximum allowed byte size of ${this.#config.maxPartialTxPayloadByteSize}. Actual size: ${b4a.byteLength(payload.broadcast_transaction_request.data)}`);
        }
    }

}

export default V1BroadcastTransactionRequest;
