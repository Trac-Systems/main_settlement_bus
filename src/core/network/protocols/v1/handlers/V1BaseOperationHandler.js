import {ResultCode} from "../../../../../utils/constants.js";
import {V1ProtocolError} from "../V1ProtocolError.js";
import ConnectionOperationHandler from "../../shared/ConnectionOperationHandler.js";

class V1BaseOperationHandler extends ConnectionOperationHandler{
    #rateLimiterService;
    #pendingRequestService;
    constructor(rateLimiterService, pendingRequestService, config) {
        super(config);
        this.#rateLimiterService = rateLimiterService;
        this.#pendingRequestService = pendingRequestService;
    }


    applyRateLimit(connection) {
        if (!this.config.disableRateLimit) {
            this.#rateLimiterService.v1HandleRateLimit(connection);
        }
    }

    async resolvePendingResponse(message, connection, validator, extractResultCode) {
        const pendingRequestServiceEntry = this.#pendingRequestService.getPendingRequest(message.id);
        //TODO: Investigate if this return false shouldn't be a throw.
        if (!pendingRequestServiceEntry) return false;

        this.#pendingRequestService.stopPendingRequestTimeout(message.id);
        await validator.validate(message, connection, pendingRequestServiceEntry);

        const resultCode = extractResultCode(message);
        this.#pendingRequestService.resolvePendingRequest(message.id, resultCode);
        return true;
    }

    handlePendingResponseError(messageId, connection, error, step) {
        const protocolError = this.#toProtocolError(error);
        const rejected = this.#pendingRequestService.rejectPendingRequest(messageId, protocolError);
        if (!rejected) return;
        this.displayError(step, connection.remotePublicKey, protocolError);
    }

    #toProtocolError(error) {
        if (error instanceof V1ProtocolError) {
            return error;
        }
        return new V1ProtocolError(ResultCode.UNEXPECTED_ERROR, error?.message ?? 'Unexpected error');
    }
}

export default V1BaseOperationHandler;
