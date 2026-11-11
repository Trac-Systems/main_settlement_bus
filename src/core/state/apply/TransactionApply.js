import b4a from 'b4a';
import { EntryType, OperationType } from '../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { createMessage, NULL_BUFFER, ZERO_WK } from '../../../utils/buffer.js';
import addressUtils from '../utils/address.js';
import nodeEntryUtils from '../utils/nodeEntry.js';
import nodeRoleUtils from '../utils/roles.js';
import transactionUtils, { Status } from '../utils/transaction.js';
import { PERCENT_25, PERCENT_50, PERCENT_75, toBalance } from '../utils/balance.js';
import deploymentEntryUtils from '../utils/deploymentEntry.js';

export const withTransactionApply = Base => class extends Base {

    async _handleApplyBootstrapDeploymentOperation(op, view, base, node, batch) {
        if (!this._stateValidationSchema.validateBootstrapDeploymentOperation(op)) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };
        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.bdo, "vs") || !Object.hasOwn(op.bdo, "va") || !Object.hasOwn(op.bdo, "vn")) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Operation is not complete.", node.from.key)
            return Status.FAILURE;
        };
        // do not allow to deploy bootstrap deployment on the same bootstrap.
        if (b4a.equals(op.bdo.bs, this._config.bootstrap)) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Cannot deploy bootstrap on existing same bootstrap.", node.from.key)
            return Status.FAILURE;
        };
        // for additional security, nonces should be different.
        if (b4a.equals(op.bdo.in, op.bdo.vn)) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Nonces should not be the same.", node.from.key)
            return Status.FAILURE;
        };
        // addresses should be different.
        if (b4a.equals(op.address, op.bdo.va)) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Addresses should be different.", node.from.key)
            return Status.FAILURE;
        };
        // signatures should be different.
        if (b4a.equals(op.bdo.is, op.bdo.vs)) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Signatures should be different.", node.from.key)
            return Status.FAILURE;
        };


        // validate requester signature
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this._config.addressPrefix);
        if (requesterAddressString === null) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // validate requester public key
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to decode requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate requester message
        const requesterMessage = createMessage(
            this._config.networkId,
            op.bdo.txv,
            op.bdo.bs,
            op.bdo.ic,
            op.bdo.in,
            OperationType.BOOTSTRAP_DEPLOYMENT
        );

        if (requesterMessage.length === 0) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        // ensure that tx is valid
        const regeneratedTxHash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(regeneratedTxHash, op.bdo.tx)) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isRequesterSignatureValid = tracCryptoApi.signature.verify(op.bdo.is, regeneratedTxHash, requesterPublicKey);
        if (!isRequesterSignatureValid) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        const bootstrapDeploymentHexString = op.bdo.bs.toString('hex');

        //validation of validator signature
        const validatorAddressBuffer = op.bdo.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer, this._config.addressPrefix);
        if (validatorAddressString === null) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator address.", node.from.key)
            return Status.FAILURE;
        };

        // validate validator public key
        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to decode validator public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate validator message
        const validatorMessage = createMessage(
            this._config.networkId,
            op.bdo.tx,
            op.bdo.vn,
            OperationType.BOOTSTRAP_DEPLOYMENT
        );

        if (validatorMessage.length === 0) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator message.", node.from.key)
            return Status.FAILURE;
        };

        const validatorMessageHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);

        const isValidatorSignatureValid = tracCryptoApi.signature.verify(op.bdo.vs, validatorMessageHash, validatorPublicKey);
        if (!isValidatorSignatureValid) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to verify validator message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.bdo.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        const validatorEntryBuffer = await this._getEntryApply(validatorAddressString, batch);

        // Validator consistency checks
        const isValidatorValid = await this._isValidatorValidApply(validatorEntryBuffer, node, op);
        if (!isValidatorValid) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Validator consistency check failed.", node.from.key)
            return Status.FAILURE;
        }

        // anti-replay attack
        const hashHexString = op.bdo.tx.toString('hex');
        const opEntry = await this._getEntryApply(hashHexString, batch);
        if (opEntry !== null) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        }; // Operation has already been applied.

        // If deployment already exists, do not process it again.
        const alreadyRegisteredBootstrap = await this._getDeploymentEntryApply(bootstrapDeploymentHexString, batch);
        if (alreadyRegisteredBootstrap !== null) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Bootstrap already registered.", node.from.key)
            return Status.IGNORE;
        };

        const deploymentEntry = deploymentEntryUtils.encode(op.bdo.tx, requesterAddressBuffer, this._config.addressPrefix);
        if (deploymentEntry.length === 0) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid deployment entry.", node.from.key)
            return Status.FAILURE;
        };

        const feeAmount = toBalance(transactionUtils.FEE);
        if (feeAmount === null) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid fee amount.", node.from.key)
            return Status.FAILURE;
        };

        // charge fee from the invoker
        const requesterNodeEntryBuffer = await this._getEntryApply(requesterAddressString, batch);
        if (requesterNodeEntryBuffer === null) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid requester node entry buffer.", node.from.key)
            return Status.FAILURE;
        };

        const requesterNodeEntry = nodeEntryUtils.decode(requesterNodeEntryBuffer);
        if (requesterNodeEntry === null) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid requester node entry.", node.from.key)
            return Status.FAILURE;
        };

        const requesterBalance = toBalance(requesterNodeEntry.balance);
        if (requesterBalance === null) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid requester balance.", node.from.key)
            return Status.FAILURE;
        };

        if (!requesterBalance.greaterThanOrEquals(feeAmount)) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Insufficient requester balance.", node.from.key)
            return Status.IGNORE;
        };

        const newRequesterBalance = requesterBalance.sub(feeAmount);
        if (newRequesterBalance === null) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to apply fee to requester.", node.from.key)
            return Status.FAILURE;
        };

        const updatedRequesterNodeEntry = newRequesterBalance.update(requesterNodeEntryBuffer);
        if (updatedRequesterNodeEntry === null) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to update requester node balance.", node.from.key)
            return Status.FAILURE;
        };

        // reward validator for processing this transaction.
        const validatorNodeEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (validatorNodeEntry === null) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator node entry.", node.from.key)
            return Status.FAILURE;
        };

        const validatorBalance = toBalance(validatorNodeEntry.balance);
        if (validatorBalance === null) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator balance.", node.from.key)
            return Status.FAILURE;
        };

        const newValidatorBalance = validatorBalance.add(feeAmount.percentage(PERCENT_75));
        if (newValidatorBalance === null) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to transfer fee to validator.", node.from.key)
            return Status.FAILURE;
        };

        const updatedValidatorNodeEntry = newValidatorBalance.update(validatorEntryBuffer);
        if (updatedValidatorNodeEntry === null) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to update validator node balance.", node.from.key)
            return Status.FAILURE;
        };

        await batch.put(EntryType.DEPLOYMENT + bootstrapDeploymentHexString, deploymentEntry);
        await batch.put(requesterAddressString, updatedRequesterNodeEntry);
        await batch.put(validatorAddressString, updatedValidatorNodeEntry);
        await batch.put(hashHexString, node.value);

        if (this._config.enableTxApplyLogs) {
            console.info(`Deployment operation: ${hashHexString} and deployment/${bootstrapDeploymentHexString} have been appended.`);
        }
        return Status.SUCCESS;
    }

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
