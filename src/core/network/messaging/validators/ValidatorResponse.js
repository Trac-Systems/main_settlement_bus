import b4a from 'b4a';
import BaseResponse from './base/BaseResponse.js';
class ValidatorResponse extends BaseResponse {

    constructor(state, wallet) {
        super(state, wallet);
    }

    async validate(message, channelString) {
        if (
            !this.validatePayload(message) ||
            !this.validateIssuerPublicKey(message) ||
            !this.validateTimestamp(message) ||
            !await this.validateNodeEntry(message) ||
            //!await this.validateWritingKey(message) || DISABLED BECAUSE WHEN VALIDATOR WANT TO REGISTER NEW WK, THIS IS NOT POSSIBLE
            !await this.validateSignature(message) ||
            !this.validateChannel(message, channelString)
        ) {
            console.error("Validator response validation failed");
            return false;
        }
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
        const adminEntry = await this.state.getAdminEntry();

        if (validatorEntry === null || !validatorEntry.isWriter) {
            console.error("Validator entry not found in state or is not a writer.");
            return false;
        }

        if (adminEntry && message.address === adminEntry.address) {
            return true;
        }

        if (validatorEntry.isIndexer) {
            console.error("Validator is an indexer.");
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
