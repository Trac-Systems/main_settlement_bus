import b4a from 'b4a';
import Wallet from 'trac-wallet';

class AdminResponseValidator {

    constructor(network, state, wallet) {
        this.state = state;
        this.wallet = wallet;
        this.network = network;
    }

    async validate(message, channelString) {
        if (!this.validatePayloadFields(message)) return false;
        if (!this.validateIssuerPublicKey(message)) return false;
        if (!this.validateTimestamp(message)) return false;
        if (!await this.validateAdminData(message)) return false;
        if (!await this.validateAdminSignature(message)) return false;
        if (!this.validateChannel(message, channelString)) return false;

        return true;
    }

    validatePayloadFields(message) {
        if (!message.response ||
            !message.response.wk ||
            !message.response.address ||
            !message.response.nonce ||
            !message.response.channel ||
            !message.response.issuer ||
            !message.response.timestamp) {
            console.log("Admin response is missing required fields.");
            return false;
        }
        return true;
    }

    validateIssuerPublicKey(message) {
        const issuerPublicKey = b4a.from(message.response.issuer, 'hex');
        if (!b4a.equals(issuerPublicKey, this.wallet.publicKey)) {
            console.log("Issuer public key does not match wallet public key.");
            return false;
        }
        return true;
    }

    validateTimestamp(message) {
        const timestamp = message.response.timestamp;
        const now = Date.now();
        const fiveSeconds = 5000;

        if (now - timestamp > fiveSeconds) {
            console.log("Admin response is too old, ignoring.");
            return false;
        }
        return true;
    }

    async validateAdminData(message) {
        const adminEntry = await this.state.getAdminEntry();
        if (!adminEntry) {
            console.log("Admin entry is null");
            return false;
        }

        const adminPublicKey = Wallet.decodeBech32m(adminEntry.tracAddr);
        const receivedAdminPublicKey = Wallet.decodeBech32m(message.response.address);
        const adminWritingKey = b4a.from(message.response.wk, 'hex');

        if (!b4a.equals(adminPublicKey, receivedAdminPublicKey) || !b4a.equals(adminEntry.wk, adminWritingKey)) {
            console.log("Admin public key or writing key mismatch in response.");
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
            console.log("Admin response verification failed");
            return false;
        }

        return true;
    }

    validateChannel(message, channelString) {
        if (message.response.channel !== channelString) {
            console.log("Channel mismatch in admin response.");
            return false;
        }
        return true;
    }
}

export default AdminResponseValidator;
