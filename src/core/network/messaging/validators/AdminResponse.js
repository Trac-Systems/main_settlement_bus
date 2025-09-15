import b4a from 'b4a';
import PeerWallet from 'trac-wallet';
import BaseResponse from './base/BaseResponse.js';

class AdminResponse extends BaseResponse {

    constructor(state, wallet) {
        super(state, wallet);
    }

    async validate(message, channelString) {
        if (
            !this.validatePayload(message) ||
            !this.validateIssuerPublicKey(message) ||
            !this.validateTimestamp(message) ||
            !await this.validateAdminData(message) ||
            !await this.validateSignature(message) ||
            !this.validateChannel(message, channelString)
        ) {
            console.error("Admin response validation failed");
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

        const adminPublicKey = PeerWallet.decodeBech32m(adminEntry.address);
        const receivedAdminPublicKey = PeerWallet.decodeBech32m(message.address);
        const adminWritingKey = b4a.from(message.wk, 'hex');

        if (!b4a.equals(adminPublicKey, receivedAdminPublicKey) || !b4a.equals(adminEntry.wk, adminWritingKey)) {
            console.error("Admin public key or writing key mismatch in response.");
            return false;
        }

        return true;
    }
}

export default AdminResponse;
