import BaseResponse from './base/baseResponse.js';

class CustomNodeResponse extends BaseResponse {

    constructor(state, wallet) {
        super(state, wallet);
    }

    async validate(message, channelString) {
        if (!this.validatePayload(message)) return false;
        if (!this.validateIssuerPublicKey(message)) return false;
        if (!this.validateTimestamp(message)) return false;
        if (!await this.validateCustomNodeEntry(message)) return false;
        if (!await this.validateCustomNodeSignature(message)) return false;
        if (!this.validateChannel(message, channelString)) return false;

        return true;
    }

    validatePayload(message) {
        if (!message ||
            !message.op ||
            !message.address ||
            !message.nonce ||
            !message.channel ||
            !message.issuer ||
            !message.timestamp) {
            console.error("Custom node response is missing required fields.");
            return false;
        }
        return true;
    }

    async validateCustomNodeEntry(message) {
        const customNodeAddressString = message.address;
        const customNodeEntry = await this.state.getNodeEntry(customNodeAddressString);
        if (customNodeEntry === null) {
            console.error("Custom node entry is null - entry is not initialized.");
            return false;
        }
        return true;
    }
}
export default CustomNodeResponse;
