import b4a from 'b4a';
import Wallet from 'trac-wallet';

import Check from '../../../../utils/check.js';
import {bufferToAddress} from "../../../state/utils/address.js";
import {OperationType} from "../../../../utils/protobuf/applyOperations.cjs";
import {createHash} from "../../../../utils/crypto.js";
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
        if (!this.#validatePayload(payload)) return false;
        if (!this.#validateRequestingPublicKey(payload)) return false;
        if (!await this.#validateSignature(payload)) return false;
        if (!await this.#isBootstrapAlreadyRegistered(payload)) return false;
        if (!this.#isBootstrapDeploymentAlreadyNotCompleted(payload)) return false;
        return true;
    }

    #validatePayload(payload) {
        const isPayloadValid = this.check.validateBootstrapDeployment(payload);

        if (!isPayloadValid) {
            console.error('Bootstrap deployment payload is invalid.');
            return false;
        }
        return true;
    }

    #validateRequestingPublicKey(payload) {
        const incomingPublicKey = Wallet.decodeBech32mSafe(bufferToAddress(payload.address));

        if (incomingPublicKey === null) {
            console.error('Invalid requesting public key in PreTx payload.');
            return false;
        }
        return true;
    }

    async #validateSignature(payload) {
        const incomingPublicKey = Wallet.decodeBech32mSafe(bufferToAddress(payload.address));
        const incomingSignature = payload.bdo.is;

        const incomingTx = b4a.from(payload.bdo.tx, 'hex');

        const message =  createMessage(payload.bdo.bs, payload.bdo.in, OperationType.BOOTSTRAP_DEPLOYMENT)
        const hash = await createHash('sha256', message);

        if ( !b4a.equals(incomingTx, hash)) {
            return false;
        }

        const isSignatureValid = Wallet.verify(incomingSignature, hash, incomingPublicKey);
        if (!isSignatureValid) {
            console.error('Invalid signature in PreTx payload.');
            return false;
        }
        return true;
    }

    async #isBootstrapAlreadyRegistered(payload) {
        const bootstrapString = b4a.from(payload.bdo.bs, 'hex');
        if (null !== await this.state.getRegisteredBootstrapEntry(bootstrapString)) {
            console.error('Bootstrap is already registered:', bootstrapString);
            return false;
        }
        const txString = b4a.from(payload.bdo.tx, 'hex');
        if (null !== await this.state.getSigned(txString)) {
            console.error('Transaction is already registered tx:', txString);
            return false;
        }
        return true;
    }

    #isBootstrapDeploymentAlreadyNotCompleted(payload) {
        if (!payload || !payload.bdo) return false;
        const { va, vn, vs } = payload.bdo;
        return (va === undefined && vn === undefined && vs === undefined);
    }


}

export default PartialBootstrapDeployment;
