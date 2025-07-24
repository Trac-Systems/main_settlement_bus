import b4a from 'b4a';
import ApplyOperationEncodings from '../../state/ApplyOperationEncodings.js';
import Wallet from 'trac-wallet';
import BaseResponse from './base/baseResponse.js';
class ValidatorResponse extends BaseResponse {
    constructor(network, state, wallet) {
        super(network, state, wallet);
    }

    async validate(message, channelString) {
        if (!this.validatePayload(message)) return false;
        if (!this.validateIssuerPublicKey(message)) return false;
        if (!this.validateTimestamp(message)) return false;
        if (!await this.validateNodeEntry(message)) return false;
        if (!await this.validateWritingKey(message)) return false;
        if (!await this.validateSignature(message)) return false;
        if (!this.validateChannel(message, channelString)) return false;

        return true;
    }

    validatePayload(message) {
        if (!message.response ||
            !message.response.wk ||
            !message.response.address ||
            !message.response.nonce ||
            !message.response.channel ||
            !message.response.issuer ||
            !message.response.timestamp) {
            console.error("Validator response is missing required fields.");
            return false;
        }
        return true;
    }

    async validateNodeEntry(message) {
        const validatorEntry = await this.state.getNodeEntry(message.response.address);
        if (validatorEntry === null || !validatorEntry.isWriter || validatorEntry.isIndexer) {
            console.error("Validator entry not found in state.");
            return false;
        }
        return true;
    }

    async validateWritingKey(message) {
        const writingKey = b4a.from(message.response.wk, 'hex');
        const validatorEntry = await this.state.getNodeEntry(message.response.address);
        
        if (!validatorEntry || !b4a.equals(validatorEntry.wk, writingKey)) {
            console.error("Writing key does not match validator entry.");
            return false;
        }
        return true;
    }

    async validateSignature(message) {
        const validatorAddressString = ApplyOperationEncodings.bufferToAddress(message.response.address);
        const validatorPublicKey = Wallet.decodeBech32m(validatorAddressString);

        const hash = await this.wallet.createHash('sha256', JSON.stringify(message.response));
        const signature = b4a.from(message.sig, 'hex');
        const verified = this.wallet.verify(signature, hash, validatorPublicKey);

        if (!verified) {
            console.error("Validator response verification failed");
            return false;
        }

        return true;
    }

}
export default ValidatorResponse;