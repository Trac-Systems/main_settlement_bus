import { NETWORK_MESSAGE_TYPES } from '../../../../../utils/constants.js';
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

            console.log('Validator stream established', validatorAddressString);
            this.network.validatorConnectionManager.addValidator(validatorPublicKey, connection)
        } else {
            throw new Error("Validator response verification failed");
        }
    }

    async #handleAdminResponse(message, connection, channelString) {
        const isValid = await this.adminValidator.validate(message, channelString);
        if (isValid) {
            const adminEntry = await this.state.getAdminEntry();
            const adminPublicKey = PeerWallet.decodeBech32m(adminEntry.address);

            console.log('Admin stream established:', adminEntry.address);
            this.network.admin_stream = connection;
            this.network.admin = adminPublicKey;
        } else {
            throw new Error("Admin response verification failed");
        }
    }

    async #handleCustomNodeResponse(message, connection, channelString) {
        const isValid = await this.customNodeValidator.validate(message, channelString);
        if (isValid) {
            const customNodeAddressString = message.address;
            const customNodePublicKey = PeerWallet.decodeBech32m(customNodeAddressString);

            console.log('Custom node stream established:', customNodeAddressString);
            this.network.custom_stream = connection;
            this.network.custom_node = customNodePublicKey;
        } else {
            throw new Error("Custom node response verification failed");
        }
    }


}

export default ResponseHandler;
