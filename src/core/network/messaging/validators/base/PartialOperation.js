import b4a from 'b4a';
import PeerWallet from 'trac-wallet';

import Check from '../../../../../utils/check.js';
import { bufferToAddress } from "../../../../state/utils/address.js";
import { createMessage } from "../../../../../utils/buffer.js";
import { OperationType, NETWORK_ID } from "../../../../../utils/constants.js";
import { blake3Hash } from "../../../../../utils/crypto.js";
import { bufferToBigInt } from "../../../../../utils/amountSerialization.js";
import { FEE } from "../../../../state/utils/transaction.js";
import * as operationsUtils from '../../../../../utils/operations.js';

const MAX_AMOUNT = BigInt('0xffffffffffffffffffffffffffffffff');
const FEE_BIGINT = bufferToBigInt(FEE);
const PUBLIC_KEY_LENGTH = 32;

class PartialOperation {
    #state;
    #check;

    constructor(state, network) {
        this.#state = state;
        this.#check = new Check();
        this.max_amount = MAX_AMOUNT;
        this.fee = FEE_BIGINT;
    }

    get state() {
        return this.#state;
    }

    get check() {
        return this.#check;
    }

    validate(payload) { throw new Error("Method 'validate()' must be implemented."); }

    isPayloadSchemaValid(payload) {
        if (!payload || !payload.type) {
            throw new Error('Payload or payload type is missing.');
        }

        const selectedValidator = this.#selectCheckSchemaValidator(payload.type);
        const isPayloadValid = selectedValidator(payload);
        if (!isPayloadValid) {
            throw new Error(`Payload is invalid.`);
        }
    }

    #selectCheckSchemaValidator(type) {
        switch (type) {
            case OperationType.ADD_WRITER:
            case OperationType.REMOVE_WRITER:
            case OperationType.ADMIN_RECOVERY:
                return this.check.validateRoleAccessOperation.bind(this.check);
            case OperationType.BOOTSTRAP_DEPLOYMENT:
                return this.check.validateBootstrapDeploymentOperation.bind(this.check);
            case OperationType.TX:
                return this.check.validateTransactionOperation.bind(this.check);
            case OperationType.TRANSFER:
                return this.check.validateTransferOperation.bind(this.check);
            default:
                throw new Error(`Unknown operation type: ${type}`);
        }
    }

    validateRequesterAddress(payload) {
        const incomingAddress = bufferToAddress(payload.address);
        if (!incomingAddress) {
            throw new Error('Invalid requesting address in payload.');
        }

        const incomingPublicKey = PeerWallet.decodeBech32mSafe(incomingAddress);

        // TODO: We can add check if public key belongs to the Ed25519 curve. Validate signature already checks that but it would be amazing to catch it earlier.
        if (!incomingPublicKey || incomingPublicKey.length !== PUBLIC_KEY_LENGTH) {
            throw new Error('Invalid requesting public key in payload.');
        }
    }

    #getMessageComponents(payload) {
        const operationKey = operationsUtils.operationToPayload(payload.type);
        const operation = payload[operationKey];

        switch (payload.type) {
            case OperationType.ADD_WRITER:
            case OperationType.REMOVE_WRITER:
            case OperationType.ADMIN_RECOVERY:
                return [
                    NETWORK_ID,
                    operation.txv,
                    operation.iw,
                    operation.in,
                    payload.type
                ];
            case OperationType.BOOTSTRAP_DEPLOYMENT:
                return [
                    NETWORK_ID,
                    operation.txv,
                    operation.bs,
                    operation.ic,
                    operation.in,
                    OperationType.BOOTSTRAP_DEPLOYMENT
                ];
            case OperationType.TX:
                return [
                    NETWORK_ID,
                    operation.txv,
                    operation.iw,
                    operation.ch,
                    operation.bs,
                    operation.mbs,
                    operation.in,
                    OperationType.TX
                ];
            case OperationType.TRANSFER:
                return [
                    NETWORK_ID,
                    operation.txv,
                    operation.to,
                    operation.am,
                    operation.in,
                    OperationType.TRANSFER
                ];
            default:
                throw new Error(`Unknown operation type: ${payload.type}`);
        }
    }

    async validateSignature(payload) {
        const operationKey = operationsUtils.operationToPayload(payload.type);
        const operation = payload[operationKey];

        const incomingPublicKey = PeerWallet.decodeBech32mSafe(bufferToAddress(payload.address));
        const incomingSignature = operation.is;
        const messageComponents = this.#getMessageComponents(payload);

        const message = createMessage(...messageComponents);
        const messageHash = await blake3Hash(message);
        const payloadHash = operation.tx;
        if (!b4a.equals(payloadHash, messageHash)) {
            throw new Error('Regenerated transaction does not match incoming transaction in payload.');
        }

        if (!PeerWallet.verify(incomingSignature, messageHash, incomingPublicKey)) {
            throw new Error('Invalid signature in payload.');
        }
    }

    async validateTransactionValidity(payload) {
        const currentTxv = await this.state.getIndexerSequenceState()
        const operationKey = operationsUtils.operationToPayload(payload.type);
        const operation = payload[operationKey];
        const incomingTxv = operation.txv

        if (!b4a.equals(currentTxv, incomingTxv)) {
            throw new Error(`Transaction has expired.`);
        }
    }

    async validateTransactionUniqueness(payload) {
        const operationKey = operationsUtils.operationToPayload(payload.type);
        const operation = payload[operationKey];
        const tx = operation.tx;
        const txHex = tx.toString('hex');

        if (await this.state.get(txHex) !== null) {
            throw new Error(`Transaction with hash ${txHex} already exists in the state.`);
        }
    }

    isOperationNotCompleted(payload) {
        const operationKey = operationsUtils.operationToPayload(payload.type);
        const operation = payload[operationKey];
        const { va, vn, vs } = operation;

        const condition = !!(va === undefined && vn === undefined && vs === undefined);
        if (!condition) {
            throw new Error('Transfer operation must not be completed already (va, vn, vs must be undefined).');
        }
    }

    async validateRequesterBalance(payload, signed = false) {
        const requesterAddress = bufferToAddress(payload.address);
        let requesterEntry;
        if (signed) {
            requesterEntry = await this.state.getNodeEntry(requesterAddress);
        } else {
            requesterEntry = await this.state.getNodeEntryUnsigned(requesterAddress);
        }

        if (!requesterEntry) {
            throw new Error('Requester address not found in state');
        }

        const requesterBalance = bufferToBigInt(requesterEntry.balance);
        if (requesterBalance < FEE_BIGINT) {
            throw new Error('Insufficient balance to cover transaction fee.');
        }
    }

    // TX and BOOTSTRAP_DEPLOYMENT operations only
    validateSubnetworkBootstrapEquality(payload) {
        const operationKey = operationsUtils.operationToPayload(payload.type);
        const operation = payload[operationKey];
        const bs = operation.bs;
        if (b4a.equals(this.state.bootstrap, bs)) {
            throw new Error(`External bootstrap is the same as MSB bootstrap: ${bs.toString('hex')}`);
        }
    }

}

export default PartialOperation;