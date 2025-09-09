import b4a from 'b4a';
import Wallet from 'trac-wallet';

import Check from '../../../../utils/check.js';
import {safeDecodeApplyOperation} from "../../../../utils/protobuf/operationHelpers.js";
import {addressToBuffer, bufferToAddress} from "../../../state/utils/address.js";
import {createMessage} from "../../../../utils/buffer.js";
import {OperationType} from "../../../../utils/constants.js";
import {blake3Hash} from "../../../../utils/crypto.js";
import {bufferToBigInt} from "../../../../utils/amountSerialization.js";
import {FEE} from "../../../state/utils/transaction.js";

class PartialTransfer {
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
        if (!this.#validateRecepientPublicKey(payload)) return false;
        if (!this.#validateAmount(payload)) return false;
        if (!await this.#validateSignature(payload)) return false;
        if (!await this.#validateTransactionUniqueness(payload)) return false;
        if (!await this.#validateTransactionValidity(payload)) return false;
        // if (!await this.#validateSenderBalance(payload)) return false; // TODO: Placeholder until NodeEntry with arithmetic balance is NOT implemented


        return true;
    }

    #isPayloadSchemaValid(payload) {
        const isPayloadValid = this.check.validateTransferOperation(payload);
        if (!isPayloadValid) {
            console.error('Transaction payload is invalid.');
            return false;
        }
        return true;
    }

    #validateRequestingPublicKey(payload) {
        const incomingPublicKey = Wallet.decodeBech32mSafe(bufferToAddress(payload.address));

        if (incomingPublicKey === null) {
            console.error('Invalid requesting public key in transaction payload.');
            return false;
        }
        return true;
    }

    #validateRecepientPublicKey(payload) {
        const incomingPublicKey = Wallet.decodeBech32mSafe(bufferToAddress(payload.tro.to));
        if (incomingPublicKey === null) {
            console.error('Invalid recipient public key in transaction payload.');
            return false;
        }
        return true;
    }

    #validateAmount(payload) {
        const amountBuffer = payload.tro.am;
        if (!b4a.isBuffer(amountBuffer) || amountBuffer.length !== 16) {
            console.error('Amount must be a 16-byte buffer');
            return false;
        }

        const isZero = amountBuffer.every(byte => byte === 0);
        if (isZero) {
            console.error('Amount cannot be zero');
            return false;
        }

        try {
            const transferAmount = bufferToBigInt(amountBuffer);
            const fee = bufferToBigInt(FEE);

            const MAX_AMOUNT = BigInt('0xffffffffffffffffffffffffffffffff');
            if (transferAmount > MAX_AMOUNT) {
                console.error('Total amount transfer exceeds maximum allowed value');
                return false;
            }

            if (transferAmount < fee) {
                console.error(`Transfer amount (${transferAmount}) must be greater than or equal to the minimum fee (${fee})`);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Failed to parse amount:', error);
            return false;
        }
    }

    async #validateSignature(payload) {
        const incomingPublicKey = Wallet.decodeBech32mSafe(bufferToAddress(payload.address));
        const incomingSignature = payload.tro.is;

        const incomingTx = payload.tro.tx;
        const message = createMessage(
            payload.address,
            payload.tro.txv,
            payload.tro.in,
            payload.tro.to,
            payload.tro.am,
            OperationType.TRANSFER
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
        const tx = payload.tro.tx;
        const txHex = tx.toString('hex');
        if (null !== await this.state.getSigned(txHex)) {
            console.error(`Transaction with hash ${txHex} already exists in the state. Possible replay attack detected.`);
            return false;
        }
        return true;
    }

    async #validateTransactionValidity(payload) {
        const currentTxv = await this.state.getIndexerSequenceState()
        const incomingTxv = payload.tro.txv
        if (!b4a.equals(currentTxv, incomingTxv)) {
            console.error(`Transaction validity: ${incomingTxv.toString('hex')} does not match the current indexer sequence state: ${currentTxv.toString('hex')}`);
            return false;
        }
        return true;
    }
    // TODO: Placeholder until NodeEntry with arithmetic balance is NOT implemented
    // check if sender has enough balance to cover the transfer amount + fee
    // and prevet double spending
    async #validateSenderBalance(payload) {
        return undefined
    }
}

export default PartialTransfer;
