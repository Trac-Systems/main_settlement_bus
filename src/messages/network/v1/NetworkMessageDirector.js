import NetworkMessageBuilder from './NetworkMessageBuilder.js';
import { NetworkOperationType } from '../../../utils/constants.js';

/**
 * Director for v1 internal network protocol messages.
 */
class NetworkMessageDirector {
    #builder;

    /**
     * @param {PeerWallet} wallet
     * @param {object} config
     */
    constructor(wallet, config) {
        this.#builder = new NetworkMessageBuilder(wallet, config);
    }

    /**
     * Build a validator connection request message.
     * @param {number} sessionId
     * @param {string} issuerAddress
     * @param {string[]} capabilities
     * @returns {Promise<object>}
     */
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

    /**
     * Build a validator connection response message.
     * @param {number} sessionId
     * @param {string} issuerAddress
     * @param {string[]} capabilities
     * @param {number} statusCode
     * @returns {Promise<object>}
     */
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

    /**
     * Build a liveness request message.
     * @param {number} sessionId
     * @param {Buffer} data
     * @param {string[]} capabilities
     * @returns {Promise<object>}
     */
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

    /**
     * Build a liveness response message.
     * @param {number} sessionId
     * @param {Buffer} data
     * @param {string[]} capabilities
     * @param {number} statusCode
     * @returns {Promise<object>}
     */
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

    /**
     * Build a broadcast transaction request message.
     * @param {number} sessionId
     * @param {Buffer} data
     * @param {string[]} capabilities
     * @returns {Promise<object>}
     */
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

    /**
     * Build a broadcast transaction response message.
     * @param {number} sessionId
     * @param {string[]} capabilities
     * @param {number} statusCode
     * @returns {Promise<object>}
     */
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
