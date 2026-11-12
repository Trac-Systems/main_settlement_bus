import b4a from 'b4a';
import { CustomEventType, EntryType, OperationType } from '../../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { createMessage, NULL_BUFFER } from '../../../../utils/buffer.js';
import addressUtils from '../../utils/address.js';
import adminEntryUtils from '../../utils/adminEntry.js';
import nodeEntryUtils from '../../utils/nodeEntry.js';
import nodeRoleUtils from '../../utils/roles.js';
import { Status } from '../../utils/transaction.js';
import { BALANCE_FEE, toBalance } from '../../utils/balance.js';

export const handleApplyRemoveIndexerOperation = baseState => class extends baseState {

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
