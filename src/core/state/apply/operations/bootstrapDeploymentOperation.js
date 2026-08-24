import b4a from 'b4a';
import {
    EntryType,
    OperationType,
} from '../../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import {
} from '../../../../codecs/apply/applyOperationCodec.js';
import {
    createMessage,
    NULL_BUFFER,
} from '../../../../utils/buffer.js';
import addressUtils from '../../utils/address.js';
import nodeEntryUtils from '../../utils/nodeEntry.js';
import transactionUtils from '../../utils/transaction.js';
import {
    toBalance,
    PERCENT_75,
} from '../../utils/balance.js';
import deploymentEntryUtils from '../../utils/deploymentEntry.js';
import { Status } from '../../utils/transaction.js';
import {
} from '../../../../codecs/consensus/v1/vdfConfigCodec.js';

class BootstrapDeploymentHandler {
    #repo;
    #config;
    #stateValidationSchema;

    constructor(repo, config, stateValidationSchema) {
        this.#repo = repo;
        this.#config = config;
        this.#stateValidationSchema = stateValidationSchema;
    }

    async performOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateBootstrapDeploymentOperation(op)) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };
        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.bdo, "vs") || !Object.hasOwn(op.bdo, "va") || !Object.hasOwn(op.bdo, "vn")) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Operation is not complete.", node.from.key)
            return Status.FAILURE;
        };
        // do not allow to deploy bootstrap deployment on the same bootstrap.
        if (b4a.equals(op.bdo.bs, this.#config.bootstrap)) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Cannot deploy bootstrap on existing same bootstrap.", node.from.key)
            return Status.FAILURE;
        };
        // for additional security, nonces should be different.
        if (b4a.equals(op.bdo.in, op.bdo.vn)) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Nonces should not be the same.", node.from.key)
            return Status.FAILURE;
        };
        // addresses should be different.
        if (b4a.equals(op.address, op.bdo.va)) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Addresses should be different.", node.from.key)
            return Status.FAILURE;
        };
        // signatures should be different.
        if (b4a.equals(op.bdo.is, op.bdo.vs)) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Signatures should be different.", node.from.key)
            return Status.FAILURE;
        };


        // validate requester signature
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // validate requester public key
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to decode requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate requester message
        const requesterMessage = createMessage(
            this.#config.networkId,
            op.bdo.txv,
            op.bdo.bs,
            op.bdo.ic,
            op.bdo.in,
            OperationType.BOOTSTRAP_DEPLOYMENT
        );

        if (requesterMessage.length === 0) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        // ensure that tx is valid
        const regeneratedTxHash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(regeneratedTxHash, op.bdo.tx)) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isRequesterSignatureValid = tracCryptoApi.signature.verify(op.bdo.is, regeneratedTxHash, requesterPublicKey);
        if (!isRequesterSignatureValid) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        const bootstrapDeploymentHexString = op.bdo.bs.toString('hex');

        //validation of validator signature
        const validatorAddressBuffer = op.bdo.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer, this.#config.addressPrefix);
        if (validatorAddressString === null) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator address.", node.from.key)
            return Status.FAILURE;
        };

        // validate validator public key
        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to decode validator public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate validator message
        const validatorMessage = createMessage(
            this.#config.networkId,
            op.bdo.tx,
            op.bdo.vn,
            OperationType.BOOTSTRAP_DEPLOYMENT
        );

        if (validatorMessage.length === 0) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator message.", node.from.key)
            return Status.FAILURE;
        };

        const validatorMessageHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);

        const isValidatorSignatureValid = tracCryptoApi.signature.verify(op.bdo.vs, validatorMessageHash, validatorPublicKey);
        if (!isValidatorSignatureValid) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to verify validator message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repo.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.bdo.txv, indexersSequenceState)) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        const validatorEntryBuffer = await this.#repo.getEntry(validatorAddressString, batch);

        // Validator consistency checks
        const isValidatorValid = await this.#repo.isValidatorValid(validatorEntryBuffer, node, op);
        if (!isValidatorValid) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Validator consistency check failed.", node.from.key)
            return Status.FAILURE;
        }

        // anti-replay attack
        const hashHexString = op.bdo.tx.toString('hex');
        const opEntry = await this.#repo.getEntry(hashHexString, batch);
        if (opEntry !== null) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        }; // Operation has already been applied.

        // If deployment already exists, do not process it again.
        const alreadyRegisteredBootstrap = await this.#repo.getDeploymentEntry(bootstrapDeploymentHexString, batch);
        if (alreadyRegisteredBootstrap !== null) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Bootstrap already registered.", node.from.key)
            return Status.IGNORE;
        };

        const deploymentEntry = deploymentEntryUtils.encode(op.bdo.tx, requesterAddressBuffer, this.#config.addressPrefix);
        if (deploymentEntry.length === 0) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid deployment entry.", node.from.key)
            return Status.FAILURE;
        };

        const feeAmount = toBalance(transactionUtils.FEE);
        if (feeAmount === null) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid fee amount.", node.from.key)
            return Status.FAILURE;
        };

        // charge fee from the invoker
        const requesterNodeEntryBuffer = await this.#repo.getEntry(requesterAddressString, batch);
        if (requesterNodeEntryBuffer === null) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid requester node entry buffer.", node.from.key)
            return Status.FAILURE;
        };

        const requesterNodeEntry = nodeEntryUtils.decode(requesterNodeEntryBuffer);
        if (requesterNodeEntry === null) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid requester node entry.", node.from.key)
            return Status.FAILURE;
        };

        const requesterBalance = toBalance(requesterNodeEntry.balance);
        if (requesterBalance === null) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid requester balance.", node.from.key)
            return Status.FAILURE;
        };

        if (!requesterBalance.greaterThanOrEquals(feeAmount)) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Insufficient requester balance.", node.from.key)
            return Status.IGNORE;
        };

        const newRequesterBalance = requesterBalance.sub(feeAmount);
        if (newRequesterBalance === null) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to apply fee to requester.", node.from.key)
            return Status.FAILURE;
        };

        const updatedRequesterNodeEntry = newRequesterBalance.update(requesterNodeEntryBuffer);
        if (updatedRequesterNodeEntry === null) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to update requester node balance.", node.from.key)
            return Status.FAILURE;
        };

        // reward validator for processing this transaction.
        const validatorNodeEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (validatorNodeEntry === null) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator node entry.", node.from.key)
            return Status.FAILURE;
        };

        const validatorBalance = toBalance(validatorNodeEntry.balance);
        if (validatorBalance === null) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator balance.", node.from.key)
            return Status.FAILURE;
        };

        const newValidatorBalance = validatorBalance.add(feeAmount.percentage(PERCENT_75));
        if (newValidatorBalance === null) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to transfer fee to validator.", node.from.key)
            return Status.FAILURE;
        };

        const updatedValidatorNodeEntry = newValidatorBalance.update(validatorEntryBuffer);
        if (updatedValidatorNodeEntry === null) {
            this.#repo.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to update validator node balance.", node.from.key)
            return Status.FAILURE;
        };

        await batch.put(EntryType.DEPLOYMENT + bootstrapDeploymentHexString, deploymentEntry);
        await batch.put(requesterAddressString, updatedRequesterNodeEntry);
        await batch.put(validatorAddressString, updatedValidatorNodeEntry);
        await batch.put(hashHexString, node.value);

        if (this.#config.enableTxApplyLogs) {
            console.info(`Deployment operation: ${hashHexString} and deployment/${bootstrapDeploymentHexString} have been appended.`);
        }
        return Status.SUCCESS;
    }


}

export default BootstrapDeploymentHandler;
