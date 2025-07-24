import b4a from 'b4a';
/*
    BaseResponse class for handling common validation logic for network responses.
*/
class BaseResponse {
    constructor(network, state, wallet) {
        this.state = state;
        this.wallet = wallet;
        this.network = network;
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

    validateChannel(message, channelString) {
        if (message.response.channel !== channelString) {
            console.error("Channel mismatch in validator response.");
            return false;
        }
        return true;
    }
}

export default BaseResponse;
