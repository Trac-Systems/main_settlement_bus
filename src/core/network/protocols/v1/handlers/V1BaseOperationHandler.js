import {publicKeyToAddress} from "../../../../../utils/helpers.js";
import {shouldEndConnection, V1UnexpectedError} from "../V1ProtocolError.js";

class V1BaseOperationHandler {
    #rateLimiterService;
    #pendingRequestService;
    #config;

    constructor(rateLimiterService, pendingRequestService, config) {
        this.#rateLimiterService = rateLimiterService;
        this.#pendingRequestService = pendingRequestService;
        this.#config = config;
    }

    get config() {
        return this.#config;
    }

    applyRateLimit(connection) {
        if (!this.#config.disableRateLimit) {
            this.#rateLimiterService.v1HandleRateLimit(connection);
        }
    }

    async resolvePendingResponse(message, connection, validator, extractResultCode, stateInstance) {
        const pendingRequestServiceEntry = this.#pendingRequestService.getPendingRequest(message.id);
        if (!pendingRequestServiceEntry) return false;

        this.#pendingRequestService.stopPendingRequestTimeout(message.id);
        await validator.validate(message, connection, pendingRequestServiceEntry, stateInstance);

        const resultCode = extractResultCode(message);
        this.#pendingRequestService.resolvePendingRequest(message.id, resultCode);
        return true;
    }

    handlePendingResponseError(messageId, connection, error, step) {
        const protocolError = this.#toProtocolError(error);
        const rejected = this.#pendingRequestService.rejectPendingRequest(messageId, protocolError);
        if (!rejected) return;
        if (shouldEndConnection(protocolError)) connection.end();
        this.displayError(step, connection.remotePublicKey, error);
    }

    displayError(step = "undefined step", senderPublicKey, error) {
        console.error(`${this.constructor.name}: ${step} ${publicKeyToAddress(senderPublicKey, this.#config)}: ${error.message}`);
    }

    #toProtocolError(error) {
        if (error && typeof error === 'object' && 'resultCode' in error) {
            return error;
        }
        return new V1UnexpectedError(error?.message ?? 'Unexpected error', false);
    }
}

export default V1BaseOperationHandler;
