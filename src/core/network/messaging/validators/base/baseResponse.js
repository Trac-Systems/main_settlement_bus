import b4a from 'b4a';
import Wallet from 'trac-wallet';
import ApplyOperationEncodings from '../../../../state/ApplyOperationEncodings.js';

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

    async validateAdminSignature(message) {
        const adminEntry = await this.state.getAdminEntry();
        const adminPublicKey = Wallet.decodeBech32m(adminEntry.tracAddr);
        const messageWithoutSig = { ...message };
        delete messageWithoutSig.sig;
        const hash = await this.#wallet.createHash('sha256', JSON.stringify(messageWithoutSig));
        const signature = b4a.from(message.sig, 'hex');
        const verified = this.#wallet.verify(signature, hash, adminPublicKey);

        if (!verified) {
            console.error("Admin response verification failed");
            return false;
        }

        return true;
    }

    async validateValidatorSignature(message) {
        const validatorAddressString = ApplyOperationEncodings.bufferToAddress(message.address);
        const validatorPublicKey = Wallet.decodeBech32m(validatorAddressString);
        const messageWithoutSig = { ...message };
        delete messageWithoutSig.sig;
        const hash = await this.#wallet.createHash('sha256', JSON.stringify(messageWithoutSig));
        const signature = b4a.from(message.sig, 'hex');
        const verified = this.#wallet.verify(signature, hash, validatorPublicKey);

        if (!verified) {
            console.error("Validator response verification failed");
            return false;
        }

        return true;
    }

    async validateCustomNodeSignature(message) {
        const customNodeAddressString = ApplyOperationEncodings.bufferToAddress(message.address);
        const customNodePublicKey = Wallet.decodeBech32m(customNodeAddressString);

        const messageWithoutSig = { ...message };
        delete messageWithoutSig.sig;

        const hash = await this.#wallet.createHash('sha256', JSON.stringify(messageWithoutSig));
        const signature = b4a.from(message.sig, 'hex');
        const verified = this.#wallet.verify(signature, hash, customNodePublicKey);

        if (!verified) {
            console.error("Custom node response verification failed");
            return false;
        }

        return true;
    }
}

export default BaseResponse;
