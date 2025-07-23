import b4a from 'b4a';
import Wallet from 'trac-wallet';
import { generateTx } from '../../../utils/transactionUtils.js';

class PreTransactionValidator {
    constructor(state, wallet, network) {
        this.state = state;
        this.wallet = wallet;
        this.network = network;
    }

    async validate(parsedPreTx) {
        if (!await this.validatePayload(parsedPreTx)) return false;
        if (!await this.validateRequestingKey(parsedPreTx)) return false;
        if (!await this.validateTransactionHash(parsedPreTx)) return false;
        if (!await this.validateSignature(parsedPreTx)) return false;
        if (!await this.validateValidatorAddress(parsedPreTx)) return false;
        if (!await this.validateTransactionUniqueness(parsedPreTx)) return false;
        
        return true;
    }

    async validatePayload(parsedPreTx) {
        const isPayloadValid = this.network.check.validatePreTx(parsedPreTx);
        if (!isPayloadValid) {
            console.error('Invalid pre-tx payload:', parsedPreTx);
            return false;
        }
        return true;
    }

    async validateRequestingKey(parsedPreTx) {
        const requestingPublicKey = Wallet.decodeBech32mSafe(parsedPreTx.ia);
        if (requestingPublicKey === null) {
            console.error('Invalid requesting public key in pre-tx payload:', parsedPreTx);
            return false;
        }
        return true;
    }

    async validateTransactionHash(parsedPreTx) {
        const regeneratedTx = await generateTx(
            parsedPreTx.bs,
            parsedPreTx.mbs,
            parsedPreTx.va,
            parsedPreTx.iw,
            parsedPreTx.ia,
            parsedPreTx.ch,
            parsedPreTx.in
        );
        const transactionHash = b4a.from(parsedPreTx.tx, 'hex');

        if (!b4a.equals(regeneratedTx, transactionHash)) {
            console.error('Invalid transaction hash in pre-tx payload:', parsedPreTx);
            return false;
        }
        return true;
    }

    async validateSignature(parsedPreTx) {
        const requestingPublicKey = Wallet.decodeBech32mSafe(parsedPreTx.ia);
        const requesterSignature = b4a.from(parsedPreTx.is, 'hex');
        const transactionHash = b4a.from(parsedPreTx.tx, 'hex');
        
        const isSignatureValid = Wallet.verify(requesterSignature, transactionHash, requestingPublicKey);
        if (!isSignatureValid) {
            console.error('Invalid signature in pre-tx payload:', parsedPreTx);
            return false;
        }
        return true;
    }

    async validateValidatorAddress(parsedPreTx) {
        if (parsedPreTx.va !== this.wallet.address) {
            console.error('Validator public key does not match wallet address:', parsedPreTx.va, this.wallet.address);
            return false;
        }
        return true;
    }

    async validateTransactionUniqueness(parsedPreTx) {
        const transactionHash = b4a.from(parsedPreTx.tx, 'hex');
        if (null !== await this.state.get(transactionHash)) {
            console.error('Transaction already exists:', parsedPreTx.tx);
            return false;
        }
        return true;
    }
}

export default PreTransactionValidator;
