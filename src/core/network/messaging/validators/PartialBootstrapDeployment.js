import b4a from 'b4a';
import Wallet from 'trac-wallet';

import Check from '../../../../utils/check.js';
import {bufferToAddress} from "../../../state/utils/address.js";
import {OperationType} from "../../../../utils/constants.js";
import {blake3Hash} from "../../../../utils/crypto.js";
import {createMessage} from "../../../../utils/buffer.js";

class PartialBootstrapDeployment {
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
        if (!await this.#validateSignature(payload)) return false;
        if (!await this.#isBootstrapAlreadyRegistered(payload)) return false;
        if (!this.#isBootstrapDeploymentAlreadyNotCompleted(payload)) return false;
        if (!this.#isExternalBootstrapDifferentFromMSB(payload)) return false;
        if (!await this.#validateTransactionValidity(payload)) return false;
        return true;
    }

    #isPayloadSchemaValid(payload) {
        const isPayloadValid = this.check.validateBootstrapDeploymentOperation(payload);

        if (!isPayloadValid) {
            console.error('Bootstrap deployment payload is invalid.');
            return false;
        }
        return true;
    }

    #validateRequestingPublicKey(payload) {
        const incomingPublicKey = Wallet.decodeBech32mSafe(bufferToAddress(payload.address));

        if (incomingPublicKey === null) {
            console.error('Invalid requesting public key in bootstrap deployment payload.');
            return false;
        }
        return true;
    }

    async #validateSignature(payload) {
        const incomingPublicKey = Wallet.decodeBech32mSafe(bufferToAddress(payload.address));
        const incomingSignature = payload.bdo.is;

        const incomingTx = payload.bdo.tx;

        const message =  createMessage(
            payload.address,
            payload.bdo.txv,
            payload.bdo.bs,
            payload.bdo.in,
            OperationType.BOOTSTRAP_DEPLOYMENT
        );

        const regeneratedTx = await blake3Hash(message);

        // ensure that regenerated tx matches the incoming tx
        if ( !b4a.equals(incomingTx, regeneratedTx)) {
            return false;
        }

        const isSignatureValid = Wallet.verify(incomingSignature, regeneratedTx, incomingPublicKey);
        if (!isSignatureValid) {
            console.error('Invalid signature in PreTx payload.');
            return false;
        }
        return true;
    }

    async #isBootstrapAlreadyRegistered(payload) {
        const bootstrapString = payload.bdo.bs.toString('hex');
        if (null !== await this.state.getRegisteredBootstrapEntry(bootstrapString)) {
            console.error(`Bootstrap with hash ${bootstrapString} already exists in the state. Bootstrap must be unique.`);
            return false;
        }

        const txString = payload.bdo.tx.toString('hex');
        if (null !== await this.state.getSigned(txString)) {
            console.error(`Transaction with hash ${txString} already exists in the state.`);
            return false;
        }
        return true;
    }

    #isBootstrapDeploymentAlreadyNotCompleted(payload) {
        if (!payload || !payload.bdo) return false;
        const { va, vn, vs } = payload.bdo;
        return (va === undefined && vn === undefined && vs === undefined);
    }

    #isExternalBootstrapDifferentFromMSB(payload) {
        const msbBootstrap =  this.state.bootstrap;
        if (b4a.equals(msbBootstrap, payload.bdo.bs)) {
            console.error('External bootstrap must be different from MSB bootstrap.');
            return false;
        }
        return true;
    }

    async #validateTransactionValidity(payload) {
        const currentTxv = await this.state.getIndexerSequenceState()
        const incomingTxv = payload.bdo.txv
        if (!b4a.equals(currentTxv, incomingTxv)) {
            console.error(`Transaction validity: ${incomingTxv.toString('hex')} does not match the current indexer sequence state: ${currentTxv.toString('hex')}`);
            return false;
        }
        return true;
    }

}

export default PartialBootstrapDeployment;
