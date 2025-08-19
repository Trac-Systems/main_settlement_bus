import b4a from 'b4a';
import Wallet from 'trac-wallet';
import { generateTx } from '../../../../utils/transactionUtils.js';
import Check from '../../../../utils/check.js';
import {safeDecodeApplyOperation} from "../../../../utils/protobuf/operationHelpers.js";
class PreTransaction {
    #state;
    #wallet;
    #network;
    #check;

    constructor(state, wallet, network) {
        this.#state = state;
        this.#wallet = wallet;
        this.#network = network;
        this.#check = new Check();
    }

    get state() {
        return this.#state;
    }

    get network() {
        return this.#network;
    }
    
    get check() {
        return this.#check;
    }

    async validate(payload) {
        if (!this.#isPayloadSchemaValid(payload)) return false;
        if (!this.#validateRequestingPublicKey(payload)) return false;
        if (!await this.#validateTransactionHash(payload)) return false;
        if (!this.#validateSignature(payload)) return false;
        if (!this.#validateValidatorAddress(payload)) return false;
        if (!await this.#validateTransactionUniqueness(payload)) return false;
        if (!await this.#validateIfExternalBootstrapHasBeenDeployed(payload)) return false;
        if (!await this.#validateIfExternalBoostrapIsMsbBootstrap(payload)) return false;
        
        return true;
    }

    #isPayloadSchemaValid(payload) {
        const isPayloadValid = this.check.validatePreTx(payload);
        if (!isPayloadValid) {
            console.error('PreTx payload is invalid.');
            return false;
        }
        return true;
    }

    #validateRequestingPublicKey(payload) {
        const requestingPublicKey = Wallet.decodeBech32mSafe(payload.ia);
        if (requestingPublicKey === null) {
            console.error('Invalid requesting public key in PreTx payload.');
            return false;
        }
        return true;
    }

    async #validateTransactionHash(payload) {
        const regeneratedTx = await generateTx(
            payload.bs,
            payload.mbs,
            payload.va,
            payload.iw,
            payload.ia,
            payload.ch,
            payload.in
        );
        const transactionHash = b4a.from(payload.tx, 'hex');

        if (!b4a.equals(regeneratedTx, transactionHash)) {
            console.error('Invalid transaction hash in PreTx payload.');
            return false;
        }
        return true;
    }

    #validateSignature(payload) {
        const requestingPublicKey = Wallet.decodeBech32mSafe(payload.ia);
        const requesterSignature = b4a.from(payload.is, 'hex');
        const transactionHash = b4a.from(payload.tx, 'hex');
        
        const isSignatureValid = Wallet.verify(requesterSignature, transactionHash, requestingPublicKey);
        if (!isSignatureValid) {
            console.error('Invalid signature in PreTx payload.');
            return false;
        }
        return true;
    }

    #validateValidatorAddress(payload) {
        if (payload.va !== this.#wallet.address) {
            console.error('Validator public key does not match wallet address:', payload.va, this.#wallet.address);
            return false;
        }
        return true;
    }

    async #validateTransactionUniqueness(payload) {
        const transactionHash = b4a.from(payload.tx, 'hex');
        if (null !== await this.state.getSigned(transactionHash)) {
            console.error('Transaction already exists:', payload.tx);
            return false;
        }
        return true;
    }

    async #validateIfExternalBoostrapIsMsbBootstrap(payload) {
        if (b4a.equals(this.state.bootstrap, b4a.from(payload.bs, 'hex'))) {
            console.error('External bootstrap is the same as the current MSB bootstrap:', payload.bs);
            return false;
        }
        return true;
    }

    async #validateIfExternalBootstrapHasBeenDeployed(payload) {
        const externalBootstrapResult = await this.state.getRegisteredBootstrapEntry(payload.bs)
        if (null === externalBootstrapResult) {
            console.error("External bootstrap is not registered as deployment/<bootstrap>:", payload.bs);
            return false;
        }

        const getBootstrapTransactionTxPayload = await this.state.getSigned(externalBootstrapResult.toString('hex'));

        if (null === getBootstrapTransactionTxPayload) {
            console.error('External bootstrap is not registered as usual tx', externalBootstrapResult.toString('hex'), ':', payload);
            return false;
        }

        const decodedBootstrapDeployment = safeDecodeApplyOperation(getBootstrapTransactionTxPayload)

        // probably not possible case, howeverwe are going to cover it just in case.
        if (decodedBootstrapDeployment.bdo.bs.toString('hex') !== payload.bs) {
            console.error('External bootstrap does not match the one in the transaction payload:', decodedBootstrapDeployment.bdo.bs.toString('hex'), payload.bs);
            return false;
        }

        return true;
    }
}

export default PreTransaction;
