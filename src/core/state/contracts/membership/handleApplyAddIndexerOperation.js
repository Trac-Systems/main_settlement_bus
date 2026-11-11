import b4a from 'b4a';
import { CustomEventType, EntryType, OperationType } from '../../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { createMessage, NULL_BUFFER } from '../../../../utils/buffer.js';
import addressUtils from '../../utils/address.js';
import adminEntryUtils from '../../utils/adminEntry.js';
import nodeEntryUtils from '../../utils/nodeEntry.js';
import nodeRoleUtils from '../../utils/roles.js';
import transactionUtils, { Status } from '../../utils/transaction.js';
import { toBalance } from '../../utils/balance.js';

export const handleApplyAddIndexerOperation = baseState => class extends baseState {

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
};
