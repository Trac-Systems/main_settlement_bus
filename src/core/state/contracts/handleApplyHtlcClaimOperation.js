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

export const handleApplyHtlcClaimOperation = baseState => class extends baseState {

    async _handleApplyHtlcClaimOperation(op, view, base, node, batch) {
        if (!this._stateValidationSchema.validateHtlcClaimOperation(op)) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Contract schema validation failed.", node.from.key);
            return Status.FAILURE;
        }
        if (!Object.hasOwn(op.hco, "vs") || !Object.hasOwn(op.hco, "va") || !Object.hasOwn(op.hco, "vn")) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Operation is not complete.", node.from.key);
            return Status.FAILURE;
        }
        if (b4a.equals(op.address, op.hco.va)) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Validator cannot sign its own transaction.", node.from.key);
            return Status.FAILURE;
        }
        if (b4a.equals(op.hco.in, op.hco.vn)) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Nonces should not be the same.", node.from.key);
            return Status.FAILURE;
        }
        if (b4a.equals(op.hco.is, op.hco.vs)) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Signatures should not be the same.", node.from.key);
            return Status.FAILURE;
        }

        const submitterAddress = addressUtils.bufferToAddress(op.address, this._config.addressPrefix);
        if (submitterAddress === null) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Submitter address is invalid.", node.from.key);
            return Status.FAILURE;
        }

        const submitterPublicKey = tracCryptoApi.address.decodeSafe(submitterAddress);
        if (!isBufferValid(submitterPublicKey, PUBLIC_KEY_LENGTH) || isZeroBuffer(submitterPublicKey)) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Submitter public key is invalid.", node.from.key);
            return Status.FAILURE;
        }

        const message = createMessage(
            this._config.networkId,
            op.hco.txv,
            op.hco.li,
            op.hco.pi,
            op.hco.in,
            OperationType.HTLC_CLAIM
        );
        if (message.length === 0) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Invalid claim message.", node.from.key);
            return Status.FAILURE;
        }

        const txHash = await tracCryptoApi.hash.blake3Safe(message);
        if (!isBufferValid(txHash, HASH_BYTE_LENGTH)) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Failed to hash claim message.", node.from.key);
            return Status.FAILURE;
        }
        if (!b4a.equals(txHash, op.hco.tx)) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Claim transaction hash is invalid.", node.from.key);
            return Status.FAILURE;
        }
        if (!tracCryptoApi.signature.verify(op.hco.is, txHash, submitterPublicKey)) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Claim submitter signature is invalid.", node.from.key);
            return Status.FAILURE;
        }

        const validatorAddress = addressUtils.bufferToAddress(op.hco.va, this._config.addressPrefix);
        if (validatorAddress === null) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Validator address is invalid.", node.from.key);
            return Status.FAILURE;
        }
        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddress);
        if (!isBufferValid(validatorPublicKey, PUBLIC_KEY_LENGTH) || isZeroBuffer(validatorPublicKey)) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Validator public key is invalid.", node.from.key);
            return Status.FAILURE;
        }
        const validatorMessage = createMessage(
            this._config.networkId,
            op.hco.tx,
            op.hco.vn,
            OperationType.HTLC_CLAIM
        );
        if (validatorMessage.length === 0) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Invalid validator message.", node.from.key);
            return Status.FAILURE;
        }
        const validatorHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);
        if (!isBufferValid(validatorHash, HASH_BYTE_LENGTH)) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Failed to hash validator message.", node.from.key);
            return Status.FAILURE;
        }
        if (!tracCryptoApi.signature.verify(op.hco.vs, validatorHash, validatorPublicKey)) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Validator signature is invalid.", node.from.key);
            return Status.FAILURE;
        }
        const validatorEntry = await this._getEntryApply(validatorAddress, batch);
        if (!await this._isValidatorValidApply(validatorEntry, node, op)) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Validator consistency check failed.", node.from.key);
            return Status.FAILURE;
        }

        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null || !b4a.equals(op.hco.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Transaction was not executed.", node.from.key);
            return Status.FAILURE;
        }

        const claimTxHashHex = b4a.toString(op.hco.tx, 'hex');
        if (await this._getEntryApply(claimTxHashHex, batch) !== null) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Operation has already been applied.", node.from.key);
            return Status.IGNORE;
        }

        const escrowKey = EntryType.HTLC_ESCROW + b4a.toString(op.hco.li, 'hex');
        const escrowBuffer = await this._getEntryApply(escrowKey, batch);
        if (escrowBuffer === null) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "HTLC escrow does not exist.", node.from.key);
            return Status.FAILURE;
        }
        const escrow = escrowEntryUtils.decode(escrowBuffer, this._config.addressPrefix);
        if (!escrow || !b4a.equals(escrow.lockId, op.hco.li)) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "HTLC escrow is invalid.", node.from.key);
            return Status.FAILURE;
        }
        if (escrow.status !== escrowEntryUtils.Status.PENDING) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "HTLC escrow is already settled.", node.from.key);
            return Status.IGNORE;
        }

        const currentEpoch = await this._getEntryApply(EntryType.EPOCH_CURRENT, batch);
        if (!isBufferValid(currentEpoch, EPOCH_BYTE_LENGTH)) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Current epoch is not initialized or is invalid.", node.from.key);
            return Status.FAILURE;
        }
        if (b4a.compare(currentEpoch, escrow.refundEpoch) >= 0) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "Claim window has expired.", node.from.key);
            return Status.IGNORE;
        }

        const settlement = escrowEntryUtils.makeClaim(escrowBuffer, op.hco.pi, currentEpoch, this._config.addressPrefix);
        if (settlement === null) {
            this._safeLogApply(OperationType.HTLC_CLAIM, "HTLC preimage or escrow transition is invalid.", node.from.key);
            return Status.FAILURE;
        }

        const payouts = [
            [settlement.address, settlement.amount],
            [settlement.additionalFeeRecipientAddress, settlement.additionalFeeAmount],
        ];
        const credits = new Map();
        for (const [addressBytes, amount] of payouts) {
            if (addressBytes === null) continue;
            const address = addressUtils.bufferToAddress(addressBytes, this._config.addressPrefix);
            if (address === null || amount === null) {
                this._safeLogApply(OperationType.HTLC_CLAIM, "Settlement recipient or amount is invalid.", node.from.key);
                return Status.FAILURE;
            }
            const total = credits.has(address) ? credits.get(address).add(amount) : amount;
            if (total === null) {
                this._safeLogApply(OperationType.HTLC_CLAIM, "Settlement amount overflow.", node.from.key);
                return Status.FAILURE;
            }
            credits.set(address, total);
        }

        const updatedRecipients = new Map();
        for (const [address, amount] of credits) {
            const entryBuffer = await this._getEntryApply(address, batch);
            let updatedEntry;
            if (entryBuffer === null) {
                updatedEntry = nodeEntryUtils.init(ZERO_WK, nodeRoleUtils.NodeRole.READER, amount.value);
            } else {
                const entry = nodeEntryUtils.decode(entryBuffer);
                if (entry === null) {
                    this._safeLogApply(OperationType.HTLC_CLAIM, "Settlement recipient account is invalid.", node.from.key);
                    return Status.FAILURE;
                }
                const balance = toBalance(entry.balance);
                if (balance === null) {
                    this._safeLogApply(OperationType.HTLC_CLAIM, "Settlement recipient balance is invalid.", node.from.key);
                    return Status.FAILURE;
                }
                const updatedBalance = balance.add(amount);
                if (updatedBalance === null) {
                    this._safeLogApply(OperationType.HTLC_CLAIM, "Settlement recipient balance overflow.", node.from.key);
                    return Status.FAILURE;
                }
                updatedEntry = updatedBalance.update(entryBuffer);
            }
            if (!isBufferValid(updatedEntry, NODE_ENTRY_SIZE)) {
                this._safeLogApply(OperationType.HTLC_CLAIM, "Failed to credit settlement recipient.", node.from.key);
                return Status.FAILURE;
            }
            updatedRecipients.set(address, updatedEntry);
        }

        for (const [address, entry] of updatedRecipients) await batch.put(address, entry);
        await batch.put(escrowKey, settlement.claimedEscrowEntry);
        await batch.put(claimTxHashHex, node.value);

        if (this._config.enableTxApplyLogs) {
            console.info(`HTLC claim operation: ${claimTxHashHex} has been appended.`);
        }
        return Status.SUCCESS;
    }
};
