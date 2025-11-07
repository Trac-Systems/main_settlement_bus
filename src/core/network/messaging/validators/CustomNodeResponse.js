import BaseResponse from './base/BaseResponse.js';

class CustomNodeResponse extends BaseResponse {

    constructor(state, wallet) {
        super(state, wallet);
    }

    async validate(message, channelString) {
        if (
            !this.validatePayload(message) ||
            !this.validateIssuerPublicKey(message) ||
            !this.validateTimestamp(message) ||
            !await this.validateCustomNodeEntry(message) ||
            !await this.validateSignature(message) ||
            !this.validateChannel(message, channelString)
        ) {
            throw new Error("Custom node response validation failed");
        }

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
            throw new Error("Custom node response is missing required fields.");
        }
        return true;
    }

    async validateCustomNodeEntry(message) {
        const customNodeAddressString = message.address;
        const customNodeEntry = await this.state.getNodeEntry(customNodeAddressString);
        if (customNodeEntry === null) {
            throw new Error("Custom node entry is null - entry is not initialized.");
        }
        return true;
    }
}
export default CustomNodeResponse;
