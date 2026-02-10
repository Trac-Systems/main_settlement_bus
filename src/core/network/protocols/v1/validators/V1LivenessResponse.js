import V1BaseOperation from "./V1BaseOperation.js";
import {InvalidPayloadError, UnexpectedError} from "../V1ProtocolError.js";
import b4a from "b4a";
import {NetworkOperationType} from "../../../../../utils/constants.js";


class V1Livenessresponse extends V1BaseOperation {
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

export default V1Livenessresponse;
