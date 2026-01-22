import ValidatorResponse from '../validators/ValidatorResponse.js';
import PeerWallet from 'trac-wallet';

class ResponseHandler {
    #network;
    #state;
    #responseValidator;
    #adminValidator;
    #customNodeValidator;
    
    constructor(network, state, wallet, config) {
        this.#network = network;
        this.#state = state;
        this.#responseValidator = new ValidatorResponse(this.state, wallet, config);

    }

    get network() {
        return this.#network;
    }

    get state() {
        return this.#state;
    }

    get responseValidator() {
        return this.#responseValidator;
    }

    get adminValidator() {
        return this.#adminValidator;
    }
    
    get customNodeValidator() {
        return this.#customNodeValidator;
    }

    async handle(message, connection, channelString) {
        await this.#handleValidatorResponse(message, connection, channelString);
    }

    async #handleValidatorResponse(message, connection, channelString) {
        const isValid = await this.responseValidator.validate(message, channelString);
        if (isValid) {
            const validatorAddressString = message.address;
            const validatorPublicKey = PeerWallet.decodeBech32m(validatorAddressString);

            if (this.network.validatorConnectionManager.connected(validatorPublicKey)) {
                return;
            }

            // console.log('Validator stream established', validatorAddressString);
            this.network.validatorConnectionManager.addValidator(validatorPublicKey, connection)
        } else {
            throw new Error("Validator response verification failed");
        }
    }
}

export default ResponseHandler;
