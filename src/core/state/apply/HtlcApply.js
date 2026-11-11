import b4a from 'b4a';
import { EntryType, EPOCH_BYTE_LENGTH, HASH_BYTE_LENGTH, OperationType, HTLC_MIN_LOCK_DURATION_EPOCHS, PUBLIC_KEY_LENGTH } from '../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { createMessage, isBufferValid, isZeroBuffer, ZERO_WK } from '../../../utils/buffer.js';
import addressUtils from '../utils/address.js';
import nodeEntryUtils, { NODE_ENTRY_SIZE } from '../utils/nodeEntry.js';
import nodeRoleUtils from '../utils/roles.js';
import transactionUtils, { Status } from '../utils/transaction.js';
import { PERCENT_75, toBalance } from '../utils/balance.js';
import * as escrowEntryUtils from '../utils/escrowEntry.js';
import { createHtlcLockSigningMessage, verifyOrderedHtlcCosignerSignatures } from '../../../utils/htlcLock.js';

export const withHtlcApply = Base => class extends Base {

    async _handleApplyHtlcLockOperation(op, view, base, node, batch) {
        if (!this._stateValidationSchema.validateHtlcLockOperation(op)) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Contract schema validation failed.", node.from.key);
            return Status.FAILURE;
        }

        if (!Object.hasOwn(op.hlo, "vs") || !Object.hasOwn(op.hlo, "va") || !Object.hasOwn(op.hlo, "vn")) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Operation is not complete.", node.from.key);
            return Status.FAILURE;
        }

        if (b4a.equals(op.address, op.hlo.va)) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Validator cannot sign its own transaction.", node.from.key);
            return Status.FAILURE;
        }

        if (b4a.equals(op.hlo.in, op.hlo.vn)) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Nonces should not be the same.", node.from.key);
            return Status.FAILURE;
        }

        if (b4a.equals(op.hlo.is, op.hlo.vs)) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Signatures should not be the same.", node.from.key);
            return Status.FAILURE;
        }

        const lockerAddressString = addressUtils.bufferToAddress(op.address, this._config.addressPrefix);
        if (lockerAddressString === null) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Locker address is invalid.", node.from.key);
            return Status.FAILURE;
        }

        const lockerPublicKey = tracCryptoApi.address.decodeSafe(lockerAddressString);
        if (
            !b4a.isBuffer(lockerPublicKey) ||
            lockerPublicKey.length !== PUBLIC_KEY_LENGTH ||
            isZeroBuffer(lockerPublicKey)
        ) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Failed to decode locker public key.", node.from.key);
            return Status.FAILURE;
        }

        let lockerMessage;
        try {
            lockerMessage = createHtlcLockSigningMessage(
                this._config.networkId,
                op.address,
                op.hlo
            );
        } catch {
            this._safeLogApply(OperationType.HTLC_LOCK, "Invalid locker message.", node.from.key);
            return Status.FAILURE;
        }

        const regeneratedTxHash = await tracCryptoApi.hash.blake3Safe(lockerMessage);
        if (!isBufferValid(regeneratedTxHash, HASH_BYTE_LENGTH)) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Failed to hash locker message.", node.from.key);
            return Status.FAILURE;
        }
        if (!b4a.equals(regeneratedTxHash, op.hlo.tx)) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Message hash does not match the tx_hash.", node.from.key);
            return Status.FAILURE;
        }

        if (!tracCryptoApi.signature.verify(op.hlo.is, regeneratedTxHash, lockerPublicKey)) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Failed to verify locker signature.", node.from.key);
            return Status.FAILURE;
        }

        if (!b4a.equals(lockerPublicKey, op.hlo.ss[0])) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Signer zero does not match the locker.", node.from.key);
            return Status.FAILURE;
        }

        if (
            1 + op.hlo.cs.length < op.hlo.th[0] ||
            !verifyOrderedHtlcCosignerSignatures(op.hlo.cs, op.hlo.tx, op.hlo.ss)
        ) {
            this._safeLogApply(OperationType.HTLC_LOCK, "HTLC cosigner authorization is invalid.", node.from.key);
            return Status.FAILURE;
        }

        const validatorAddressString = addressUtils.bufferToAddress(op.hlo.va, this._config.addressPrefix);
        if (validatorAddressString === null) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Validator address is invalid.", node.from.key);
            return Status.FAILURE;
        }

        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (
            !b4a.isBuffer(validatorPublicKey) ||
            validatorPublicKey.length !== PUBLIC_KEY_LENGTH ||
            isZeroBuffer(validatorPublicKey)
        ) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Failed to decode validator public key.", node.from.key);
            return Status.FAILURE;
        }

        const validatorMessage = createMessage(
            this._config.networkId,
            op.hlo.tx,
            op.hlo.vn,
            OperationType.HTLC_LOCK
        );
        if (validatorMessage.length === 0) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Invalid validator message.", node.from.key);
            return Status.FAILURE;
        }

        const validatorMessageHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);
        if (!isBufferValid(validatorMessageHash, HASH_BYTE_LENGTH)) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Failed to hash validator message.", node.from.key);
            return Status.FAILURE;
        }
        if (!tracCryptoApi.signature.verify(op.hlo.vs, validatorMessageHash, validatorPublicKey)) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Failed to verify validator signature.", node.from.key);
            return Status.FAILURE;
        }

        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Indexer sequence state is invalid.", node.from.key);
            return Status.FAILURE;
        }
        if (!b4a.equals(op.hlo.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Transaction was not executed.", node.from.key);
            return Status.FAILURE;
        }

        const validatorEntryBuffer = await this._getEntryApply(validatorAddressString, batch);
        if (!await this._isValidatorValidApply(validatorEntryBuffer, node, op)) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Validator consistency check failed.", node.from.key);
            return Status.FAILURE;
        }

        const lockIdHex = b4a.toString(op.hlo.tx, 'hex');
        const operationEntry = await this._getEntryApply(lockIdHex, batch);
        if (operationEntry !== null) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Operation has already been applied.", node.from.key);
            return Status.IGNORE;
        }

        const escrowKey = EntryType.HTLC_ESCROW + lockIdHex;
        const existingEscrow = await this._getEntryApply(escrowKey, batch);
        if (existingEscrow !== null) {
            this._safeLogApply(OperationType.HTLC_LOCK, "HTLC escrow already exists.", node.from.key);
            return Status.FAILURE;
        }

        const currentEpochBuffer = await this._getEntryApply(EntryType.EPOCH_CURRENT, batch);
        if (!isBufferValid(currentEpochBuffer, EPOCH_BYTE_LENGTH)) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Current epoch is not initialized or is invalid.", node.from.key);
            return Status.FAILURE;
        }

        const currentEpoch = currentEpochBuffer.readBigUInt64BE(0);
        const refundEpoch = op.hlo.re.readBigUInt64BE(0);
        if (refundEpoch < currentEpoch + HTLC_MIN_LOCK_DURATION_EPOCHS) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Refund epoch is below the minimum lock duration.", node.from.key);
            return Status.IGNORE;
        }

        const principal = toBalance(op.hlo.am);
        const surchargeFee = toBalance(op.hlo.fa);
        const networkFee = toBalance(transactionUtils.FEE);
        if (principal === null || surchargeFee === null || networkFee === null) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Invalid HTLC or network fee amount.", node.from.key);
            return Status.FAILURE;
        }

        const escrowAmount = principal.add(surchargeFee);
        const totalDeductedAmount = escrowAmount?.add(networkFee) ?? null;
        if (escrowAmount === null || totalDeductedAmount === null) {
            this._safeLogApply(OperationType.HTLC_LOCK, "HTLC total amount overflow.", node.from.key);
            return Status.FAILURE;
        }

        const lockerEntryBuffer = await this._getEntryApply(lockerAddressString, batch);
        const lockerEntry = nodeEntryUtils.decode(lockerEntryBuffer);
        if (lockerEntry === null) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Locker account does not exist or is invalid.", node.from.key);
            return Status.FAILURE;
        }

        const lockerBalance = toBalance(lockerEntry.balance);
        if (lockerBalance === null) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Locker balance is invalid.", node.from.key);
            return Status.FAILURE;
        }
        if (!lockerBalance.greaterThanOrEquals(totalDeductedAmount)) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Insufficient locker balance.", node.from.key);
            return Status.IGNORE;
        }

        const updatedLockerBalance = lockerBalance.sub(totalDeductedAmount);
        const updatedLockerEntry = updatedLockerBalance?.update(lockerEntryBuffer) ?? null;
        if (updatedLockerEntry === null) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Failed to update locker balance.", node.from.key);
            return Status.FAILURE;
        }

        const validatorEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        const validatorBalance = validatorEntry ? toBalance(validatorEntry.balance) : null;
        const validatorReward = networkFee.percentage(PERCENT_75);
        if (validatorBalance === null || validatorReward === null) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Validator balance or reward is invalid.", node.from.key);
            return Status.FAILURE;
        }

        const updatedValidatorBalance = validatorBalance.add(validatorReward);
        const updatedValidatorEntry = updatedValidatorBalance?.update(validatorEntryBuffer) ?? null;
        if (updatedValidatorEntry === null) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Failed to update validator balance.", node.from.key);
            return Status.FAILURE;
        }

        const escrowEntry = escrowEntryUtils.init({
            lockId: op.hlo.tx,
            lockerAddress: op.address,
            claimRecipientAddress: op.hlo.ca,
            refundRecipientAddress: op.hlo.ra,
            amount: op.hlo.am,
            additionalFeeAmount: op.hlo.fa,
            additionalFeeRecipientAddress: op.hlo.fr,
            hashLock: op.hlo.hl,
            refundEpoch: op.hlo.re,
            metadata: op.hlo.md,
        }, this._config.addressPrefix);
        if (escrowEntry.length === 0) {
            this._safeLogApply(OperationType.HTLC_LOCK, "Failed to encode HTLC escrow.", node.from.key);
            return Status.FAILURE;
        }

        await batch.put(lockerAddressString, updatedLockerEntry);
        await batch.put(validatorAddressString, updatedValidatorEntry);
        await batch.put(escrowKey, escrowEntry);
        await batch.put(lockIdHex, node.value);

        if (this._config.enableTxApplyLogs) {
            console.info(`HTLC lock operation: ${lockIdHex} has been appended.`);
        }
        return Status.SUCCESS;
    }

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
