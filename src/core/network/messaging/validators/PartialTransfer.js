import b4a from 'b4a';
import PeerWallet from 'trac-wallet';

import Check from '../../../../utils/check.js';
import { addressToBuffer, bufferToAddress } from "../../../state/utils/address.js";
import { createMessage } from "../../../../utils/buffer.js";
import { OperationType } from "../../../../utils/constants.js";
import { blake3Hash } from "../../../../utils/crypto.js";
import { bufferToBigInt } from "../../../../utils/amountSerialization.js";
import { FEE } from "../../../state/utils/transaction.js";

//TODO: Implement BASE VALIDATOR CLASS AND MOVE COMMON METHODS THERE

const MAX_AMOUNT = BigInt('0xffffffffffffffffffffffffffffffff');
const FEE_BIGINT = bufferToBigInt(FEE);

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
        if (!this.#validateRequesterAddress(payload)) return false;
        if (!this.#validateRecipientAddress(payload)) return false;
        if (!await this.#validateSignature(payload)) return false;
        if (!await this.#validateTransactionUniqueness(payload)) return false;
        if (!await this.#validateTransactionValidity(payload)) return false;
        if (!await this.#validateStateBalances(payload)) return false;
        if (!this.#isTransferOperationNotCompleted(payload)) return false;
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

    #validateRequesterAddress(payload) {
        const incomingAddress = bufferToAddress(payload.address);
        if (!incomingAddress) {
            console.error('Invalid requesting address in transfer payload.');
            return false;
        }

        const incomingPublicKey = PeerWallet.decodeBech32mSafe(incomingAddress);

        if (incomingPublicKey === null) {
            console.error('Invalid requesting public key in transfer payload.');
            return false;
        }
        return true;
    }

    #validateRecipientAddress(payload) {
        const incomingAddress = bufferToAddress(payload.tro.to);
        if (!incomingAddress) {
            console.error('Invalid recipient address in transfer payload.');
            return false;
        }

        const incomingPublicKey = PeerWallet.decodeBech32mSafe(incomingAddress);
        if (incomingPublicKey === null) {
            console.error('Invalid recipient public key in transfer payload.');
            return false;
        }

        return true;
    }



    async #validateSignature(payload) {
        const incomingPublicKey = PeerWallet.decodeBech32mSafe(bufferToAddress(payload.address));
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
        if (!b4a.equals(incomingTx, regeneratedTx)) {
            return false;
        }

        const isSignatureValid = PeerWallet.verify(incomingSignature, regeneratedTx, incomingPublicKey);
        if (!isSignatureValid) {
            console.error('Invalid signature in transfer payload');
            return false;
        }
        return true;
    }

    async #validateTransactionUniqueness(payload) {
        const tx = payload.tro.tx;
        const txHex = tx.toString('hex');
        if (null !== await this.state.get(txHex)) {
            console.error(`Transaction with hash ${txHex} already exists in the state.`);
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

    async #validateStateBalances(payload) {
        try {

            const senderAddress = bufferToAddress(payload.address);
            const recipientAddress = bufferToAddress(payload.tro.to);

            const transferAmount = bufferToBigInt(payload.tro.am);
            if (transferAmount > MAX_AMOUNT) {
                console.error('Transfer amount exceeds maximum allowed value');
                return false;
            }

            const isSelfTransfer = senderAddress === recipientAddress;
            const totalDeductedAmount = isSelfTransfer ? FEE_BIGINT : (transferAmount + FEE_BIGINT);

            const senderEntry = await this.state.getNodeEntry(senderAddress);
            if (!senderEntry) {
                console.error('Sender account not found');
                return false;
            }

            const senderBalance = bufferToBigInt(senderEntry.balance);
            if (!(senderBalance >= totalDeductedAmount)) {
                console.error('Insufficient balance for transfer' + (isSelfTransfer ? ' fee' : ' + fee'));
                return false;
            }

            if (!isSelfTransfer) {
                const recipientEntry = await this.state.getNodeEntry(recipientAddress);
                if (recipientEntry) {
                    const recipientBalance = bufferToBigInt(recipientEntry.balance);
                    const newRecipientBalance = recipientBalance + transferAmount;
                    if (newRecipientBalance > MAX_AMOUNT) {
                        console.error('Transfer would cause recipient balance to exceed maximum allowed value');
                        return false;
                    }
                }
            }

            return true;
        } catch (error) {
            console.error('Error in validateStateBalances:', error);
            return false;
        }
    }

    #isTransferOperationNotCompleted(payload) {
        if (!payload || !payload.tro) return false;
        const { va, vn, vs } = payload.tro;
        const condition = !!(va === undefined && vn === undefined && vs === undefined);
        if (!condition) {
            console.error('Transfer operation must not be completed already (va, vn, vs must be undefined).');
            return false;
        }
        return true;
    }

}

export default PartialTransfer;
