import b4a from 'b4a';
import Wallet from 'trac-wallet';
import { bufferToAddress } from '../../../../state/utils/address.js';

/*
    BaseResponse class for handling common validation logic for network responses.
*/

class BaseResponse {
    #wallet;
    #state;

    constructor(state, wallet) {
        this.#state = state;
        this.#wallet = wallet;
    }

    get state() {
        return this.#state;
    }

    validateIssuerPublicKey(message) {
        const issuerPublicKey = b4a.from(message.issuer, 'hex');
        if (!b4a.equals(issuerPublicKey, this.#wallet.publicKey)) {
            console.error("Issuer public key does not match wallet public key.");
            return false;
        }
        return true;
    }

    validateTimestamp(message) {
        const timestamp = message.timestamp;
        const now = Date.now();
        const fiveSeconds = 5000;

        if (now - timestamp > fiveSeconds) {
            console.error("Validator response is too old, ignoring.");
            return false;
        }
        return true;
    }

    validateChannel(message, channelString) {
        if (message.channel !== channelString) {
            console.error("Channel mismatch in validator response.");
            return false;
        }
        return true;
    }

    /*
        Signature validation methods (validateAdminSignature, validateValidatorSignature, validateCustomNodeSignature)
        are implemented in this base class due to JavaScript encapsulation limitations.
        JS does not have a 'protected' modifier, and we want to keep the wallet field private (#wallet)
        and prevent access to it from derived classes or external code.
        Therefore, all logic requiring access to the wallet must be implemented here.
    */

    async validateSignature(message, type = null) {
        let publicKey = null;
        switch (type) {
            case 'admin':
                const adminEntry = await this.state.getAdminEntry();
                publicKey = Wallet.decodeBech32m(adminEntry.address);

                break;
            default:
                const addressString = bufferToAddress(message.address);
                publicKey = Wallet.decodeBech32m(addressString);
        }

        if (!publicKey) {
            console.error("Failed to derive public key from message.");
            return false;
        }

        const messageWithoutSig = { ...message };
        delete messageWithoutSig.sig;
        const hash = await this.#wallet.createHash('sha256', JSON.stringify(messageWithoutSig));
        const signature = b4a.from(message.sig, 'hex');
        const verified = this.#wallet.verify(signature, hash, publicKey);

        if (!verified) {
            console.error("Signature in the response verification failed.");
            return false;
        }
        return true;
    }
}

export default BaseResponse;