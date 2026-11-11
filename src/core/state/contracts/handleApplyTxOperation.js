import b4a from 'b4a';
import { OperationType } from '../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { createMessage, NULL_BUFFER } from '../../../utils/buffer.js';
import addressUtils from '../utils/address.js';
import nodeEntryUtils from '../utils/nodeEntry.js';
import transactionUtils, { Status } from '../utils/transaction.js';
import { PERCENT_25, PERCENT_50, toBalance } from '../utils/balance.js';
import deploymentEntryUtils from '../utils/deploymentEntry.js';

export const handleApplyTxOperation = baseState => class extends baseState {

    async _handleApplyTxOperation(op, view, base, node, batch) {
        // ATTENTION: The sanitization should be done before ANY other check, otherwise we risk crashing
        if (!this._stateValidationSchema.validateTransactionOperation(op)) {
            this._safeLogApply(OperationType.TX, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };
        // reject transaction which is not complete
        if (!Object.hasOwn(op.txo, "vs") || !Object.hasOwn(op.txo, "va") || !Object.hasOwn(op.txo, "vn")) {
            this._safeLogApply(OperationType.TX, "Operation is not complete.", node.from.key)
            return Status.FAILURE;
        };
        // reject if the validator signed their own transaction
        if (b4a.equals(op.address, op.txo.va)) {
            this._safeLogApply(OperationType.TX, "Validator cannot sign its own transaction.", node.from.key)
            return Status.FAILURE;
        };
        // reject if the nonces are the same
        if (b4a.equals(op.txo.in, op.txo.vn)) {
            this._safeLogApply(OperationType.TX, "Nonces should not be the same.", node.from.key)
            return Status.FAILURE;
        };
        // reject if the signatures are the same
        if (b4a.equals(op.txo.is, op.txo.vs)) {
            this._safeLogApply(OperationType.TX, "Signatures should not be the same.", node.from.key)
            return Status.FAILURE;
        };
        // reject if the external bootstrap is the same as the network bootstrap
        if (b4a.equals(op.txo.bs, op.txo.mbs)) {
            this._safeLogApply(OperationType.TX, "Network and external bootstrap cannot be the same.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.txo.mbs, this._config.bootstrap)) {
            this._safeLogApply(OperationType.TX, "Declared MSB bootstrap is different than real MSB bootstrap.", node.from.key)
            return Status.FAILURE;
        };

        // validate invoker signature
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this._config.addressPrefix);
        if (requesterAddressString === null) {
            this._safeLogApply(OperationType.TX, "Invalid requester address.", node.from.key)
            return Status.FAILURE;
        };

        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.TX, "Failed to decode requester public key.", node.from.key)
            return Status.FAILURE;
        };

        const requesterMessage = createMessage(
            this._config.networkId,
            op.txo.txv,
            op.txo.iw,
            op.txo.ch,
            op.txo.bs,
            this._config.bootstrap,
            op.txo.in,
            OperationType.TX
        );
        if (requesterMessage.length === 0) {
            this._safeLogApply(OperationType.TX, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const regeneratedTxHash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(regeneratedTxHash, op.txo.tx)) {
            this._safeLogApply(OperationType.TX, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isRequesterSignatureValid = tracCryptoApi.signature.verify(op.txo.is, op.txo.tx, requesterPublicKey); // tx contains already a nonce.
        if (!isRequesterSignatureValid) {
            this._safeLogApply(OperationType.TX, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        //second signature
        const validatorAddressBuffer = op.txo.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer, this._config.addressPrefix);
        if (validatorAddressString === null) {
            this._safeLogApply(OperationType.TX, "Invalid validator address.", node.from.key)
            return Status.FAILURE;
        };

        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.TX, "Failed to decode validator public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate validator message
        const validatorMessage = createMessage(
            this._config.networkId,
            op.txo.tx,
            op.txo.vn,
            OperationType.TX
        );

        if (validatorMessage.length === 0) {
            this._safeLogApply(OperationType.TX, "Invalid validator message.", node.from.key)
            return Status.FAILURE;
        };

        const validatorMessageHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);
        const isValidatorSignatureValid = tracCryptoApi.signature.verify(op.txo.vs, validatorMessageHash, validatorPublicKey);
        if (!isValidatorSignatureValid) {
            this._safeLogApply(OperationType.TX, "Failed to verify validator message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this._safeLogApply(OperationType.TX, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.txo.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.TX, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        const validatorEntryBuffer = await this._getEntryApply(validatorAddressString, batch);

        // Validator consistency checks
        const isValidatorValid = await this._isValidatorValidApply(validatorEntryBuffer, node, op);
        if (!isValidatorValid) {
            this._safeLogApply(OperationType.TX, "Validator consistency check failed.", node.from.key)
            return Status.FAILURE;
        }

        // anti-replay attack
        const hashHexString = op.txo.tx.toString('hex');
        const opEntry = await this._getEntryApply(hashHexString, batch);
        if (opEntry !== null) {
            this._safeLogApply(OperationType.TX, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        };

        // if user is performing a transaction on non-deployed bootstrap, then we need to reject it.
        // if deployment/<bootstrap> is not null then it means that the bootstrap is already deployed, and it should
        // point to payload, which is pointing to the txHash.
        const bootstrapHasBeenRegistered = await this._getDeploymentEntryApply(op.txo.bs.toString('hex'), batch);
        if (bootstrapHasBeenRegistered === null) {
            this._safeLogApply(OperationType.TX, "Bootstrap has not been registered.", node.from.key)
            return Status.FAILURE;
        };

        // check the subnetwork creator address
        const deploymentEntry = deploymentEntryUtils.decode(bootstrapHasBeenRegistered, this._config.addressLength);
        if (deploymentEntry === null) {
            this._safeLogApply(OperationType.TX, "Invalid deployment entry.", node.from.key)
            return Status.FAILURE;
        };

        const subnetworkCreatorAddressString = addressUtils.bufferToAddress(deploymentEntry.address, this._config.addressPrefix);
        if (subnetworkCreatorAddressString === null) {
            this._safeLogApply(OperationType.TX, "Invalid subnet creator address.", node.from.key)
            return Status.FAILURE;
        };

        const feeAmount = toBalance(transactionUtils.FEE);
        if (feeAmount === null) {
            this._safeLogApply(OperationType.TX, "Invalid fee amount.", node.from.key)
            return Status.FAILURE;
        };

        const transferFeeTxOperationResult = await this._transferFeeTxOperation(
            requesterAddressString,
            validatorAddressString,
            validatorEntryBuffer,
            subnetworkCreatorAddressString,
            feeAmount,
            batch,
            node
        );

        // TODO: cover next 4 guards below with tests
        if (transferFeeTxOperationResult === null) {
            this._safeLogApply(OperationType.TX, "Fee transfer operation failed completely.", node.from.key);
            return Status.FAILURE;
        }

        if (transferFeeTxOperationResult === Status.IGNORE) {
            this._safeLogApply(OperationType.TX, "Fee transfer operation skipped.", node.from.key);
            return Status.IGNORE;
        }

        if (transferFeeTxOperationResult.requesterEntry === null) {
            this._safeLogApply(OperationType.TX, "Failed to process requester fee deduction.", node.from.key)
            return Status.FAILURE;
        }

        if (transferFeeTxOperationResult.validatorEntry === null) {
            this._safeLogApply(OperationType.TX, "Failed to process validator fee reward.", node.from.key)
            return Status.FAILURE;
        }

        await batch.put(requesterAddressString, transferFeeTxOperationResult.requesterEntry);
        await batch.put(validatorAddressString, transferFeeTxOperationResult.validatorEntry);

        // Handle optional subnetwork creator fee - may be null if creator is requester or validator
        if (transferFeeTxOperationResult.subnetworkCreatorEntry !== null) {
            await batch.put(subnetworkCreatorAddressString, transferFeeTxOperationResult.subnetworkCreatorEntry);
        }
        await batch.put(hashHexString, node.value);

        if (this._config.enableTxApplyLogs) {
            console.info(`Subnetwork TX operation: ${hashHexString} has been appended.`);
        }
        return Status.SUCCESS;
    }

    async _transferFeeTxOperation(requesterAddressString, validatorAddressString, validatorEntryBuffer, subnetworkCreatorAddressString, feeAmount, batch, node) {
        if (!requesterAddressString ||
            !validatorAddressString ||
            !validatorEntryBuffer ||
            !subnetworkCreatorAddressString ||
            !feeAmount ||
            !batch ||
            !node
        ) {
            this._safeLogApply("transferFeeTxOperation", "Invalid incoming data.", node.from.key)
            return null;
        }

        // case when requester is also the validator is not possible.
        // charge fee from the requester
        const requesterNodeEntryBuffer = await this._getEntryApply(requesterAddressString, batch);
        if (requesterNodeEntryBuffer === null) {
            this._safeLogApply("transferFeeTxOperation", "Invalid requester node entry buffer.", node.from.key)
            return null;
        }

        const requesterNodeEntry = nodeEntryUtils.decode(requesterNodeEntryBuffer);
        if (requesterNodeEntry === null) {
            this._safeLogApply("transferFeeTxOperation", "Invalid requester node entry, can not to decode.", node.from.key)
            return null;
        }

        const requesterBalance = toBalance(requesterNodeEntry.balance);
        if (requesterBalance === null) {
            this._safeLogApply("transferFeeTxOperation", "Invalid requester balance.", node.from.key)
            return null;
        }

        if (!requesterBalance.greaterThanOrEquals(feeAmount)) {
            this._safeLogApply("transferFeeTxOperation", "Insufficient requester balance to pay fee.", node.from.key)
            return Status.IGNORE;
        }

        const newRequesterBalance = requesterBalance.sub(feeAmount);
        if (newRequesterBalance === null) {
            this._safeLogApply("transferFeeTxOperation", "Failed to deduct fee from requester balance.", node.from.key)
            return null;
        }

        const updatedRequesterNodeEntry = newRequesterBalance.update(requesterNodeEntryBuffer);
        if (updatedRequesterNodeEntry === null) {
            this._safeLogApply("transferFeeTxOperation", "Failed to update requester node balance.", node.from.key)
            return null;
        }

        // Validator always gets 50% of the fee by the base

        const validatorNodeEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (validatorNodeEntry === null) {
            this._safeLogApply("transferFeeTxOperation", "Invalid validator node entry, can not to decode.", node.from.key)
            return null;
        }

        const validatorBalance = toBalance(validatorNodeEntry.balance);
        if (validatorBalance === null) {
            this._safeLogApply("transferFeeTxOperation", "Invalid validator balance.", node.from.key)
            return null;
        }

        const newValidatorBalance = validatorBalance.add(feeAmount.percentage(PERCENT_50));
        if (newValidatorBalance === null) {
            this._safeLogApply("transferFeeTxOperation", "Failed to add fee to validator balance.", node.from.key)
            return null;
        }

        const updatedValidatorNodeEntry = newValidatorBalance.update(validatorEntryBuffer);
        if (updatedValidatorNodeEntry === null) {
            this._safeLogApply("transferFeeTxOperation", "Failed to update validator node balance.", node.from.key)
            return null;
        }

        // If requester is the subnetwork creator:
        // 1. Validator got 50%
        // 2. Other 50% is burned
        // 3. No additional reward for bootstrap deployer
        if (requesterAddressString === subnetworkCreatorAddressString) {
            return {
                requesterEntry: updatedRequesterNodeEntry,
                validatorEntry: updatedValidatorNodeEntry,
                subnetworkCreatorEntry: null
            };
        }

        // If validator is also the bootstrap deployer:
        // 1. Gets 75% total (50% as validator + 25% as bootstrap deployer)
        // 2. 25% is burned
        if (validatorAddressString === subnetworkCreatorAddressString) {
            // We already added 50% as validator fee, now add only the additional 25%
            const newValidatorBalanceWithBonus = newValidatorBalance.add(feeAmount.percentage(PERCENT_25));
            if (newValidatorBalanceWithBonus === null) {
                this._safeLogApply("transferFeeTxOperation", "Failed to add bonus fee to validator balance.", node.from.key)
                return null;
            }

            const updatedValidatorNodeEntryWithBonus = newValidatorBalanceWithBonus.update(validatorEntryBuffer);
            if (updatedValidatorNodeEntryWithBonus === null) {
                this._safeLogApply("transferFeeTxOperation", "Failed to update validator node balance with bonus.", node.from.key)
                return null;
            }

            return {
                requesterEntry: updatedRequesterNodeEntry,
                validatorEntry: updatedValidatorNodeEntryWithBonus,
                subnetworkCreatorEntry: null
            };
        }

        // Normal case (validator is not the bootstrap deployer):
        // 1. Validator got 50%
        // 2. Bootstrap deployer gets 25%
        // 3. 25% is burned
        const subnetworkCreatorNodeEntryBuffer = await this._getEntryApply(subnetworkCreatorAddressString, batch);
        if (subnetworkCreatorNodeEntryBuffer === null) {
            this._safeLogApply("transferFeeTxOperation", "Invalid subnetwork creator -  it does not exists", node.from.key)
            return null;
        }

        const subnetworkCreatorNodeEntry = nodeEntryUtils.decode(subnetworkCreatorNodeEntryBuffer);
        if (subnetworkCreatorNodeEntry === null) {
            this._safeLogApply("transferFeeTxOperation", "Invalid subnetwork creator node entry, can not to decode.", node.from.key)
            return null;
        }

        const subnetworkCreatorBalance = toBalance(subnetworkCreatorNodeEntry.balance);
        if (subnetworkCreatorBalance === null) {
            this._safeLogApply("transferFeeTxOperation", "Invalid subnetwork creator balance.", node.from.key)
            return null;
        }

        const newSubnetworkCreatorBalance = subnetworkCreatorBalance.add(feeAmount.percentage(PERCENT_25));
        if (newSubnetworkCreatorBalance === null) {
            this._safeLogApply("transferFeeTxOperation", "Failed to add fee to subnetwork creator balance.", node.from.key)
            return null;
        }

        const updatedSubnetworkCreatorNodeEntry = newSubnetworkCreatorBalance.update(subnetworkCreatorNodeEntryBuffer);
        if (updatedSubnetworkCreatorNodeEntry === null) {
            this._safeLogApply("transferFeeTxOperation", "Failed to update subnetwork creator node balance.", node.from.key)
            return null;
        }

        return {
            requesterEntry: updatedRequesterNodeEntry,
            validatorEntry: updatedValidatorNodeEntry,
            subnetworkCreatorEntry: updatedSubnetworkCreatorNodeEntry
        };
    }
};
