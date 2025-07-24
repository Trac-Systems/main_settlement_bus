import b4a from 'b4a';
import ApplyOperationEncodings from '../../state/ApplyOperationEncodings.js';
import Wallet from 'trac-wallet';
class CustomNodeResponse {
    constructor(network, state, wallet) {
        this.state = state;
        this.wallet = wallet;
        this.network = network;
    }

    async validate(message, channelString) {
        if (!this.validatePayload(message)) return false;
        if (!this.validateIssuerPublicKey(message)) return false;
        if (!this.validateTimestamp(message)) return false;
        if (!await this.validateCustomNodeEntry(message)) return false;
        if (!await this.validateSignature(message)) return false;
        if (!this.validateChannel(message, channelString)) return false;

        return true;
    }

    validatePayload(message) {
        if (!message.response ||
            !message.response.address ||
            !message.response.nonce ||
            !message.response.channel ||
            !message.response.issuer ||
            !message.response.timestamp) {
            console.error("Custom node response is missing required fields.");
            return false;
        }
        return true;
    }

    validateIssuerPublicKey(message) {
        const issuerPublicKey = b4a.from(message.response.issuer, 'hex');
        if (!b4a.equals(issuerPublicKey, this.wallet.publicKey)) {
            console.error("Issuer public key does not match wallet public key.");
            return false;
        }
        return true;
    }

    validateTimestamp(message) {
        const timestamp = message.response.timestamp;
        const now = Date.now();
        const fiveSeconds = 5000;

        if (now - timestamp > fiveSeconds) {
            console.error("Validator response is too old, ignoring.");
            return false;
        }
        return true;
    }

    async validateCustomNodeEntry(message) {
        const customNodeAddressString = message.response.address;
        const customNodeEntry = await this.state.getNodeEntry(customNodeAddressString);
        if (customNodeEntry === null) {
            console.error("Custom node entry is null - entry is not initialized.");
            return false;
        }
        return true;
    }

    async validateSignature(message) {
        const customNodeAddressString = ApplyOperationEncodings.bufferToAddress(message.response.address);
        const customNodePublicKey = Wallet.decodeBech32m(customNodeAddressString);

        const hash = await this.wallet.createHash('sha256', JSON.stringify(message.response));
        const signature = b4a.from(message.sig, 'hex');
        const verified = this.wallet.verify(signature, hash, customNodePublicKey);

        if (!verified) {
            console.error("Validator response verification failed");
            return false;
        }

        return true;
    }

    validateChannel(message, channelString) {
        if (message.response.channel !== channelString) {
            console.error("Channel mismatch in validator response.");
            return false;
        }
        return true;
    }

}
export default CustomNodeResponse;