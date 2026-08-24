import BaseHandler from './base/BaseHandler.js';
import b4a from 'b4a';
import {
    OperationType,
    CustomEventType,
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
import nodeRoleUtils from '../../utils/roles.js';
import {
    BALANCE_FEE,
    toBalance,
    PERCENT_75,
} from '../../utils/balance.js';
import { Status } from '../../utils/transaction.js';
import {
} from '../../../../codecs/consensus/v1/vdfConfigCodec.js';

class RemoveWriterHandler extends BaseHandler {
    #repo;
    #config;
    #stateValidationSchema;

    constructor(repo, config, stateValidationSchema, state, logger) {
        super(logger, state);
        this.#repo = repo;
        this.#config = config;
        this.#stateValidationSchema = stateValidationSchema;
    }

    async #removeWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddress, validatorAddressString, validatorEntryBuffer) {

        // Fetch the node entry for the given address
        const requesterNodeEntry = await this.#repo.getEntry(requesterAddressString, batch);
        if (requesterNodeEntry === null) {
            this.logger.error(OperationType.REMOVE_WRITER, "Failed to verify requester node entry.", node.from.key)
            return null;
        };

        const decodedNodeEntry = nodeEntryUtils.decode(requesterNodeEntry);
        if (decodedNodeEntry === null) {
            this.logger.error(OperationType.REMOVE_WRITER, "Failed to decode requester node entry.", node.from.key)
            return null;
        };

        // Check if the node is a writer or an indexer
        const isNodeWriter = decodedNodeEntry.isWriter;
        const isNodeIndexer = decodedNodeEntry.isIndexer;

        if (isNodeIndexer || !isNodeWriter) {
            this.logger.error(OperationType.REMOVE_WRITER, "Node has to be a writer, and cannot be an indexer.", node.from.key)
            return null;
        };

        /**
         * Ensure that:
         * 1) writer key exists in registry (we can not unregister something that was not registered),
         * 2) matches the one in node entry ,
         * 3) belongs to the requester - this prevents unauthorized key removal
         */
        const writerKeyHasBeenRegistered = await this.#repo.getRegisteredWriterKey(batch, op.rao.iw.toString('hex'))
        if (writerKeyHasBeenRegistered === null ||
            !b4a.equals(op.rao.iw, decodedNodeEntry.wk) ||
            !b4a.equals(writerKeyHasBeenRegistered, requesterAddress)
        ) {
            this.logger.error(OperationType.REMOVE_WRITER, "Writer key must be registered, match node's current key, and belong to the requester.", node.from.key)
            return null;
        }

        // Charging fee from the requester
        const requesterBalance = toBalance(decodedNodeEntry.balance);
        if (requesterBalance === null) {
            this.logger.error(OperationType.REMOVE_WRITER, "Invalid requester balance.", node.from.key)
            return null;
        };

        if (!requesterBalance.greaterThanOrEquals(BALANCE_FEE)) {
            this.logger.error(OperationType.REMOVE_WRITER, "Insufficient requester balance.", node.from.key)
            return Status.IGNORE;
        };

        const updatedBalance = requesterBalance.sub(BALANCE_FEE);
        if (updatedBalance === null) {
            this.logger.error(OperationType.REMOVE_WRITER, "Failed to apply fee to requester balance.", node.from.key)
            return null;
        };

        // Downgrade role from WRITER to WHITELISTED and deduct the fee from the requester's balance
        const updatedNodeEntry = nodeEntryUtils.setRole(requesterNodeEntry, nodeRoleUtils.NodeRole.WHITELISTED);
        if (updatedNodeEntry === null) {
            this.logger.error(OperationType.REMOVE_WRITER, "Failed to update node entry role.", node.from.key)
            return null;
        };
        const chargedNodeEntry = updatedBalance.update(updatedNodeEntry);
        if (chargedNodeEntry === null) {
            this.logger.error(OperationType.REMOVE_WRITER, "Failed to update node balance.", node.from.key)
            return null;
        };

        // Validator reward logic 
        const decodedValidatorEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (decodedValidatorEntry === null) {
            this.logger.error(OperationType.REMOVE_WRITER, "Failed to decode validator node entry.", node.from.key)
            return null;
        };

        const validatorBalance = toBalance(decodedValidatorEntry.balance)
        if (validatorBalance === null) {
            this.logger.error(OperationType.REMOVE_WRITER, "Invalid validator balance.", node.from.key)
            return null;
        };

        const validatorNewBalance = validatorBalance.add(BALANCE_FEE.percentage(PERCENT_75))
        if (validatorNewBalance === null) {
            this.logger.error(OperationType.REMOVE_WRITER, "Failed to transfer fee to validator balance.", node.from.key)
            return null;
        };

        const updateValidatorEntry = validatorNewBalance.update(validatorEntryBuffer)
        if (updateValidatorEntry === null) {
            this.logger.error(OperationType.REMOVE_WRITER, "Failed to update validator balance.", node.from.key)
            return null;
        };

        const finalRequesterNodeEntry = this.withdrawStakedBalance(chargedNodeEntry, node);
        if (finalRequesterNodeEntry === null) {
            this.logger.error(OperationType.REMOVE_WRITER, "Failed to unstake balance for writer.", node.from.key)
            return null;
        };

        // Remove the writer role and update the state
        await base.removeWriter(decodedNodeEntry.wk);
        await batch.put(requesterAddressString, finalRequesterNodeEntry);

        // Reward the validator
        await batch.put(validatorAddressString, updateValidatorEntry);
        await batch.put(txHashHexString, node.value);

        if (this.#config.enableTxApplyLogs) {
            console.info(`Writer removed: addr:wk:tx - ${requesterAddressString}:${op.rao.iw.toString('hex')}:${txHashHexString}`);
        }

        this.emitEvent(CustomEventType.UNWRITABLE, tracCryptoApi.address.decodeSafe(requesterAddressString))
    }

    canHandle(operation) {
        return operation.type === OperationType.REMOVE_WRITER;
    }

    async performOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateRoleAccessOperation(op)) {
            this.logger.error(OperationType.REMOVE_WRITER, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.rao, "vs") || !Object.hasOwn(op.rao, "va") || !Object.hasOwn(op.rao, "vn")) {
            this.logger.error(OperationType.REMOVE_WRITER, "Operation is not complete.", node.from.key)
            return Status.FAILURE;
        };

        // for additional security, nonces should be different.
        if (b4a.equals(op.rao.in, op.rao.vn)) {
            this.logger.error(OperationType.REMOVE_WRITER, "Nonces should not be the same.", node.from.key)
            return Status.FAILURE;
        };

        // addresses should be different.
        if (b4a.equals(op.address, op.rao.va)) {
            this.logger.error(OperationType.REMOVE_WRITER, "Addresses should be different.", node.from.key)
            return Status.FAILURE;
        };

        // signatures should be different.
        if (b4a.equals(op.rao.is, op.rao.vs)) {
            this.logger.error(OperationType.REMOVE_WRITER, "Signatures should be different.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the network address
        const requesterAddress = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddress, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.logger.error(OperationType.REMOVE_WRITER, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate requester public key
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.logger.error(OperationType.REMOVE_WRITER, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // verify requester signature
        const requesterMessage = createMessage(
            this.#config.networkId,
            op.rao.txv,
            op.rao.iw,
            op.rao.in,
            OperationType.REMOVE_WRITER
        );
        if (requesterMessage.length === 0) {
            this.logger.error(OperationType.REMOVE_WRITER, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        // compare hashes
        const hash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(hash, op.rao.tx)) {
            this.logger.error(OperationType.REMOVE_WRITER, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isRequesterMessageVerifed = tracCryptoApi.signature.verify(op.rao.is, op.rao.tx, requesterPublicKey);
        const txHashHexString = op.rao.tx.toString('hex');
        if (!isRequesterMessageVerifed) {
            this.logger.error(OperationType.REMOVE_WRITER, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify validator signature
        const validatorAddress = op.rao.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddress, this.#config.addressPrefix);
        if (validatorAddressString === null) {
            this.logger.error(OperationType.REMOVE_WRITER, "Failed to verify validator address.", node.from.key)
            return Status.FAILURE;
        };

        // validate validator public key
        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this.logger.error(OperationType.REMOVE_WRITER, "Failed to decode validator public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate validator message
        const validatorMessage = createMessage(
            this.#config.networkId,
            op.rao.tx,
            op.rao.vn,
            OperationType.REMOVE_WRITER
        );
        if (validatorMessage.length === 0) {
            this.logger.error(OperationType.REMOVE_WRITER, "Invalid validator message.", node.from.key)
            return Status.FAILURE;
        };

        const validatorHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);
        const isValidatorMessageVerifed = tracCryptoApi.signature.verify(op.rao.vs, validatorHash, validatorPublicKey);
        if (!isValidatorMessageVerifed) {
            this.logger.error(OperationType.REMOVE_WRITER, "Failed to verify validator message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repo.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.logger.error(OperationType.REMOVE_WRITER, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.rao.txv, indexersSequenceState)) {
            this.logger.error(OperationType.REMOVE_WRITER, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        const validatorEntryBuffer = await this.#repo.getEntry(validatorAddressString, batch);

        // Validator consistency checks
        const isValidatorValid = await this.isValidatorValid(validatorEntryBuffer, node, op);
        if (!isValidatorValid) {
            this.logger.error(OperationType.REMOVE_WRITER, "Validator consistency check failed.", node.from.key)
            return Status.FAILURE;
        };

        // anti-replay attack
        const opEntry = await this.#repo.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.logger.error(OperationType.REMOVE_WRITER, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        };

        // Proceed to remove the writer role from the node
        const removeWriterResult = await this.#removeWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddress, validatorAddressString, validatorEntryBuffer);
        if (removeWriterResult === null) {
            this.logger.error(OperationType.REMOVE_WRITER, "Failed to remove writer.", node.from.key)
            return Status.FAILURE;
        }

        if (removeWriterResult === Status.IGNORE) {
            this.logger.error(OperationType.REMOVE_WRITER, "Remove writer operation ignored.", node.from.key)
            return Status.IGNORE;
        }

        return Status.SUCCESS;
    }


}

export default RemoveWriterHandler;
