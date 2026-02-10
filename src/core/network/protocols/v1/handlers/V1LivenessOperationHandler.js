import {networkMessageFactory} from "../../../../../messages/network/v1/networkMessageFactory.js";
import {NETWORK_CAPABILITIES, ResultCode} from "../../../../../utils/constants.js";
import V1LivenessRequest from "../validators/V1LivenessRequest.js";
import {getResultCode, shouldEndConnection, UnexpectedError} from "../V1ProtocolError.js";
import {publicKeyToAddress, sleep} from "../../../../../utils/helpers.js";
import V1LivenessResponse from "../validators/V1LivenessResponse.js";

class V1LivenessOperationHandler {
    #wallet;
    #rateLimiterService;
    #pendingRequestService;
    #v1LivenessRequestValidator;
    #v1LivenessResponseValidator;
    #config;

    constructor(wallet, rateLimiterService, pendingRequestService, config) {
        this.#wallet = wallet;
        this.#rateLimiterService = rateLimiterService;
        this.#pendingRequestService = pendingRequestService;
        this.#v1LivenessRequestValidator = new V1LivenessRequest(config);
        this.#v1LivenessResponseValidator = new V1LivenessResponse(config);
        this.#config = config;

    }

    async handleRequest(message, connection) {
        let resultCode = ResultCode.OK;
        let endConnection = false;
        try {
            if (!this.#config.disableRateLimit) {
                this.#rateLimiterService.v1HandleRateLimit(connection);
            }
            await this.#v1LivenessRequestValidator.validate(message, connection.remotePublicKey);
        } catch (error) {
            resultCode = getResultCode(error);
            endConnection = shouldEndConnection(error);
            this.displayError("failed to process liveness request from sender",
                connection.remotePublicKey,
                error
            );
        }

        try {
            const response = await this.#buildLivenessResponsePayload(message.id, NETWORK_CAPABILITIES, resultCode);
            connection.protocolSession.sendAndForget(response);
            if (endConnection) connection.end();
        } catch (error) {
            this.displayError("failed to build/send response to sender",
                connection.remotePublicKey,
                error
            );
            connection.end();
        }
    }

    async handleResponse(message, connection) {
        try {
            if (!this.#config.disableRateLimit) {
                this.#rateLimiterService.v1HandleRateLimit(connection);
            }
            const pendingRequestServiceEntry = this.#pendingRequestService.getPendingRequest(message.id);
            if (!pendingRequestServiceEntry) return;
            this.#pendingRequestService.stopPendingRequestTimeout(message.id)

            await this.#v1LivenessResponseValidator.validate(message, connection, pendingRequestServiceEntry);
            this.#pendingRequestService.resolvePendingRequest(message.id);

        } catch (error) {
            const err = (error && error.resultCode) ? error : new UnexpectedError(error.message, false);
            const rejected = this.#pendingRequestService.rejectPendingRequest(message.id, err);
            if (!rejected) return;
            if (shouldEndConnection(err)) connection.end();
            this.displayError("failed to process liveness response from sender",
                connection.remotePublicKey,
                error
            );
        }
    }

    async #buildLivenessResponsePayload(id, capabilities, resultCode) {
        try {
            return await networkMessageFactory(this.#wallet, this.#config).buildLivenessResponse(
                id,
                capabilities,
                resultCode
            );
        } catch (error) {
            throw new UnexpectedError(`Failed to build liveness response: ${error.message}`, true);
        }
    }

    displayError(step = "undefined step", senderPublicKey, error) {
        console.error(`${this.constructor.name}: ${step} ${publicKeyToAddress(senderPublicKey, this.#config)}: ${error.message}`);
    }
}

export default V1LivenessOperationHandler;
