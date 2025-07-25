
import { NETWORK_MESSAGE_TYPES } from '../../../../utils/constants.js';
import ValidatorResponse from '../validators/ValidatorResponse.js';
import AdminResponse from '../validators/AdminResponse.js';
import CustomNodeResponse from '../validators/CustomNodeResponse.js';
import Wallet from 'trac-wallet';

class ResponseHandler {
    #network;
    #state;
    #wallet;
    responseValidator;
    adminValidator;
    constructor(network, state, wallet) {
        this.#network = network;
        this.#state = state;
        this.#wallet = wallet;
        this.responseValidator = new ValidatorResponse(this.state, this.wallet);
        this.adminValidator = new AdminResponse(this.state, this.wallet);
        this.customNodeValidator = new CustomNodeResponse(this.state, this.wallet);

    }

    get network() {
        return this.#network;
    }

    get state() {
        return this.#state;
    }

    get wallet() {
        return this.#wallet;
    }

    get validator() {
        return this.responseValidator;
    }

    async handle(message, connection, channelString) {
        switch (message.op) {
            case NETWORK_MESSAGE_TYPES.RESPONSE.VALIDATOR:
                await this.handleValidatorResponse(message, connection, channelString);
                break;
            case NETWORK_MESSAGE_TYPES.RESPONSE.ADMIN:
                await this.handleAdminResponse(message, connection, channelString);
                break;
            case NETWORK_MESSAGE_TYPES.RESPONSE.NODE:
                await this.handleCustomNodeResponse(message, connection, channelString);
                break;
            default:
                throw new Error(`Unhandled RESPONSE type: ${message}`);
        }
    }

    async handleValidatorResponse(message, connection, channelString) {
        const isValid = await this.validator.validate(message, channelString);
        if (isValid) {
            const validatorAddressString = message.address;
            const validatorPublicKey = Wallet.decodeBech32m(validatorAddressString);

            console.log('Validator stream established', validatorAddressString);
            this.network.validator_stream = connection;
            this.network.validator = validatorPublicKey;
        } else {
            throw new Error("Validator response verification failed");
        }
    }

    async handleAdminResponse(message, connection, channelString) {
        const isValid = await this.adminValidator.validate(message, channelString);
        if (isValid) {
            const adminEntry = await this.state.getAdminEntry();
            const adminPublicKey = Wallet.decodeBech32m(adminEntry.tracAddr);

            console.log('Admin stream established:', adminEntry.tracAddr);
            this.network.admin_stream = connection;
            this.network.admin = adminPublicKey;
        } else {
            throw new Error("Admin response verification failed");
        }
    }

    async handleCustomNodeResponse(message, connection, channelString) {
        const isValid = await this.customNodeValidator.validate(message, channelString);
        if (isValid) {
            const customNodeAddressString = message.address;
            const customNodePublicKey = Wallet.decodeBech32m(customNodeAddressString);

            console.log('Custom node stream established:', customNodeAddressString);
            this.network.custom_stream = connection;
            this.network.custom_node = customNodePublicKey;
        } else {
            throw new Error("Custom node response verification failed");
        }
    }


}

export default ResponseHandler;
