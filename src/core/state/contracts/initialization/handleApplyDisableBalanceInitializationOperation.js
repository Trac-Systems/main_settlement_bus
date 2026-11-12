import b4a from 'b4a';
import { EntryType, OperationType } from '../../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { createMessage, NULL_BUFFER, safeWriteUInt32BE } from '../../../../utils/buffer.js';
import addressUtils from '../../utils/address.js';
import adminEntryUtils from '../../utils/adminEntry.js';
import { Status } from '../../utils/transaction.js';

export const handleApplyDisableBalanceInitializationOperation = baseState => class extends baseState {

    async _handleApplyDisableBalanceInitializationOperation(op, view, base, node, batch) {
        if (!this._stateValidationSchema.validateCoreAdminOperation(op)) {
            this._safeLogApply(OperationType.DISABLE_INITIALIZATION, "Schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // Entry has been disabled so there is nothing to do
        if (await this._isApplyInitalizationDisabled(batch)) {
            this._safeLogApply(OperationType.DISABLE_INITIALIZATION, "Balance initialization already disabled.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the network address
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer, this._config.addressPrefix);
        if (adminAddressString === null) {
            this._safeLogApply(OperationType.DISABLE_INITIALIZATION, "Failed to validate requester address.", node.from.key)
            return Status.FAILURE;
        };

        // Validate requester admin public key
        const requesterAdminPublicKey = tracCryptoApi.address.decodeSafe(adminAddressString);
        if (b4a.equals(requesterAdminPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.DISABLE_INITIALIZATION, "Failed to decode requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // Ensure that an admin invoked this operation
        const adminEntry = await this._getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this._config.addressPrefix);

        if (decodedAdminEntry === null) {
            this._safeLogApply(OperationType.DISABLE_INITIALIZATION, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        }

        if (!this._isAdminApply(decodedAdminEntry, node)) {
            this._safeLogApply(OperationType.DISABLE_INITIALIZATION, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        };

        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.DISABLE_INITIALIZATION, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        };

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterAdminPublicKey)) {
            this._safeLogApply(OperationType.DISABLE_INITIALIZATION, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        };

        // Recreate requester message
        const message = createMessage(
            this._config.networkId,
            op.cao.txv,
            op.cao.iw,
            op.cao.in,
            OperationType.DISABLE_INITIALIZATION
        );
        if (message.length === 0) {
            this._safeLogApply(OperationType.DISABLE_INITIALIZATION, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(message);
        const txHashHexString = op.cao.tx.toString('hex');
        if (!b4a.equals(hash, op.cao.tx)) {
            this._safeLogApply(OperationType.DISABLE_INITIALIZATION, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        // Verify signature
        const isMessageVerified = tracCryptoApi.signature.verify(op.cao.is, hash, adminPublicKey);
        if (!isMessageVerified) {
            this._safeLogApply(OperationType.DISABLE_INITIALIZATION, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // Verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this._safeLogApply(OperationType.DISABLE_INITIALIZATION, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.cao.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.DISABLE_INITIALIZATION, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // Check if the operation has already been applied
        const opEntry = await this._getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this._safeLogApply(OperationType.DISABLE_INITIALIZATION, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        await batch.put(EntryType.INITIALIZATION, safeWriteUInt32BE(0));
        await batch.put(txHashHexString, node.value);

        return Status.SUCCESS;
    }
};
