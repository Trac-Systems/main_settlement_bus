import b4a from 'b4a';
import { OperationType } from '../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { createMessage, NULL_BUFFER, ZERO_WK } from '../../../utils/buffer.js';
import addressUtils from '../utils/address.js';
import nodeEntryUtils from '../utils/nodeEntry.js';
import nodeRoleUtils from '../utils/roles.js';
import transactionUtils, { Status } from '../utils/transaction.js';
import { PERCENT_75, toBalance } from '../utils/balance.js';

export const handleApplyTransferOperation = baseState => class extends baseState {

    async _handleApplyTransferOperation(op, view, base, node, batch) {
        if (!this._stateValidationSchema.validateTransferOperation(op)) {
            this._safeLogApply(OperationType.TRANSFER, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };
        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.tro, "vs") || !Object.hasOwn(op.tro, "va") || !Object.hasOwn(op.tro, "vn")) {
            this._safeLogApply(OperationType.TRANSFER, "Operation is not complete.", node.from.key)
            return Status.FAILURE;
        };
        // for additional security, nonces should be different.
        if (b4a.equals(op.tro.in, op.tro.vn)) {
            this._safeLogApply(OperationType.TRANSFER, "Nonces should not be the same.", node.from.key)
            return Status.FAILURE;
        };
        // addresses should be different.
        if (b4a.equals(op.address, op.tro.va)) {
            this._safeLogApply(OperationType.TRANSFER, "Addresses should not be the same.", node.from.key)
            return Status.FAILURE;
        };
        // signatures should be different.
        if (b4a.equals(op.tro.is, op.tro.vs)) {
            this._safeLogApply(OperationType.TRANSFER, "Signatures should not be the same.", node.from.key)
            return Status.FAILURE;
        };

        // validate requester signature
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this._config.addressPrefix);
        if (requesterAddressString === null) {
            this._safeLogApply(OperationType.TRANSFER, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.TRANSFER, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        }

        // recreate requester message
        const requesterMessage = createMessage(
            this._config.networkId,
            op.tro.txv,
            op.tro.to,
            op.tro.am,
            op.tro.in,
            OperationType.TRANSFER
        );

        if (requesterMessage.length === 0) {
            this._safeLogApply(OperationType.TRANSFER, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        // ensure that tx is valid
        const regeneratedTxHash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(regeneratedTxHash, op.tro.tx)) {
            this._safeLogApply(OperationType.TRANSFER, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isRequesterSignatureValid = tracCryptoApi.signature.verify(op.tro.is, regeneratedTxHash, requesterPublicKey);
        if (!isRequesterSignatureValid) {
            this._safeLogApply(OperationType.TRANSFER, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // signature of the validator
        const validatorAddressBuffer = op.tro.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer, this._config.addressPrefix);
        if (validatorAddressString === null) {
            this._safeLogApply(OperationType.TRANSFER, "Validator address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.TRANSFER, "Failed to decode validator public key.", node.from.key)
            return Status.FAILURE;
        };

        const validatorMessage = createMessage(
            this._config.networkId,
            op.tro.tx,
            op.tro.vn,
            OperationType.TRANSFER
        );

        if (validatorMessage.length === 0) {
            this._safeLogApply(OperationType.TRANSFER, "Invalid validator message.", node.from.key)
            return Status.FAILURE;
        };

        const validatorMessageHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);
        const isValidatorSignatureValid = tracCryptoApi.signature.verify(op.tro.vs, validatorMessageHash, validatorPublicKey);
        if (!isValidatorSignatureValid) {
            this._safeLogApply(OperationType.TRANSFER, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this._safeLogApply(OperationType.TRANSFER, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.tro.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.TRANSFER, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        const validatorEntryBuffer = await this._getEntryApply(validatorAddressString, batch);

        // Validator consistency checks
        const isValidatorValid = await this._isValidatorValidApply(validatorEntryBuffer, node, op);
        if (!isValidatorValid) {
            this._safeLogApply(OperationType.TRANSFER, "Validator consistency check failed.", node.from.key)
            return Status.FAILURE;
        }

        // anti-replay attack
        const hashHexString = op.tro.tx.toString('hex');
        const opEntry = await this._getEntryApply(hashHexString, batch);
        if (opEntry !== null) {
            this._safeLogApply(OperationType.TRANSFER, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        };

        // Check if recipient address is valid.
        const recipientAddressBuffer = op.tro.to;
        const recipientAddressString = addressUtils.bufferToAddress(recipientAddressBuffer, this._config.addressPrefix);
        if (recipientAddressString === null) {
            this._safeLogApply(OperationType.TRANSFER, "Invalid recipient address.", node.from.key)
            return Status.FAILURE;
        };

        const recipientPublicKey = tracCryptoApi.address.decodeSafe(recipientAddressString);
        if (b4a.equals(recipientPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.TRANSFER, "Failed to decode recipient public key.", node.from.key)
            return Status.FAILURE;
        };

        const isSelfTransfer = b4a.equals(requesterAddressBuffer, recipientAddressBuffer);
        const isRecipientValidator = b4a.equals(recipientAddressBuffer, validatorAddressBuffer);

        const transferResult = await this._transfer(
            requesterAddressString,
            recipientAddressString,
            validatorAddressString,
            validatorEntryBuffer,
            op.tro.am,
            transactionUtils.FEE,
            isSelfTransfer,
            isRecipientValidator,
            batch,
            node
        );

        if (transferResult === null) {
            this._safeLogApply(OperationType.TRANSFER, "Invalid transfer result.", node.from.key);
            return Status.FAILURE;
        }

        if (transferResult === Status.IGNORE) {
            this._safeLogApply(OperationType.TRANSFER, "Transfer operation skipped.", node.from.key);
            return Status.IGNORE;
        };

        if (transferResult.senderEntry === null) {
            this._safeLogApply(OperationType.TRANSFER, "Invalid sender entry.", node.from.key)
            return Status.FAILURE;
        };

        if (transferResult.validatorEntry === null) {
            this._safeLogApply(OperationType.TRANSFER, "Invalid validator entry.", node.from.key)
            return Status.FAILURE;
        };

        if (!isSelfTransfer) {
            if (transferResult.recipientEntry === null) {
                this._safeLogApply(OperationType.TRANSFER, "Invalid recipient entry.", node.from.key)
                return Status.FAILURE;
            };

            await batch.put(recipientAddressString, transferResult.recipientEntry);
        }

        await batch.put(requesterAddressString, transferResult.senderEntry);
        await batch.put(validatorAddressString, transferResult.validatorEntry);

        if (!isSelfTransfer && !isRecipientValidator && transferResult.recipientEntry !== null) {
            await batch.put(recipientAddressString, transferResult.recipientEntry);
        }

        await batch.put(hashHexString, node.value);

        if (this._config.enableTxApplyLogs) {
            console.info(`Transfer operation: ${hashHexString} has been appended.`);
        }
        return Status.SUCCESS;
    }

    async _transfer(senderAddressString, recipientAddressString, validatorAddressString, validatorEntryBuffer, transferAmountBuffer, feeAmountBuffer, isSelfTransfer, isRecipientValidator, batch, node) {
        if (!senderAddressString ||
            !recipientAddressString ||
            !validatorAddressString ||
            !validatorEntryBuffer ||
            !transferAmountBuffer ||
            !feeAmountBuffer ||
            (isSelfTransfer === null || isSelfTransfer === undefined) ||
            !batch ||
            !node
        ) {
            this._safeLogApply(OperationType.TRANSFER, "Invalid transfer incoming data.", node.from.key)
            return null;
        }

        const transferAmount = toBalance(transferAmountBuffer);
        const feeAmount = toBalance(feeAmountBuffer);
        if (transferAmount === null || feeAmount === null) {
            this._safeLogApply(OperationType.TRANSFER, "Invalid fee/transfer amount.", node.from.key)
            return null;
        }

        // totalDeductedAmount = transferAmount + fee. When transferamount is 0, then totalDeductedAmount = fee. Because 0 + fee = fee.
        const totalDeductedAmount = isSelfTransfer ? feeAmount : transferAmount.add(feeAmount);
        if (totalDeductedAmount === null) {
            this._safeLogApply(OperationType.TRANSFER, "Invalid total deducted amount.", node.from.key)
            return null;
        }

        const senderEntryBuffer = await this._getEntryApply(senderAddressString, batch);
        if (senderEntryBuffer === null) {
            this._safeLogApply(OperationType.TRANSFER, "Invalid sender node entry buffer.", node.from.key)
            return null;
        }

        const senderEntry = nodeEntryUtils.decode(senderEntryBuffer);
        if (senderEntry === null) {
            this._safeLogApply(OperationType.TRANSFER, "Invalid sender node entry.", node.from.key)
            return null;
        }

        const senderBalance = toBalance(senderEntry.balance);
        if (senderBalance === null) {
            this._safeLogApply(OperationType.TRANSFER, "Invalid sender balance.", node.from.key)
            return null;
        }

        if (!senderBalance.greaterThanOrEquals(totalDeductedAmount)) {
            this._safeLogApply(OperationType.TRANSFER, "Insufficient sender balance.", node.from.key)
            return Status.IGNORE;
        }

        const newSenderBalance = senderBalance.sub(totalDeductedAmount);
        if (newSenderBalance === null) {
            this._safeLogApply(OperationType.TRANSFER, "Failed to apply fee to sender node balance.", node.from.key)
            return null;
        }

        const updatedSenderEntry = newSenderBalance.update(senderEntryBuffer);
        if (updatedSenderEntry === null) {
            this._safeLogApply(OperationType.TRANSFER, "Failed to update sender node balance.", node.from.key)
            return null;
        }

        const result = {
            senderEntry: updatedSenderEntry,
            recipientEntry: null,
            validatorEntry: null,
        };

        if (!isSelfTransfer && !isRecipientValidator) {
            const recipientEntryBuffer = await this._getEntryApply(recipientAddressString, batch);
            if (recipientEntryBuffer === null) {
                if (transferAmount.value === null) {
                    this._safeLogApply(OperationType.TRANSFER, "Invalid transfer amount.", node.from.key)
                    return null;
                };
                const newRecipientEntry = nodeEntryUtils.init(
                    ZERO_WK,
                    nodeRoleUtils.NodeRole.READER,
                    transferAmount.value
                );
                if (newRecipientEntry.length === 0) {
                    this._safeLogApply(OperationType.TRANSFER, "Invalid recipient entry.", node.from.key)
                    return null;
                };
                result.recipientEntry = newRecipientEntry;
            } else {
                const recipientEntry = nodeEntryUtils.decode(recipientEntryBuffer);
                if (recipientEntry === null) {
                    this._safeLogApply(OperationType.TRANSFER, "Invalid recipient entry.", node.from.key)
                    return null;
                };

                const recipientBalance = toBalance(recipientEntry.balance);
                if (recipientBalance === null) {
                    this._safeLogApply(OperationType.TRANSFER, "Invalid recipient balance.", node.from.key)
                    return null;
                };

                const newRecipientBalance = recipientBalance.add(transferAmount);
                if (newRecipientBalance === null) {
                    this._safeLogApply(OperationType.TRANSFER, "Failed to transfer amount to recipient balance.", node.from.key)
                    return null;
                };

                const updatedRecipientEntry = newRecipientBalance.update(recipientEntryBuffer);
                if (updatedRecipientEntry === null) {
                    this._safeLogApply(OperationType.TRANSFER, "Failed to update recipient node balance.", node.from.key)
                    return null;
                };
                result.recipientEntry = updatedRecipientEntry;
            }
        }

        const validatorEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (validatorEntry === null) {
            this._safeLogApply(OperationType.TRANSFER, "Invalid validator entry.", node.from.key)
            return null;
        }

        const validatorBalance = toBalance(validatorEntry.balance);
        if (validatorBalance === null) return null;

        const validatorReward = feeAmount.percentage(PERCENT_75);
        if (validatorReward === null) return null;

        const newValidatorBalance = isRecipientValidator
            ? validatorBalance.add(transferAmount).add(validatorReward)
            : validatorBalance.add(validatorReward);

        if (newValidatorBalance === null) {
            this._safeLogApply(OperationType.TRANSFER, "Failed to transfer fee to validator balance.", node.from.key)
            return null;
        }

        const updatedValidatorEntry = newValidatorBalance.update(validatorEntryBuffer);
        if (updatedValidatorEntry === null) {
            this._safeLogApply(OperationType.TRANSFER, "Failed to update validator node balance.", node.from.key)
            return null;
        }

        result.validatorEntry = updatedValidatorEntry;

        if (isRecipientValidator) {
            result.recipientEntry = updatedValidatorEntry;
        }

        return result;
    }
};
