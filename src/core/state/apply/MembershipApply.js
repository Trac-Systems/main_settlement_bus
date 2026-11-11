import b4a from 'b4a';
import { CustomEventType, EntryType, OperationType } from '../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { createMessage, NULL_BUFFER, ZERO_WK } from '../../../utils/buffer.js';
import addressUtils from '../utils/address.js';
import adminEntryUtils from '../utils/adminEntry.js';
import nodeEntryUtils from '../utils/nodeEntry.js';
import nodeRoleUtils from '../utils/roles.js';
import transactionUtils, { Status } from '../utils/transaction.js';
import { BALANCE_FEE, PERCENT_75, toBalance } from '../utils/balance.js';

export const withMembershipApply = Base => class extends Base {

    async _handleApplyAddWriterOperation(op, view, base, node, batch) {
        if (!this._stateValidationSchema.validateRoleAccessOperation(op)) {
            this._safeLogApply(OperationType.ADD_WRITER, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.rao, "vs") || !Object.hasOwn(op.rao, "va") || !Object.hasOwn(op.rao, "vn")) {
            this._safeLogApply(OperationType.ADD_WRITER, "Operation is not complete.", node.from.key)
            return Status.FAILURE;
        };

        // for additional security, nonces should be different.
        if (b4a.equals(op.rao.in, op.rao.vn)) {
            this._safeLogApply(OperationType.ADD_WRITER, "Nonces should not be the same.", node.from.key)
            return Status.FAILURE;
        };

        // addresses should be different.
        if (b4a.equals(op.address, op.rao.va)) {
            this._safeLogApply(OperationType.ADD_WRITER, "Addresses should be different.", node.from.key)
            return Status.FAILURE;
        };

        // signatures should be different.
        if (b4a.equals(op.rao.is, op.rao.vs)) {
            this._safeLogApply(OperationType.ADD_WRITER, "Signatures should be different.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester address
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this._config.addressPrefix);
        if (requesterAddressString === null) {
            this._safeLogApply(OperationType.ADD_WRITER, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.ADD_WRITER, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // if node want to register ZERO_WK, then this is NOT ALLOWED
        if (b4a.equals(op.rao.iw, ZERO_WK)) {
            this._safeLogApply(OperationType.ADD_WRITER, "Writer cannot initialize with zero-writer-key.", node.from.key)
            return Status.FAILURE;
        };

        // verify requester signature
        const requesterMessage = createMessage(
            this._config.networkId,
            op.rao.txv,
            op.rao.iw,
            op.rao.in,
            OperationType.ADD_WRITER
        );

        if (requesterMessage.length === 0) {
            this._safeLogApply(OperationType.ADD_WRITER, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(hash, op.rao.tx)) {
            this._safeLogApply(OperationType.ADD_WRITER, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isRequesterMessageVerifed = tracCryptoApi.signature.verify(op.rao.is, op.rao.tx, requesterPublicKey);
        const txHashHexString = op.rao.tx.toString('hex');
        if (!isRequesterMessageVerifed) {
            this._safeLogApply(OperationType.ADD_WRITER, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify validator signature
        const validatorAddress = op.rao.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddress, this._config.addressPrefix);
        if (validatorAddressString === null) {
            this._safeLogApply(OperationType.ADD_WRITER, "Failed to validate validator address.", node.from.key)
            return Status.FAILURE;
        };

        // validate validator public key
        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.ADD_WRITER, "Failed to decode validator public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate validator message
        const validatorMessage = createMessage(
            this._config.networkId,
            op.rao.tx,
            op.rao.vn,
            OperationType.ADD_WRITER
        );

        if (validatorMessage.length === 0) {
            this._safeLogApply(OperationType.ADD_WRITER, "Invalid validator message.", node.from.key)
            return Status.FAILURE;
        };

        const validatorHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);
        const isValidatorMessageVerifed = tracCryptoApi.signature.verify(op.rao.vs, validatorHash, validatorPublicKey);
        if (!isValidatorMessageVerifed) {
            this._safeLogApply(OperationType.ADD_WRITER, "Failed to verify validator message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this._safeLogApply(OperationType.ADD_WRITER, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.rao.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.ADD_WRITER, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        const validatorEntryBuffer = await this._getEntryApply(validatorAddressString, batch);

        // Validator consistency checks
        const isValidatorValid = await this._isValidatorValidApply(validatorEntryBuffer, node, op);
        if (!isValidatorValid) {
            this._safeLogApply(OperationType.ADD_WRITER, "Validator consistency check failed.", node.from.key)
            return Status.FAILURE;
        }

        // anti-replay attack
        const opEntry = await this._getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this._safeLogApply(OperationType.ADD_WRITER, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        };

        const addWriterResult = await this._addWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddressBuffer, validatorAddressString, validatorEntryBuffer);
        if (addWriterResult === null) {
            this._safeLogApply(OperationType.ADD_WRITER, "Failed to add writer.", node.from.key)
            return Status.FAILURE;
        }

        if (addWriterResult === Status.IGNORE) {
            this._safeLogApply(OperationType.ADD_WRITER, "Add writer operation ignored.", node.from.key)
            return Status.IGNORE;
        }
        return Status.SUCCESS;
    }

    async _addWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddressBuffer, validatorAddressString, validatorEntryBuffer) {
        // Retrieve the node entry for the given address, if null then do not process...
        const requesterNodeEntry = await this._getEntryApply(requesterAddressString, batch);
        if (requesterNodeEntry === null) {
            this._safeLogApply(OperationType.ADD_WRITER, "Failed to verify requester node address.", node.from.key)
            return null;
        };

        const decodedRequesterNodeEntry = nodeEntryUtils.decode(requesterNodeEntry)
        if (decodedRequesterNodeEntry === null) {
            this._safeLogApply(OperationType.ADD_WRITER, "Failed to decode node entry.", node.from.key)
            return null;
        };

        /*
            Writer Key Validation Cases:

            Case 1: New Writing Key (writerKeyHasBeenRegistered === null)
            - If the key has never been registered before
            - System will register this new key and link it to the requester's address
            - Always allowed as long as other conditions are met (whitelisting, balance, etc.)

            Case 2: Previously Used Key (writerKeyHasBeenRegistered !== null)
            Two conditions must be met:
            a) Key Match (isCurrentWk):
                - The key must be the same as currently assigned in node's entry
                - Prevents using different keys than what's assigned

            b) Ownership (isOwner):
                - The requester must be the original owner of this key
                - Enables re-staking after being downgraded to reader
                - Prevents key usage by non-owners

            This validation ensures:
            1. Only legitimate new keys are registered
            2. Downgraded nodes can re-stake using their original keys
            3. Keys cannot be reused by different addresses
         */

        const writerKeyHasBeenRegistered = await this._getRegisteredWriterKeyApply(batch, op.rao.iw.toString('hex'))
        if (writerKeyHasBeenRegistered !== null) {
            const isCurrentWk = b4a.equals(decodedRequesterNodeEntry.wk, op.rao.iw);
            const isOwner = b4a.equals(writerKeyHasBeenRegistered, requesterAddressBuffer);

            if (!isCurrentWk || !isOwner) {
                this._safeLogApply(OperationType.ADD_WRITER, "Invalid writer key: either not owned by requester or different from assigned key.", node.from.key)
                return null;
            }
        }

        const isWhitelisted = decodedRequesterNodeEntry.isWhitelisted
        const isWriter = decodedRequesterNodeEntry.isWriter;
        const isIndexer = decodedRequesterNodeEntry.isIndexer;

        // To become a writer the node must be whitelisted and not already a writer or indexer
        if (isIndexer || isWriter || !isWhitelisted) {
            this._safeLogApply(OperationType.ADD_WRITER, "Node must be whitelisted, and cannot be a writer or an indexer.", node.from.key)
            return null;
        };

        // Charging fee from the requester
        const requesterBalance = toBalance(decodedRequesterNodeEntry.balance)
        if (requesterBalance === null) {
            this._safeLogApply(OperationType.ADD_WRITER, "Invalid requester balance.", node.from.key)
            return null;
        };

        if (!requesterBalance.greaterThanOrEquals(BALANCE_FEE)) {
            this._safeLogApply(OperationType.ADD_WRITER, "Insufficient requester balance.", node.from.key)
            return Status.IGNORE;
        };

        const updatedBalance = requesterBalance.sub(BALANCE_FEE) // Remove the fee
        if (updatedBalance === null) {
            this._safeLogApply(OperationType.ADD_WRITER, "Failed to apply fee to requester balance.", node.from.key)
            return null;
        };

        // Update the node entry to assign the writer role and deduct the fee from the requester's balance
        const updatedRoleRequesterNodeEntry = nodeEntryUtils.setRoleAndWriterKey(requesterNodeEntry, nodeRoleUtils.NodeRole.WRITER, op.rao.iw);
        if (updatedRoleRequesterNodeEntry === null) {
            this._safeLogApply(OperationType.ADD_WRITER, "Failed to update node entry with a writer role.", node.from.key)
            return null;
        };

        const chargedFeeRequesterNodeEntry = updatedBalance.update(updatedRoleRequesterNodeEntry)
        if (chargedFeeRequesterNodeEntry === null) {
            this._safeLogApply(OperationType.ADD_WRITER, "Failed to update node balance.", node.from.key)
            return null;
        };

        // reward the validator

        const decodedValidatorEntry = nodeEntryUtils.decode(validatorEntryBuffer)
        if (decodedValidatorEntry === null) {
            this._safeLogApply(OperationType.ADD_WRITER, "Failed to decode validator entry.", node.from.key)
            return null;
        };

        const validatorBalance = toBalance(decodedValidatorEntry.balance)
        if (validatorBalance === null) {
            this._safeLogApply(OperationType.ADD_WRITER, "Invalid validator balance.", node.from.key)
            return null;
        };

        const updatedValidatorBalance = validatorBalance.add(BALANCE_FEE.percentage(PERCENT_75))
        if (updatedValidatorBalance === null) {
            this._safeLogApply(OperationType.ADD_WRITER, "Failed to transfer fee to validator.", node.from.key)
            return null;
        };

        const updatedValidatorEntry = updatedValidatorBalance.update(validatorEntryBuffer)
        if (updatedValidatorEntry === null) {
            this._safeLogApply(OperationType.ADD_WRITER, "Failed to update validator entry.", node.from.key)
            return null;
        };

        const finalRequesterNodeEntry = this._stakeBalanceApply(chargedFeeRequesterNodeEntry, node);
        if (finalRequesterNodeEntry === null) {
            this._safeLogApply(OperationType.ADD_WRITER, "Failed to stake balance for writer.", node.from.key)
            return null;
        };

        // Add the writer role to the base and update the batch
        await base.addWriter(op.rao.iw, { isIndexer: false });
        await batch.put(requesterAddressString, finalRequesterNodeEntry);

        if (writerKeyHasBeenRegistered === null) {
            await batch.put(EntryType.WRITER_ADDRESS + op.rao.iw.toString('hex'), op.address);
        }

        const { length, incrementedLength } = await this._updateWritersIndex(batch);

        if (length !== null && incrementedLength !== null) {
            // Update the writers index and length entries
            await batch.put(EntryType.WRITERS_INDEX + length, requesterAddressBuffer);
            await batch.put(EntryType.WRITERS_LENGTH, incrementedLength);
        } else {
            // This log should (if this error ever happend) ALWAYS log.
            this._safeLogApply("SYSTEM ERROR", "Something went wrong while updating writers index.", node.from.key)
        }

        // Pay the fee to the validator
        await batch.put(validatorAddressString, updatedValidatorEntry);
        await batch.put(txHashHexString, node.value);

        if (this._config.enableTxApplyLogs) {
            console.info(`Writer has been added addr:wk:tx - ${requesterAddressString}:${op.rao.iw.toString('hex')}:${txHashHexString}`);
        }
    }

    async _handleApplyRemoveWriterOperation(op, view, base, node, batch) {
        if (!this._stateValidationSchema.validateRoleAccessOperation(op)) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.rao, "vs") || !Object.hasOwn(op.rao, "va") || !Object.hasOwn(op.rao, "vn")) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Operation is not complete.", node.from.key)
            return Status.FAILURE;
        };

        // for additional security, nonces should be different.
        if (b4a.equals(op.rao.in, op.rao.vn)) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Nonces should not be the same.", node.from.key)
            return Status.FAILURE;
        };

        // addresses should be different.
        if (b4a.equals(op.address, op.rao.va)) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Addresses should be different.", node.from.key)
            return Status.FAILURE;
        };

        // signatures should be different.
        if (b4a.equals(op.rao.is, op.rao.vs)) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Signatures should be different.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the network address
        const requesterAddress = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddress, this._config.addressPrefix);
        if (requesterAddressString === null) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate requester public key
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // verify requester signature
        const requesterMessage = createMessage(
            this._config.networkId,
            op.rao.txv,
            op.rao.iw,
            op.rao.in,
            OperationType.REMOVE_WRITER
        );
        if (requesterMessage.length === 0) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        // compare hashes
        const hash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(hash, op.rao.tx)) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isRequesterMessageVerifed = tracCryptoApi.signature.verify(op.rao.is, op.rao.tx, requesterPublicKey);
        const txHashHexString = op.rao.tx.toString('hex');
        if (!isRequesterMessageVerifed) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify validator signature
        const validatorAddress = op.rao.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddress, this._config.addressPrefix);
        if (validatorAddressString === null) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Failed to verify validator address.", node.from.key)
            return Status.FAILURE;
        };

        // validate validator public key
        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Failed to decode validator public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate validator message
        const validatorMessage = createMessage(
            this._config.networkId,
            op.rao.tx,
            op.rao.vn,
            OperationType.REMOVE_WRITER
        );
        if (validatorMessage.length === 0) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Invalid validator message.", node.from.key)
            return Status.FAILURE;
        };

        const validatorHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);
        const isValidatorMessageVerifed = tracCryptoApi.signature.verify(op.rao.vs, validatorHash, validatorPublicKey);
        if (!isValidatorMessageVerifed) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Failed to verify validator message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.rao.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        const validatorEntryBuffer = await this._getEntryApply(validatorAddressString, batch);

        // Validator consistency checks
        const isValidatorValid = await this._isValidatorValidApply(validatorEntryBuffer, node, op);
        if (!isValidatorValid) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Validator consistency check failed.", node.from.key)
            return Status.FAILURE;
        };

        // anti-replay attack
        const opEntry = await this._getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        };

        // Proceed to remove the writer role from the node
        const removeWriterResult = await this._removeWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddress, validatorAddressString, validatorEntryBuffer);
        if (removeWriterResult === null) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Failed to remove writer.", node.from.key)
            return Status.FAILURE;
        }

        if (removeWriterResult === Status.IGNORE) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Remove writer operation ignored.", node.from.key)
            return Status.IGNORE;
        }

        return Status.SUCCESS;
    }

    async _removeWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddress, validatorAddressString, validatorEntryBuffer) {

        // Fetch the node entry for the given address
        const requesterNodeEntry = await this._getEntryApply(requesterAddressString, batch);
        if (requesterNodeEntry === null) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Failed to verify requester node entry.", node.from.key)
            return null;
        };

        const decodedNodeEntry = nodeEntryUtils.decode(requesterNodeEntry);
        if (decodedNodeEntry === null) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Failed to decode requester node entry.", node.from.key)
            return null;
        };

        // Check if the node is a writer or an indexer
        const isNodeWriter = decodedNodeEntry.isWriter;
        const isNodeIndexer = decodedNodeEntry.isIndexer;

        if (isNodeIndexer || !isNodeWriter) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Node has to be a writer, and cannot be an indexer.", node.from.key)
            return null;
        };

        /**
         * Ensure that:
         * 1) writer key exists in registry (we can not unregister something that was not registered),
         * 2) matches the one in node entry ,
         * 3) belongs to the requester - this prevents unauthorized key removal
         */
        const writerKeyHasBeenRegistered = await this._getRegisteredWriterKeyApply(batch, op.rao.iw.toString('hex'))
        if (writerKeyHasBeenRegistered === null ||
            !b4a.equals(op.rao.iw, decodedNodeEntry.wk) ||
            !b4a.equals(writerKeyHasBeenRegistered, requesterAddress)
        ) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Writer key must be registered, match node's current key, and belong to the requester.", node.from.key)
            return null;
        }

        // Charging fee from the requester
        const requesterBalance = toBalance(decodedNodeEntry.balance);
        if (requesterBalance === null) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Invalid requester balance.", node.from.key)
            return null;
        };

        if (!requesterBalance.greaterThanOrEquals(BALANCE_FEE)) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Insufficient requester balance.", node.from.key)
            return Status.IGNORE;
        };

        const updatedBalance = requesterBalance.sub(BALANCE_FEE);
        if (updatedBalance === null) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Failed to apply fee to requester balance.", node.from.key)
            return null;
        };

        // Downgrade role from WRITER to WHITELISTED and deduct the fee from the requester's balance
        const updatedNodeEntry = nodeEntryUtils.setRole(requesterNodeEntry, nodeRoleUtils.NodeRole.WHITELISTED);
        if (updatedNodeEntry === null) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Failed to update node entry role.", node.from.key)
            return null;
        };
        const chargedNodeEntry = updatedBalance.update(updatedNodeEntry);
        if (chargedNodeEntry === null) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Failed to update node balance.", node.from.key)
            return null;
        };

        // Validator reward logic
        const decodedValidatorEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (decodedValidatorEntry === null) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Failed to decode validator node entry.", node.from.key)
            return null;
        };

        const validatorBalance = toBalance(decodedValidatorEntry.balance)
        if (validatorBalance === null) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Invalid validator balance.", node.from.key)
            return null;
        };

        const validatorNewBalance = validatorBalance.add(BALANCE_FEE.percentage(PERCENT_75))
        if (validatorNewBalance === null) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Failed to transfer fee to validator balance.", node.from.key)
            return null;
        };

        const updateValidatorEntry = validatorNewBalance.update(validatorEntryBuffer)
        if (updateValidatorEntry === null) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Failed to update validator balance.", node.from.key)
            return null;
        };

        const finalRequesterNodeEntry = this._withdrawStakedBalanceApply(chargedNodeEntry, node);
        if (finalRequesterNodeEntry === null) {
            this._safeLogApply(OperationType.REMOVE_WRITER, "Failed to unstake balance for writer.", node.from.key)
            return null;
        };

        // Remove the writer role and update the state
        await base.removeWriter(decodedNodeEntry.wk);
        await batch.put(requesterAddressString, finalRequesterNodeEntry);

        // Reward the validator
        await batch.put(validatorAddressString, updateValidatorEntry);
        await batch.put(txHashHexString, node.value);

        if (this._config.enableTxApplyLogs) {
            console.info(`Writer removed: addr:wk:tx - ${requesterAddressString}:${op.rao.iw.toString('hex')}:${txHashHexString}`);
        }

        this._emitEvent(CustomEventType.UNWRITABLE, tracCryptoApi.address.decodeSafe(requesterAddressString))
    }

    async _handleApplyAddIndexerOperation(op, view, base, node, batch) {
        if (!this._stateValidationSchema.validateAdminControlOperation(op)) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester address (admin)
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this._config.addressPrefix);
        if (requesterAddressString === null) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate requester public key
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate pretending indexer address
        const pretendingAddressBuffer = op.aco.ia;
        const pretendingAddressString = addressUtils.bufferToAddress(pretendingAddressBuffer, this._config.addressPrefix);
        if (pretendingAddressString === null) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Pretending indexer address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate pretending indexer public key
        const pretentingPublicKey = tracCryptoApi.address.decodeSafe(pretendingAddressString);
        if (b4a.equals(pretentingPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Failed to decode pretending indexer public key.", node.from.key)
            return Status.FAILURE;
        };

        // ensure that an admin invoked this operation
        const adminEntry = await this._getEntryApply(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        };

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this._config.addressPrefix);
        if (decodedAdminEntry === null) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        };

        if (!this._isAdminApply(decodedAdminEntry, node)) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        };

        // Extract admin public key
        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        };

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterPublicKey)) {
            this._safeLogApply(OperationType.ADD_INDEXER, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        };

        // verify requester signature
        const message = createMessage(
            this._config.networkId,
            op.aco.txv,
            op.aco.ia,
            op.aco.in,
            OperationType.ADD_INDEXER
        );

        if (message.length === 0) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(hash, op.aco.tx)) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isMessageVerified = tracCryptoApi.signature.verify(op.aco.is, hash, adminPublicKey);
        const txHashHexString = hash.toString('hex');
        if (!isMessageVerified) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.aco.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // anti-replay attack
        const opEntry = await this._getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        const addIndexerResult = await this._addIndexer(op, node, batch, base, txHashHexString, pretendingAddressString, requesterAddressString);
        if (addIndexerResult === null) {
            return Status.FAILURE;
        }

        return Status.SUCCESS;
    }

    async _addIndexer(op, node, batch, base, txHashHexString, pretendingAddressString, requesterAddressString) {

        const pretenderNodeEntry = await this._getEntryApply(pretendingAddressString, batch);
        if (pretenderNodeEntry === null) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Failed to verify target indexer entry.", node.from.key)
            return null;
        };

        const decodedPretenderNodeEntry = nodeEntryUtils.decode(pretenderNodeEntry);
        if (decodedPretenderNodeEntry === null) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Failed to decode pretender indexer node entry.", node.from.key)
            return null;
        };

        //check if node is allowed to become an indexer
        const isNodeWriter = nodeEntryUtils.isWriter(pretenderNodeEntry);
        const isNodeIndexer = nodeEntryUtils.isIndexer(pretenderNodeEntry);
        if (!isNodeWriter || isNodeIndexer) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Node must be a writer, and cannot already be an indexer.", node.from.key)
            return null;
        };

        //update node entry to indexer
        const updatedNodeEntry = nodeEntryUtils.setRole(pretenderNodeEntry, nodeRoleUtils.NodeRole.INDEXER)
        if (updatedNodeEntry === null) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Failed to update node role.", node.from.key)
            return null;
        };

        // ensure that the node wk does not exist in the indexer list
        const indexerListHasWk = await this._isWriterKeyInIndexerListApply(decodedPretenderNodeEntry.wk, base);
        if (indexerListHasWk) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Writer key already exists in indexer list.", node.from.key)
            return null;
        }; // Wk is already in indexer list (Node already indexer)

        // charge fee from the admin (requester)
        const feeAmount = toBalance(transactionUtils.FEE);
        if (feeAmount === null) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Invalid fee amount.", node.from.key)
            return null;
        };

        const adminNodeEntryBuffer = await this._getEntryApply(requesterAddressString, batch);
        if (adminNodeEntryBuffer === null) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Invalid requester node entry buffer.", node.from.key)
            return null;
        };

        const adminNodeEntry = nodeEntryUtils.decode(adminNodeEntryBuffer);
        if (adminNodeEntry === null) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Failed to decode requester node entry.", node.from.key)
            return null;
        };

        const adminBalance = toBalance(adminNodeEntry.balance);
        if (adminBalance === null) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Invalid admin balance.", node.from.key)
            return null;
        };

        if (!adminBalance.greaterThanOrEquals(feeAmount)) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Insufficient requester balance.", node.from.key)
            return null;
        };

        // 100% fee charged from admin will be burned
        const newAdminBalance = adminBalance.sub(feeAmount);
        if (newAdminBalance === null) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Failed to apply fee to requester balance.", node.from.key)
            return null;
        };

        const updatedAdminNodeEntry = newAdminBalance.update(adminNodeEntryBuffer);
        if (updatedAdminNodeEntry === null) {
            this._safeLogApply(OperationType.ADD_INDEXER, "Failed to update requester node.", node.from.key)
            return null;
        };

        // set indexer role
        await base.removeWriter(decodedPretenderNodeEntry.wk);
        await base.addWriter(decodedPretenderNodeEntry.wk, { indexer: true })

        // change node entry to indexer and update admin balance after fee deduction
        await batch.put(pretendingAddressString, updatedNodeEntry);
        await batch.put(requesterAddressString, updatedAdminNodeEntry);

        // store operation hash to avoid replay attack.
        await batch.put(txHashHexString, node.value);

        if (this._config.enableTxApplyLogs) {
            console.info(`Indexer added addr:wk:tx - ${pretendingAddressString}:${decodedPretenderNodeEntry.wk.toString('hex')}:${txHashHexString}`);
        }

        this._emitEvent(CustomEventType.IS_INDEXER, tracCryptoApi.address.decodeSafe(pretendingAddressString))
    }

    async _handleApplyRemoveIndexerOperation(op, view, base, node, batch) {
        if (!this._stateValidationSchema.validateAdminControlOperation(op)) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester address (admin)
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this._config.addressPrefix);
        if (requesterAddressString === null) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate requester public key (admin)
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate pretending indexer address
        const toRemoveAddressBuffer = op.aco.ia;
        const toRemoveAddressString = addressUtils.bufferToAddress(toRemoveAddressBuffer, this._config.addressPrefix);
        if (toRemoveAddressString === null) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Target indexer address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        const toRemoveAddressPublicKey = tracCryptoApi.address.decodeSafe(toRemoveAddressString);
        if (b4a.equals(toRemoveAddressPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Failed to decode target indexer public key.", node.from.key)
            return Status.FAILURE;
        };

        // ensure that an admin invoked this operation
        const adminEntry = await this._getEntryApply(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        };

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this._config.addressPrefix);
        if (decodedAdminEntry === null) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        };

        if (!this._isAdminApply(decodedAdminEntry, node)) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        };

        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(requesterPublicKey, adminPublicKey)) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        };

        // verify requester signature
        const message = createMessage(
            this._config.networkId,
            op.aco.txv,
            op.aco.ia,
            op.aco.in,
            OperationType.REMOVE_INDEXER
        );

        if (message.length === 0) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };
        // compare hashes
        const hash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(hash, op.aco.tx)) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isMessageVerified = tracCryptoApi.signature.verify(op.aco.is, hash, adminPublicKey);
        const txHashHexString = hash.toString('hex');
        if (!isMessageVerified) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.aco.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // anti-replay attack
        const opEntry = await this._getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        const removeIndexerResult = await this._removeIndexer(op, node, batch, base, txHashHexString, toRemoveAddressString, toRemoveAddressBuffer, requesterAddressString);
        if (removeIndexerResult === null) {
            return Status.FAILURE;
        };
        return Status.SUCCESS;
    }

    async _removeIndexer(op, node, batch, base, txHashHexString, toRemoveAddressString, toRemoveAddressBuffer, requesterAddressString) {
        const toRemoveNodeEntry = await this._getEntryApply(toRemoveAddressString, batch);
        if (toRemoveNodeEntry === null) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Failed to verify target indexer entry.", node.from.key)
            return null;
        };

        const decodedNodeEntry = nodeEntryUtils.decode(toRemoveNodeEntry);
        if (decodedNodeEntry === null) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Failed to decode target indexer node entry.", node.from.key)
            return null;
        };

        // Check if the node entry is an indexer
        const isNodeIndexer = nodeEntryUtils.isIndexer(toRemoveNodeEntry);
        if (!isNodeIndexer) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Node must be an indexer.", node.from.key)
            return null;
        };

        //update node entry to writer
        const updatedNodeEntry = nodeEntryUtils.setRoleAndWriterKey(toRemoveNodeEntry, nodeRoleUtils.NodeRole.WRITER, decodedNodeEntry.wk)
        if (updatedNodeEntry === null) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Failed to update node role.", node.from.key)
            return null;
        };

        // Ensure that the node is an indexer
        const indexerListHasWk = await this._isWriterKeyInIndexerListApply(decodedNodeEntry.wk, base);
        if (!indexerListHasWk) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Writer key does not exist in indexer list.", node.from.key)
            return null;
        }; // Node is not an indexer.

        // Charging fee from the admin (requester)
        const adminNodeEntry = await this._getEntryApply(requesterAddressString, batch);
        if (adminNodeEntry === null) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Invalid requester node entry.", node.from.key)
            return null;
        };

        const decodedAdminNodeEntry = nodeEntryUtils.decode(adminNodeEntry)
        if (decodedAdminNodeEntry === null) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Failed to decode requester node entry.", node.from.key)
            return null;
        };

        const adminBalance = toBalance(decodedAdminNodeEntry.balance)
        if (adminBalance === null) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Invalid admin balance.", node.from.key)
            return null;
        };

        if (!adminBalance.greaterThanOrEquals(BALANCE_FEE)) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Insufficient requester balance.", node.from.key)
            return null;
        };

        // 100% fee will be burned
        const newAdminBalance = adminBalance.sub(BALANCE_FEE)
        if (newAdminBalance === null) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Failed to apply fee to requester balance.", node.from.key)
            return null;
        };

        const updatedAdminNodeEntry = newAdminBalance.update(adminNodeEntry)
        if (updatedAdminNodeEntry === null) {
            this._safeLogApply(OperationType.REMOVE_INDEXER, "Failed to update requester node.", node.from.key)
            return null;
        };

        // downgrade role to writer
        await base.removeWriter(decodedNodeEntry.wk);
        await base.addWriter(decodedNodeEntry.wk, { isIndexer: false });

        // update writers index and length
        const { length, incrementedLength } = await this._updateWritersIndex(batch);

        if (length !== null && incrementedLength !== null) {
            // Update the writers index and length entries
            await batch.put(EntryType.WRITERS_INDEX + length, toRemoveAddressBuffer);
            await batch.put(EntryType.WRITERS_LENGTH, incrementedLength);
        } else {
            // This log should (if this error ever happend) ALWAYS log.
            this._safeLogApply("SYSTEM ERROR", "Something went wrong while updating writers index.", node.from.key)
        }

        //update node entry and indexers entry
        await batch.put(toRemoveAddressString, updatedNodeEntry);

        // update requester (admin) entry after fee deduction
        await batch.put(requesterAddressString, updatedAdminNodeEntry);

        // store operation hash to avoid replay attack.
        await batch.put(txHashHexString, node.value);
        if (this._config.enableTxApplyLogs) {
            console.info(`Indexer has been removed addr:wk:tx - ${toRemoveAddressString}:${decodedNodeEntry.wk.toString('hex')}:${txHashHexString}`);
        }

        this._emitEvent(CustomEventType.IS_NON_INDEXER, tracCryptoApi.address.decodeSafe(toRemoveAddressString))
        return Status.SUCCESS;
    }
};
