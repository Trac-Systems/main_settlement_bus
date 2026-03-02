import ValidatorResponse from '../validators/ValidatorResponse.js';
import tracCryptoApi from 'trac-crypto-api';

class ResponseHandler {
    #responseValidator;
    #connectionManager;

    
    constructor(state, wallet, connectionManager ,config) {
        this.#responseValidator = new ValidatorResponse(state, wallet, config);
        this.#connectionManager = connectionManager;

    }

    async handle(message, connection, channelString) {
        await this.#handleValidatorResponse(message, connection, channelString);
    }

    async #handleValidatorResponse(message, connection, channelString) {
        const isValid = await this.#responseValidator.validate(message, channelString);
        if (isValid) {
            const validatorAddressString = message.address;
            const validatorPublicKey = tracCryptoApi.address.decode(validatorAddressString);

            if (this.#connectionManager.connected(validatorPublicKey)) {
                return;
                // TODO: What we should return? Or maybe we should throw?
            }

            this.#connectionManager.addValidator(validatorPublicKey, connection)
        } else {
            throw new Error("Validator response verification failed");
        }
    }
}

export default ResponseHandler;
