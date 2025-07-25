import b4a from 'b4a';
import BaseResponse from './base/baseResponse.js';
class ValidatorResponse extends BaseResponse {

    constructor(state, wallet) {
        super(state, wallet);
    }

    async validate(message, channelString) {
        if (!this.validatePayload(message)) return false;
        if (!this.validateIssuerPublicKey(message)) return false;
        if (!this.validateTimestamp(message)) return false;
        if (!await this.validateNodeEntry(message)) return false;
        if (!await this.validateWritingKey(message)) return false;
        if (!await this.validateValidatorSignature(message)) return false;
        if (!this.validateChannel(message, channelString)) return false;

        return true;
    }

    validatePayload(message) {
        if (!message ||
            !message.op ||
            !message.wk ||
            !message.address ||
            !message.nonce ||
            !message.channel ||
            !message.issuer ||
            !message.timestamp) {
            console.error("Validator response is missing required fields.");
            return false;
        }
        return true;
    }

    async validateNodeEntry(message) {
        const validatorEntry = await this.state.getNodeEntry(message.address);
        if (validatorEntry === null || !validatorEntry.isWriter || validatorEntry.isIndexer) {
            console.error("Validator entry not found in state.");
            return false;
        }
        return true;
    }

    async validateWritingKey(message) {
        const writingKey = b4a.from(message.wk, 'hex');
        const validatorEntry = await this.state.getNodeEntry(message.address);
        
        if (!validatorEntry || !b4a.equals(validatorEntry.wk, writingKey)) {
            console.error("Writing key does not match validator entry.");
            return false;
        }
        return true;
    }
}

export default ValidatorResponse;
