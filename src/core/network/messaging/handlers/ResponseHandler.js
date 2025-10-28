import { NETWORK_MESSAGE_TYPES } from '../../../../utils/constants.js';
import ValidatorResponse from '../validators/ValidatorResponse.js';
import AdminResponse from '../validators/AdminResponse.js';
import CustomNodeResponse from '../validators/CustomNodeResponse.js';
import PeerWallet from 'trac-wallet';
import b4a from "b4a";

class ResponseHandler {
    #network;
    #state;
    #responseValidator;
    #adminValidator;
    #customNodeValidator;
    
    constructor(network, state, wallet) {
        this.#network = network;
        this.#state = state;
        this.#responseValidator = new ValidatorResponse(this.state, wallet);
        this.#adminValidator = new AdminResponse(this.state, wallet);
        this.#customNodeValidator = new CustomNodeResponse(this.state, wallet);

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
        switch (message.op) {
            case NETWORK_MESSAGE_TYPES.RESPONSE.VALIDATOR:
                await this.#handleValidatorResponse(message, connection, channelString);
                break;
            case NETWORK_MESSAGE_TYPES.RESPONSE.ADMIN:
                await this.#handleAdminResponse(message, connection, channelString);
                break;
            case NETWORK_MESSAGE_TYPES.RESPONSE.NODE:
                await this.#handleCustomNodeResponse(message, connection, channelString);
                break;
            default:
                throw new Error(`Unhandled RESPONSE type: ${message}`);
        }
    }

    async #handleValidatorResponse(message, connection, channelString) {
        const isValid = await this.responseValidator.validate(message, channelString);
        if (isValid) {
            const validatorAddressString = message.address;
            const validatorPublicKey = PeerWallet.decodeBech32m(validatorAddressString);

            if (this.network.validatorConnectionManager.isConnected(validatorPublicKey)) {
                return;
            }

            console.log('Validator stream established', validatorAddressString);
            
            this.network.validatorConnectionManager.whiteList(validatorPublicKey)
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
