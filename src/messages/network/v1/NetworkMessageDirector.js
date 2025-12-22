import NetworkMessageBuilder from './NetworkMessageBuilder.js';
import { NetworkOperationType } from '../../../utils/constants.js';

class NetworkMessageDirector {
    #builder;

    constructor(wallet, config) {
        this.#builder = new NetworkMessageBuilder(wallet, config);
    }

    async buildValidatorConnectionRequest(sessionId, issuerAddress, capabilities) {
        this.#builder.reset();
        await this.#builder
            .setType(NetworkOperationType.VALIDATOR_CONNECTION_REQUEST)
            .setSessionId(sessionId)
            .setTimestamp()
            .setIssuerAddress(issuerAddress)
            .setCapabilities(capabilities)
            .buildPayload()


        return this.#builder.getResult();
    }

    async buildValidatorConnectionResponse(sessionId, issuerAddress, capabilities, statusCode) {
        this.#builder.reset();
        await this.#builder
        .setType(NetworkOperationType.VALIDATOR_CONNECTION_RESPONSE)
        .setSessionId(sessionId)
        .setTimestamp()
        .setIssuerAddress(issuerAddress)
        .setCapabilities(capabilities)
        .setResultCode(statusCode)
        .buildPayload()

        return this.#builder.getResult();
    }

    async buildLivenessRequest(sessionId, data, capabilities) {
        this.#builder.reset();
        await this.#builder
            .setType(NetworkOperationType.LIVENESS_REQUEST)
            .setSessionId(sessionId)
            .setTimestamp()
            .setData(data)
            .setCapabilities(capabilities)
            .buildPayload();

        return this.#builder.getResult();
    }

    async buildLivenessResponse(sessionId, data, capabilities, statusCode) {
        this.#builder.reset();
        await this.#builder
            .setType(NetworkOperationType.LIVENESS_RESPONSE)
            .setSessionId(sessionId)
            .setTimestamp()
            .setData(data)
            .setCapabilities(capabilities)
            .setResultCode(statusCode)
            .buildPayload();

        return this.#builder.getResult();
    }

    async buildBroadcastTransactionRequest(sessionId, data, capabilities) {
        this.#builder.reset();
        await this.#builder
            .setType(NetworkOperationType.BROADCAST_TRANSACTION_REQUEST)
            .setSessionId(sessionId)
            .setTimestamp()
            .setData(data)
            .setCapabilities(capabilities)
            .buildPayload();

        return this.#builder.getResult();
    }

    async buildBroadcastTransactionResponse(sessionId, capabilities, statusCode) {
        this.#builder.reset();
        await this.#builder
            .setType(NetworkOperationType.BROADCAST_TRANSACTION_RESPONSE)
            .setSessionId(sessionId)
            .setTimestamp()
            .setCapabilities(capabilities)
            .setResultCode(statusCode)
            .buildPayload();

        return this.#builder.getResult();
    }

}

export default NetworkMessageDirector;
