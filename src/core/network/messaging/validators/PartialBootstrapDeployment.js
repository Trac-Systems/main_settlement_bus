import b4a from 'b4a';
import PeerWallet from 'trac-wallet';

import Check from '../../../../utils/check.js';
import { bufferToAddress } from "../../../state/utils/address.js";
import { OperationType } from "../../../../utils/constants.js";
import { blake3Hash } from "../../../../utils/crypto.js";
import { createMessage } from "../../../../utils/buffer.js";
import { bufferToBigInt } from "../../../../utils/amountSerialization.js";
import { FEE } from "../../../state/utils/transaction.js";

//TODO: Implement BASE VALIDATOR CLASS AND MOVE COMMON METHODS THERE

const FEE_BIGINT = bufferToBigInt(FEE);

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
        if (!this.#validateRequesterAddress(payload)) return false;
        if (!await this.#validateSignature(payload)) return false;
        if (!await this.#isBootstrapAlreadyRegistered(payload)) return false;
        if (!this.#isBootstrapDeploymentAlreadyNotCompleted(payload)) return false;
        if (!this.#isExternalBootstrapDifferentFromMSB(payload)) return false;
        if (!await this.#validateTransactionValidity(payload)) return false;
        if (!await this.#validateRequesterBalance(payload)) return false;
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

    #validateRequesterAddress(payload) {
        const incomingAddress = bufferToAddress(payload.address);
        if (!incomingAddress) {
            console.error('Invalid requesting address in bootstrap deployment payload.');
            return false;
        }

        const incomingPublicKey = PeerWallet.decodeBech32mSafe(incomingAddress);

        if (incomingPublicKey === null) {
            console.error('Invalid requesting public key in bootstrap deployment payload.');
            return false;
        }
        return true;
    }

    async #validateSignature(payload) {
        const incomingPublicKey = PeerWallet.decodeBech32mSafe(bufferToAddress(payload.address));
        const incomingSignature = payload.bdo.is;

        const incomingTx = payload.bdo.tx;

        const message = createMessage(
            payload.address,
            payload.bdo.txv,
            payload.bdo.bs,
            payload.bdo.ic,
            payload.bdo.in,
            OperationType.BOOTSTRAP_DEPLOYMENT
        );

        const regeneratedTx = await blake3Hash(message);

        // ensure that regenerated tx matches the incoming tx
        if (!b4a.equals(incomingTx, regeneratedTx)) {
            return false;
        }

        const isSignatureValid = PeerWallet.verify(incomingSignature, regeneratedTx, incomingPublicKey);
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
        // TODO: SPLIT IT INTO validateTransactionUniqueness. Becasuse we can move this check into the base validator class in the future
        const txString = payload.bdo.tx.toString('hex');
        if (null !== await this.state.get(txString)) {
            console.error(`Transaction with hash ${txString} already exists in the state.`);
            return false;
        }
        return true;
    }

    #isBootstrapDeploymentAlreadyNotCompleted(payload) {
        if (!payload || !payload.bdo) return false;
        const { va, vn, vs } = payload.bdo;
        const condition = !!(va === undefined && vn === undefined && vs === undefined);
        if (!condition) {
            console.error('Bootstrap deployment must not be completed already (va, vn, vs must be undefined).');
            return false;
        }
        return true;
    }

    #isExternalBootstrapDifferentFromMSB(payload) {
        const msbBootstrap = this.state.bootstrap;
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
            console.error(`Transaction has expired.`);
            return false;
        }
        return true;
    }

    async #validateRequesterBalance(payload) {
        const requesterAddress = bufferToAddress(payload.address);
        const requesterEntry = await this.state.getNodeEntry(requesterAddress);

        if (!requesterEntry) {
            console.error('Requester account not found');
            return false;
        }

        const requesterBalance = bufferToBigInt(requesterEntry.balance);
        if (requesterBalance < FEE_BIGINT) {
            console.error('Insufficient balance to cover deployment fee');
            return false;
        }

        return true;
    }

}

export default PartialBootstrapDeployment;
