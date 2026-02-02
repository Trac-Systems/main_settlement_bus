import ValidatorResponse from '../validators/ValidatorResponse.js';

class ResponseHandler {
    #responseValidator;

    constructor(state, wallet, config) {
        this.#responseValidator = new ValidatorResponse(state, wallet, config);

    }

    async handle(message, connection, channelString) {
        await this.#handleValidatorResponse(message, connection, channelString);
    }

    async #handleValidatorResponse(message, connection, channelString) {
        const isValid = await this.#responseValidator.validate(message, channelString);
        if (!isValid) {
            throw new Error("Validator response verification failed");
        }
    }
}

export default ResponseHandler;
