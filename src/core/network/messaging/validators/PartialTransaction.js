import b4a from 'b4a';
import Wallet from 'trac-wallet';

import Check from '../../../../utils/check.js';
import {safeDecodeApplyOperation} from "../../../../utils/protobuf/operationHelpers.js";
import {bufferToAddress} from "../../../state/utils/address.js";
import {createMessage} from "../../../../utils/buffer.js";
import {OperationType} from "../../../../utils/constants.js";
import {blake3Hash} from "../../../../utils/crypto.js";

//TODO: Implement BASE VALIDATOR CLASS AND MOVE COMMON METHODS THERE

class PartialTransaction {
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
        if (!await this.#validateTransactionUniqueness(payload)) return false;
        if (!await this.#validateIfMsbBootstrapIsValid(payload)) return false;
        if (!await this.#validateIfExternalBootstrapHasBeenDeployed(payload)) return false;
        if (!await this.#validateIfExternalBoostrapIsMsbBootstrap(payload)) return false;
        if (!await this.#validateTransactionValidity(payload)) return false;

        return true;
    }

    #isPayloadSchemaValid(payload) {
        const isPayloadValid = this.check.validateTransactionOperation(payload);
        if (!isPayloadValid) {
            console.error('Transaction payload is invalid.');
            return false;
        }
        return true;
    }

    #validateRequesterAddress(payload) {
        const incomingAddress = bufferToAddress(payload.address);
        if (!incomingAddress) {
            console.error('Invalid requesting address in transaction payload.');
            return false;
        }

        const incomingPublicKey = Wallet.decodeBech32mSafe(incomingAddress);

        if (incomingPublicKey === null) {
            console.error('Invalid requesting public key in transaction payload.');
            return false;
        }
        return true;
    }

    async #validateSignature(payload) {
        const incomingPublicKey = Wallet.decodeBech32mSafe(bufferToAddress(payload.address));
        const incomingSignature = payload.txo.is;

        const incomingTx = payload.txo.tx;
        const message = createMessage(
            payload.address,
            payload.txo.txv,
            payload.txo.iw,
            payload.txo.ch,
            payload.txo.in,
            payload.txo.bs,
            payload.txo.mbs,
            OperationType.TX
        );

        const regeneratedTx = await blake3Hash(message);

        // ensure that regenerated tx matches the incoming tx
        if ( !b4a.equals(incomingTx, regeneratedTx)) {
            return false;
        }

        const isSignatureValid = Wallet.verify(incomingSignature, regeneratedTx, incomingPublicKey);
        if (!isSignatureValid) {
            console.error('Invalid signature in transaction payload');
            return false;
        }
        return true;
    }

    async #validateTransactionUniqueness(payload) {
        const tx = payload.txo.tx;
        const txHex = tx.toString('hex');
        if (null !== await this.state.get(txHex)) {
            console.error(`Transaction with hash ${txHex} already exists in the state.`);
            return false;
        }
        return true;
    }

    async #validateIfExternalBoostrapIsMsbBootstrap(payload) {
        if (b4a.equals(this.state.bootstrap, payload.txo.bs)) {
            console.error('External bootstrap is the same as the current MSB bootstrap in transaction operation:', payload.txo.bs);
            return false;
        }
        return true;
    }

    async #validateIfMsbBootstrapIsValid(payload) {
        if (!b4a.equals(this.state.bootstrap, payload.txo.mbs)) {
            console.error('Declared MSB bootstrap is different than network bootstrap in transaction operation:', payload.txo.bs);
            return false;
        }
        return true;
    }

    async #validateIfExternalBootstrapHasBeenDeployed(payload) {
        const externalBootstrapResult = await this.state.getRegisteredBootstrapEntry(payload.txo.bs.toString('hex'));
        if (null === externalBootstrapResult) {
            console.error("External bootstrap is not registered as deployment/<bootstrap>:", payload.txo.bs.toString('hex'));
            return false;
        }

        const getBootstrapTransactionTxPayload = await this.state.get(externalBootstrapResult.toString('hex'));

        if (null === getBootstrapTransactionTxPayload) {
            console.error('External bootstrap is not registered as usual tx', externalBootstrapResult.toString('hex'), ':', payload);
            return false;
        }

        const decodedBootstrapDeployment = safeDecodeApplyOperation(getBootstrapTransactionTxPayload)

        // probably not possible case, however are going to cover it just in case.
        if (!b4a.equals(decodedBootstrapDeployment.bdo.bs, payload.txo.bs)) {
            console.error('External bootstrap does not match the one in the transaction payload:', decodedBootstrapDeployment.bdo.bs.toString('hex'), payload.txo.bs);
            return false;
        }

        return true;
    }

    async #validateTransactionValidity(payload) {
        const currentTxv = await this.state.getIndexerSequenceState()
        const incomingTxv = payload.txo.txv
        if (!b4a.equals(currentTxv, incomingTxv)) {
            console.error(`Transaction has expired.`);
            return false;
        }
        return true;
    }
}

export default PartialTransaction;
