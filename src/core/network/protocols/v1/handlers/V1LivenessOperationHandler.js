import {networkMessageFactory} from "../../../../../messages/network/v1/networkMessageFactory.js";
import {NETWORK_CAPABILITIES, ResultCode} from "../../../../../utils/constants.js";
import V1LivenessRequest from "../validators/V1LivenessRequest.js";
import {getResultCode, shouldEndConnection, V1UnexpectedError} from "../V1ProtocolError.js";
import V1LivenessResponse from "../validators/V1LivenessResponse.js";
import V1BaseOperationHandler from "./V1BaseOperationHandler.js";

class V1LivenessOperationHandler extends V1BaseOperationHandler {
    #wallet;
    #v1LivenessRequestValidator;
    #v1LivenessResponseValidator;

    constructor(wallet, rateLimiterService, pendingRequestService, config) {
        super(rateLimiterService, pendingRequestService, config);
        this.#wallet = wallet;
        this.#v1LivenessRequestValidator = new V1LivenessRequest(config);
        this.#v1LivenessResponseValidator = new V1LivenessResponse(config);
    }

    async handleRequest(message, connection) {
        let resultCode = ResultCode.OK;
        let endConnection = false;
        try {
            this.applyRateLimit(connection);
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
            this.applyRateLimit(connection);
            await this.resolvePendingResponse(
                message,
                connection,
                this.#v1LivenessResponseValidator,
                this.#extractLivenessResultCode
            );
        } catch (error) {
            this.handlePendingResponseError(
                message.id,
                connection,
                error,
                "failed to process liveness response from sender"
            );
        }
    }

    async #buildLivenessResponsePayload(id, capabilities, resultCode) {
        try {
            return await networkMessageFactory(this.#wallet, this.config).buildLivenessResponse(
                id,
                capabilities,
                resultCode
            );
        } catch (error) {
            throw new V1UnexpectedError(`Failed to build liveness response: ${error.message}`, true);
        }
    }

    #extractLivenessResultCode(payload) {
        return payload.liveness_response.result;
    }
}

export default V1LivenessOperationHandler;
