import b4a from 'b4a';
import { EntryType, EPOCH_BYTE_LENGTH, HASH_BYTE_LENGTH, OperationType, HTLC_MIN_LOCK_DURATION_EPOCHS, PUBLIC_KEY_LENGTH } from '../../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { createMessage, isBufferValid, isZeroBuffer } from '../../../../utils/buffer.js';
import addressUtils from '../../utils/address.js';
import nodeEntryUtils from '../../utils/nodeEntry.js';
import transactionUtils, { Status } from '../../utils/transaction.js';
import { PERCENT_75, toBalance } from '../../utils/balance.js';
import * as escrowEntryUtils from '../../utils/escrowEntry.js';
import { createHtlcLockSigningMessage, verifyOrderedHtlcCosignerSignatures } from '../../../../utils/htlcLock.js';

export const handleApplyHtlcLockOperation = baseState => class extends baseState {

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
};
