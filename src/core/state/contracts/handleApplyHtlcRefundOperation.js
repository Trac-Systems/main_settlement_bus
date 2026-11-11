import b4a from 'b4a';
import { EntryType, EPOCH_BYTE_LENGTH, HASH_BYTE_LENGTH, OperationType, PUBLIC_KEY_LENGTH } from '../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { createMessage, isBufferValid, isZeroBuffer, ZERO_WK } from '../../../utils/buffer.js';
import addressUtils from '../utils/address.js';
import nodeEntryUtils, { NODE_ENTRY_SIZE } from '../utils/nodeEntry.js';
import nodeRoleUtils from '../utils/roles.js';
import { Status } from '../utils/transaction.js';
import { toBalance } from '../utils/balance.js';
import * as escrowEntryUtils from '../utils/escrowEntry.js';

export const handleApplyHtlcRefundOperation = baseState => class extends baseState {

    async _handleApplyHtlcRefundOperation(op, view, base, node, batch) {
        if (!this._stateValidationSchema.validateHtlcRefundOperation(op)) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Contract schema validation failed.", node.from.key);
            return Status.FAILURE;
        }
        if (!Object.hasOwn(op.hro, "vs") || !Object.hasOwn(op.hro, "va") || !Object.hasOwn(op.hro, "vn")) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Operation is not complete.", node.from.key);
            return Status.FAILURE;
        }
        if (b4a.equals(op.address, op.hro.va)) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Validator cannot sign its own transaction.", node.from.key);
            return Status.FAILURE;
        }
        if (b4a.equals(op.hro.in, op.hro.vn)) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Nonces should not be the same.", node.from.key);
            return Status.FAILURE;
        }
        if (b4a.equals(op.hro.is, op.hro.vs)) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Signatures should not be the same.", node.from.key);
            return Status.FAILURE;
        }

        const submitterAddress = addressUtils.bufferToAddress(op.address, this._config.addressPrefix);
        if (submitterAddress === null) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Submitter address is invalid.", node.from.key);
            return Status.FAILURE;
        }
        const submitterPublicKey = tracCryptoApi.address.decodeSafe(submitterAddress);
        if (!isBufferValid(submitterPublicKey, PUBLIC_KEY_LENGTH) || isZeroBuffer(submitterPublicKey)) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Submitter public key is invalid.", node.from.key);
            return Status.FAILURE;
        }

        const message = createMessage(
            this._config.networkId,
            op.hro.txv,
            op.hro.li,
            op.hro.in,
            OperationType.HTLC_REFUND
        );
        if (message.length === 0) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Invalid refund message.", node.from.key);
            return Status.FAILURE;
        }
        const txHash = await tracCryptoApi.hash.blake3Safe(message);
        if (!isBufferValid(txHash, HASH_BYTE_LENGTH)) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Failed to hash refund message.", node.from.key);
            return Status.FAILURE;
        }
        if (!b4a.equals(txHash, op.hro.tx)) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Refund transaction hash is invalid.", node.from.key);
            return Status.FAILURE;
        }
        if (!tracCryptoApi.signature.verify(op.hro.is, txHash, submitterPublicKey)) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Refund submitter signature is invalid.", node.from.key);
            return Status.FAILURE;
        }

        const validatorAddress = addressUtils.bufferToAddress(op.hro.va, this._config.addressPrefix);
        if (validatorAddress === null) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Validator address is invalid.", node.from.key);
            return Status.FAILURE;
        }
        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddress);
        if (!isBufferValid(validatorPublicKey, PUBLIC_KEY_LENGTH) || isZeroBuffer(validatorPublicKey)) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Validator public key is invalid.", node.from.key);
            return Status.FAILURE;
        }
        const validatorMessage = createMessage(
            this._config.networkId,
            op.hro.tx,
            op.hro.vn,
            OperationType.HTLC_REFUND
        );
        if (validatorMessage.length === 0) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Invalid validator message.", node.from.key);
            return Status.FAILURE;
        }
        const validatorHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);
        if (!isBufferValid(validatorHash, HASH_BYTE_LENGTH)) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Failed to hash validator message.", node.from.key);
            return Status.FAILURE;
        }
        if (!tracCryptoApi.signature.verify(op.hro.vs, validatorHash, validatorPublicKey)) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Validator signature is invalid.", node.from.key);
            return Status.FAILURE;
        }
        const validatorEntry = await this._getEntryApply(validatorAddress, batch);
        if (!await this._isValidatorValidApply(validatorEntry, node, op)) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Validator consistency check failed.", node.from.key);
            return Status.FAILURE;
        }

        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null || !b4a.equals(op.hro.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Transaction was not executed.", node.from.key);
            return Status.FAILURE;
        }

        const refundTxHashHex = b4a.toString(op.hro.tx, 'hex');
        if (await this._getEntryApply(refundTxHashHex, batch) !== null) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Operation has already been applied.", node.from.key);
            return Status.IGNORE;
        }

        const escrowKey = EntryType.HTLC_ESCROW + b4a.toString(op.hro.li, 'hex');
        const escrowBuffer = await this._getEntryApply(escrowKey, batch);
        if (escrowBuffer === null) {
            this._safeLogApply(OperationType.HTLC_REFUND, "HTLC escrow does not exist.", node.from.key);
            return Status.FAILURE;
        }
        const escrow = escrowEntryUtils.decode(escrowBuffer, this._config.addressPrefix);
        if (!escrow || !b4a.equals(escrow.lockId, op.hro.li)) {
            this._safeLogApply(OperationType.HTLC_REFUND, "HTLC escrow is invalid.", node.from.key);
            return Status.FAILURE;
        }
        if (escrow.status !== escrowEntryUtils.Status.PENDING) {
            this._safeLogApply(OperationType.HTLC_REFUND, "HTLC escrow is already settled.", node.from.key);
            return Status.IGNORE;
        }

        const currentEpoch = await this._getEntryApply(EntryType.EPOCH_CURRENT, batch);
        if (!isBufferValid(currentEpoch, EPOCH_BYTE_LENGTH)) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Current epoch is not initialized or is invalid.", node.from.key);
            return Status.FAILURE;
        }

        if (b4a.compare(currentEpoch, escrow.refundEpoch) < 0) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Refund epoch has not been reached.", node.from.key);
            return Status.IGNORE;
        }

        const settlement = escrowEntryUtils.makeRefund(escrowBuffer, currentEpoch, this._config.addressPrefix);
        if (settlement === null) {
            this._safeLogApply(OperationType.HTLC_REFUND, "HTLC refund transition is invalid.", node.from.key);
            return Status.FAILURE;
        }

        const recipientAddress = addressUtils.bufferToAddress(settlement.address, this._config.addressPrefix);
        if (recipientAddress === null || settlement.amount === null) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Refund recipient or amount is invalid.", node.from.key);
            return Status.FAILURE;
        }

        const recipientEntryBuffer = await this._getEntryApply(recipientAddress, batch);
        let updatedRecipientEntry;
        if (recipientEntryBuffer === null) {
            updatedRecipientEntry = nodeEntryUtils.init(ZERO_WK, nodeRoleUtils.NodeRole.READER, settlement.amount.value);
        } else {
            const recipientEntry = nodeEntryUtils.decode(recipientEntryBuffer);
            if (recipientEntry === null) {
                this._safeLogApply(OperationType.HTLC_REFUND, "Refund recipient account is invalid.", node.from.key);
                return Status.FAILURE;
            }
            const recipientBalance = toBalance(recipientEntry.balance);
            if (recipientBalance === null) {
                this._safeLogApply(OperationType.HTLC_REFUND, "Refund recipient balance is invalid.", node.from.key);
                return Status.FAILURE;
            }
            const updatedBalance = recipientBalance.add(settlement.amount);
            if (updatedBalance === null) {
                this._safeLogApply(OperationType.HTLC_REFUND, "Refund recipient balance overflow.", node.from.key);
                return Status.FAILURE;
            }
            updatedRecipientEntry = updatedBalance.update(recipientEntryBuffer);
        }
        if (!isBufferValid(updatedRecipientEntry, NODE_ENTRY_SIZE)) {
            this._safeLogApply(OperationType.HTLC_REFUND, "Failed to credit refund recipient.", node.from.key);
            return Status.FAILURE;
        }

        await batch.put(recipientAddress, updatedRecipientEntry);
        await batch.put(escrowKey, settlement.refundedEscrowEntry);
        await batch.put(refundTxHashHex, node.value);

        if (this._config.enableTxApplyLogs) {
            console.info(`HTLC refund operation: ${refundTxHashHex} has been appended.`);
        }
        return Status.SUCCESS;
    }
};
