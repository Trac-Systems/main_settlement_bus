import b4a from 'b4a';
import Wallet from 'trac-wallet';
import BaseResponse from './base/baseResponse.js';

class AdminResponse extends BaseResponse {

    constructor(network, state, wallet) {
        super(network, state, wallet);
    }

    async validate(message, channelString) {
        if (!this.validatePayload(message)) return false;
        if (!this.validateIssuerPublicKey(message)) return false;
        if (!this.validateTimestamp(message)) return false;
        if (!await this.validateAdminData(message)) return false;
        if (!await this.validateAdminSignature(message)) return false;
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
            console.error("Admin response is missing required fields.");
            return false;
        }
        return true;
    }

    async validateAdminData(message) {
        const adminEntry = await this.state.getAdminEntry();
        if (!adminEntry) {
            console.error("Admin entry is null");
            return false;
        }

        const adminPublicKey = Wallet.decodeBech32m(adminEntry.tracAddr);
        const receivedAdminPublicKey = Wallet.decodeBech32m(message.response.address);
        const adminWritingKey = b4a.from(message.response.wk, 'hex');

        if (!b4a.equals(adminPublicKey, receivedAdminPublicKey) || !b4a.equals(adminEntry.wk, adminWritingKey)) {
            console.error("Admin public key or writing key mismatch in response.");
            return false;
        }

        return true;
    }

    async validateAdminSignature(message) {
        const adminEntry = await this.state.getAdminEntry();
        const adminPublicKey = Wallet.decodeBech32m(adminEntry.tracAddr);

        const hash = await this.wallet.createHash('sha256', JSON.stringify(message.response));
        const signature = b4a.from(message.sig, 'hex');
        const verified = this.wallet.verify(signature, hash, adminPublicKey);

        if (!verified) {
            console.error("Admin response verification failed");
            return false;
        }

        return true;
    }
}

export default AdminResponse;
