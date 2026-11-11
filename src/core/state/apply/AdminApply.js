import b4a from 'b4a';
import { ADMIN_INITIAL_BALANCE, ADMIN_INITIAL_STAKED_BALANCE, CustomEventType, EntryType, OperationType } from '../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { createMessage, NULL_BUFFER, safeWriteUInt32BE, ZERO_WK } from '../../../utils/buffer.js';
import addressUtils from '../utils/address.js';
import adminEntryUtils from '../utils/adminEntry.js';
import nodeEntryUtils, { setWritingKey } from '../utils/nodeEntry.js';
import nodeRoleUtils from '../utils/roles.js';
import transactionUtils, { Status } from '../utils/transaction.js';
import { BALANCE_FEE, PERCENT_75, toBalance } from '../utils/balance.js';

export const withAdminApply = Base => class extends Base {

    async _handleApplyInitializeBalanceOperation(op, view, base, node, batch) {
        if (!this._stateValidationSchema.validateBalanceInitialization(op)) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester network address
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer, this._config.addressPrefix);
        if (adminAddressString === null) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        }

        // Verify requester admin public key
        const requesterAdminPublicKey = tracCryptoApi.address.decodeSafe(adminAddressString);
        if (b4a.equals(requesterAdminPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // Validate recipient address
        const recipientAddress = op.bio.ia;
        const recipientAddressString = addressUtils.bufferToAddress(recipientAddress, this._config.addressPrefix);
        if (recipientAddressString === null) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Recipient address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate recipient public key
        const recipientPublicKey = tracCryptoApi.address.decodeSafe(recipientAddressString);
        if (b4a.equals(recipientPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Failed to decode recipient public key.", node.from.key)
            return Status.FAILURE;
        };

        // Verify that the amount is not zero
        const amount = toBalance(op.bio.am);
        if (amount === null) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Invalid balance.", node.from.key)
            return Status.FAILURE;
        };

        // Entry has been disabled so there is nothing to do
        if (await this._isApplyInitalizationDisabled(batch)) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Balance initialization is disabled.", node.from.key)
            return Status.FAILURE;
        };

        // Ensure that an admin invoked this operation
        const adminEntry = await this._getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this._config.addressPrefix);

        if (decodedAdminEntry === null) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        }

        if (!this._isAdminApply(decodedAdminEntry, node)) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        };

        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        };

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterAdminPublicKey)) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        }

        // Recreate requester message
        const message = createMessage(
            this._config.networkId,
            op.bio.txv,
            op.bio.ia,
            amount.value,
            op.bio.in,
            OperationType.BALANCE_INITIALIZATION
        );
        if (message.length === 0) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(message);
        const txHashHexString = op.bio.tx.toString('hex');
        if (!b4a.equals(hash, op.bio.tx)) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        // Verify signature
        const isMessageVerified = tracCryptoApi.signature.verify(op.bio.is, hash, adminPublicKey);
        if (!isMessageVerified) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // Verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.bio.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // Check if the operation has already been applied
        const opEntry = await this._getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        let nodeEntry = null;
        const incomingAddressNodeEntryBuffer = await this._getEntryApply(recipientAddressString, batch);

        if (incomingAddressNodeEntryBuffer === null) {
            nodeEntry = nodeEntryUtils.init(ZERO_WK, nodeRoleUtils.NodeRole.READER, amount.value)
            if (nodeEntry.length === 0) {
                this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Failed to initialize node entry.", node.from.key)
                return Status.FAILURE;
            }

        } else {
            nodeEntry = amount.update(incomingAddressNodeEntryBuffer)
            if (nodeEntry === null) {
                this._safeLogApply(OperationType.BALANCE_INITIALIZATION, "Failed to set node entry balance.", node.from.key)
                return Status.FAILURE;
            }
        };

        await batch.put(recipientAddressString, nodeEntry);
        await batch.put(txHashHexString, node.value);
        return Status.SUCCESS;
    }

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

    async _handleApplyAddAdminOperation(op, view, base, node, batch) {
        /*
            ADD ADMIN OPERATION INITIALIZES THE NETWORK. THIS OPERATION CAN BE PERFORMED ONLY ONCE, AND THE NETWORK CREATOR
            DOES NOT HAVE TO PAY A FEE IN THIS CASE. ATTENTION: IF ANY VALIDATOR ATTEMPTS THIS OPERATION AFTER THE NETWORK
            INITIALIZATION, THEIR STAKED BALANCE WILL BE REDUCED (PUNISHMENT).
        */

        if (!this._stateValidationSchema.validateCoreAdminOperation(op)) {
            this._safeLogApply(OperationType.ADD_ADMIN, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester address (admin)
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer, this._config.addressPrefix);
        if (adminAddressString === null) {
            this._safeLogApply(OperationType.ADD_ADMIN, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate requester admin public key (admin)
        const adminPublicKey = tracCryptoApi.address.decodeSafe(adminAddressString);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.ADD_ADMIN, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // Check if the operation is being performed by the bootstrap node - the original deployer of the Trac Network
        if (!b4a.equals(node.from.key, this._config.bootstrap) || !b4a.equals(op.cao.iw, this._config.bootstrap)) {
            this._safeLogApply(OperationType.ADD_ADMIN, "Node is not a bootstrap node.", node.from.key)
            return Status.FAILURE;
        };

        // recreate requester message
        const requesterMessage = createMessage(
            this._config.networkId,
            op.cao.txv,
            op.cao.iw,
            op.cao.in,
            OperationType.ADD_ADMIN
        );

        if (requesterMessage.length === 0) {
            this._safeLogApply(OperationType.ADD_ADMIN, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(hash, op.cao.tx)) {
            this._safeLogApply(OperationType.ADD_ADMIN, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        // verify signature
        const isMessageVerified = tracCryptoApi.signature.verify(op.cao.is, op.cao.tx, adminPublicKey)
        const txHashHexString = op.cao.tx.toString('hex');
        if (!isMessageVerified) {
            this._safeLogApply(OperationType.ADD_ADMIN, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this._safeLogApply(OperationType.ADD_ADMIN, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.cao.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.ADD_ADMIN, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // Operation will be performed only once, for consistency check verify that the writer key does not exist
        // writer key should NOT exists for a brand new admin
        const writerKeyHasBeenRegistered = await this._getRegisteredWriterKeyApply(batch, op.cao.iw.toString('hex'))
        if (writerKeyHasBeenRegistered !== null) {
            this._safeLogApply(OperationType.ADD_ADMIN, "Writer key already exists.", node.from.key)
            return Status.FAILURE;
        };

        const adminEntryExists = await this._getEntryApply(EntryType.ADMIN, batch);
        // if admin entry already exists, cannot perform this operation
        if (adminEntryExists !== null) {
            this._safeLogApply(OperationType.ADD_ADMIN, "Admin entry already exists.", node.from.key)
            return Status.FAILURE;
        };

        // Check if the operation has already been applied
        const opEntry = await this._getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this._safeLogApply(OperationType.ADD_ADMIN, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        const { newLicenseLength, decodedNewLicenseLength } = await this._applyAssignNewLicense(batch);
        if (newLicenseLength !== null && decodedNewLicenseLength) {
            await batch.put(EntryType.LICENSE_COUNT, newLicenseLength)
            await batch.put(EntryType.LICENSE_INDEX + decodedNewLicenseLength, adminAddressBuffer)
        } else {
            // This log should (if this error ever happend) ALWAYS log.
            this._safeLogApply("SYSTEM ERROR", "Something went wrong while updating license index.", node.from.key)
        }

        const initializedNodeEntry = nodeEntryUtils.init(op.cao.iw, nodeRoleUtils.NodeRole.INDEXER, ADMIN_INITIAL_BALANCE, newLicenseLength, ADMIN_INITIAL_STAKED_BALANCE);
        if (initializedNodeEntry.length === 0) {
            this._safeLogApply(OperationType.ADD_ADMIN, "Failed to initialize node entry.", node.from.key)
            return Status.FAILURE;
        }

        // Create a new admin entry
        const newAdminEntry = adminEntryUtils.encode(adminAddressBuffer, op.cao.iw, this._config.addressPrefix);
        if (newAdminEntry.length === 0) {
            this._safeLogApply(OperationType.ADD_ADMIN, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        await batch.put(adminAddressString, initializedNodeEntry);
        await batch.put(EntryType.WRITER_ADDRESS + op.cao.iw.toString('hex'), op.address);

        const { length, incrementedLength } = await this._updateWritersIndex(batch);

        if (length !== null && incrementedLength !== null) {
            // Update the writers index and length entries
            await batch.put(EntryType.WRITERS_INDEX + length, adminAddressBuffer);
            await batch.put(EntryType.WRITERS_LENGTH, incrementedLength);
        } else {
            // This log should (if this error ever happend) ALWAYS log.
            this._safeLogApply("SYSTEM ERROR", "Something went wrong while updating writers index.", node.from.key)
        }

        // initialize admin entry and initialization flag
        await batch.put(EntryType.ADMIN, newAdminEntry);
        await batch.put(EntryType.INITIALIZATION, safeWriteUInt32BE(1));
        await batch.put(txHashHexString, node.value);

        if (this._config.enableTxApplyLogs) {
            console.info(`Admin added addr:wk:tx - ${adminAddressString}:${op.cao.iw.toString('hex')}:${txHashHexString}`);
        }

        return Status.SUCCESS;
    }

    async _handleApplyAdminRecoveryOperation(op, view, base, node, batch) {
        if (!this._stateValidationSchema.validateRoleAccessOperation(op)) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.rao, "vs") || !Object.hasOwn(op.rao, "va") || !Object.hasOwn(op.rao, "vn")) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Operation is not complete.", node.from.key)
            return Status.FAILURE;
        };

        // for additional security, nonces should be different.
        if (b4a.equals(op.rao.in, op.rao.vn)) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Nonces should not be the same.", node.from.key)
            return Status.FAILURE;
        };

        // addresses should be different.
        if (b4a.equals(op.address, op.rao.va)) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Addresses should be different.", node.from.key)
            return Status.FAILURE;
        };

        // signatures should be different.
        if (b4a.equals(op.rao.is, op.rao.vs)) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Signatures should be different.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester address and pubkey
        const requesterAdminAddressBuffer = op.address;
        const requesterAdminAddressString = addressUtils.bufferToAddress(requesterAdminAddressBuffer, this._config.addressPrefix);
        if (requesterAdminAddressString === null) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        const requesterAdminPublicKey = tracCryptoApi.address.decodeSafe(requesterAdminAddressString);
        if (b4a.equals(requesterAdminPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate requester message
        const requesterMessage = createMessage(
            this._config.networkId,
            op.rao.txv,
            op.rao.iw,
            op.rao.in,
            OperationType.ADMIN_RECOVERY
        );

        if (requesterMessage.length === 0) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(hash, op.rao.tx)) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        // verify requester signature
        const isRequesterMessageVerifed = tracCryptoApi.signature.verify(op.rao.is, op.rao.tx, requesterAdminPublicKey);
        const txHashHexString = op.rao.tx.toString('hex');
        if (!isRequesterMessageVerifed) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to verify requester message signature.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the validator address and pubkey
        const validatorAddress = op.rao.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddress, this._config.addressPrefix);
        if (validatorAddressString === null) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to validate validator address.", node.from.key)
            return Status.FAILURE;
        };

        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to decode validator public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate validator message
        const validatorMessage = createMessage(
            this._config.networkId,
            op.rao.tx,
            op.rao.vn,
            OperationType.ADMIN_RECOVERY
        );

        if (validatorMessage.length === 0) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to verify validator message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify validator signature
        const validatorHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);
        const isValidatorMessageVerifed = tracCryptoApi.signature.verify(op.rao.vs, validatorHash, validatorPublicKey);
        if (!isValidatorMessageVerifed) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // The writer key must NOT be linked to any address since this is an ADMIN recovery.
        // Until the next release with indexer rotation, we simply enforce the new writer key.
        const writerKeyHasBeenRegistered = await this._getRegisteredWriterKeyApply(batch, op.rao.iw.toString('hex'))
        if (writerKeyHasBeenRegistered !== null) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Writer key already exists.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };
        if (!b4a.equals(op.rao.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        const validatorEntryBuffer = await this._getEntryApply(validatorAddressString, batch);

        // Validator consistency checks
        const isValidatorValid = await this._isValidatorValidApply(validatorEntryBuffer, node, op);
        if (!isValidatorValid) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Validator consistency check failed.", node.from.key)
            return Status.FAILURE;
        }

        const adminEntry = await this._getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this._config.addressPrefix);

        if (decodedAdminEntry === null) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        };

        const publicKeyAdminEntry = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (!b4a.equals(requesterAdminPublicKey, publicKeyAdminEntry)) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Admin public key does not match the node public key.", node.from.key)
            return Status.FAILURE;
        };

        // anti-replay attack
        // NOTE: We would honestly keep this failure because in theory this should never happen.
        const opEntry = await this._getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        const isOldWkInIndexerList = await this._isWriterKeyInIndexerListApply(decodedAdminEntry.wk, base);
        if (!isOldWkInIndexerList) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Old writer key is not in indexer list.", node.from.key)
            return Status.FAILURE;
        }; // Old admin wk is not in indexers entry

        // Update admin entry with new writing key
        const newAdminEntry = adminEntryUtils.encode(requesterAdminAddressBuffer, op.rao.iw, this._config.addressPrefix);
        if (newAdminEntry.length === 0) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        };

        // Update node entry of the admin with new writing key
        const adminNodeEntry = await this._getEntryApply(requesterAdminAddressString, batch);
        const newAdminNodeEntry = setWritingKey(adminNodeEntry, op.rao.iw)

        const isNewWkInIndexerList = await this._isWriterKeyInIndexerListApply(op.rao.iw, base);
        if (isNewWkInIndexerList) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "New writer key is already in indexer list.", node.from.key)
            return Status.FAILURE;
        }; // New admin wk is already in indexers entry

        // charging fee from the requester (admin)
        const decodedAdminNodeEntry = nodeEntryUtils.decode(newAdminNodeEntry)
        if (decodedAdminNodeEntry === null) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to decode node entry.", node.from.key)
            return Status.FAILURE;
        }

        const adminBalance = toBalance(decodedAdminNodeEntry.balance)
        if (adminBalance === null) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Invalid admin balance.", node.from.key)
            return Status.FAILURE;
        }

        if (!adminBalance.greaterThanOrEquals(BALANCE_FEE)) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Insufficient admin balance.", node.from.key)
            return Status.IGNORE;
        };
        const updatedFee = adminBalance.sub(BALANCE_FEE)

        if (updatedFee === null) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to apply fee.", node.from.key)
            return Status.FAILURE;
        }
        const chargedAdminEntry = updatedFee.update(newAdminNodeEntry)

        // Reward logic
        const validatorNodeEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (validatorNodeEntry === null) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Invalid validator node entry.", node.from.key)
            return Status.FAILURE;
        };

        const validatorBalance = toBalance(validatorNodeEntry.balance);
        if (validatorBalance === null) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Invalid validator balance.", node.from.key)
            return Status.FAILURE;
        };

        const newValidatorBalance = validatorBalance.add(BALANCE_FEE.percentage(PERCENT_75));
        if (newValidatorBalance === null) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to transfer fee to validator.", node.from.key)
            return Status.FAILURE;
        };

        const updatedValidatorNodeEntry = newValidatorBalance.update(validatorEntryBuffer)
        if (updatedValidatorNodeEntry === null) {
            this._safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to update validator balance.", node.from.key)
            return Status.FAILURE;
        };

        // Revoke old wk and add new one as an indexer
        await base.removeWriter(decodedAdminEntry.wk);
        await base.addWriter(op.rao.iw, { indexer: true });
        await batch.put(EntryType.WRITER_ADDRESS + op.rao.iw.toString('hex'), op.address);

        // Remove the old admin entry and add the new one
        await batch.put(EntryType.ADMIN, newAdminEntry);
        // This updates the admin node entry with the new writer key and deducted fee.
        await batch.put(requesterAdminAddressString, chargedAdminEntry);

        // Actually pay the fee
        await batch.put(validatorAddressString, updatedValidatorNodeEntry);
        await batch.put(txHashHexString, node.value);

        if (this._config.enableTxApplyLogs) {
            console.info(`Admin has been recovered addr:wk:tx - ${requesterAdminAddressString}:${op.rao.iw.toString('hex')}:${txHashHexString}`);
        }

        return Status.SUCCESS;
    }

    async _handleApplyAppendWhitelistOperation(op, view, base, node, batch) {
        if (!this._stateValidationSchema.validateAdminControlOperation(op)) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // Validate the recipient address
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer, this._config.addressPrefix);
        if (adminAddressString === null) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "Recipient address is invalid.", node.from.key)
            return Status.FAILURE;
        };
        // Validate recipient public key
        const requesterAdminPublicKey = tracCryptoApi.address.decodeSafe(adminAddressString);
        if (b4a.equals(requesterAdminPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "Failed to decode recipient public key.", node.from.key)
            return Status.FAILURE;
        };

        // Retrieve and decode the admin entry to verify the operation is initiated by an admin
        const adminEntry = await this._getEntryApply(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "Failed to verify admin entry.", node.from.key)
            return Status.FAILURE;
        };

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this._config.addressPrefix);
        if (decodedAdminEntry === null) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        }

        if (!this._isAdminApply(decodedAdminEntry, node)) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        };

        // Extract admin entry
        const adminAddress = decodedAdminEntry.address;
        const adminPublicKey = tracCryptoApi.address.decodeSafe(adminAddress);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        };

        //admin consistency check
        if (!b4a.equals(adminPublicKey, requesterAdminPublicKey)) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the network prefix from the node's address
        const nodeAddressBuffer = op.aco.ia;

        const nodeAddressString = addressUtils.bufferToAddress(nodeAddressBuffer, this._config.addressPrefix);
        if (nodeAddressString === null) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "Failed to verify node address.", node.from.key)
            return Status.FAILURE;
        };
        const nodePublicKey = tracCryptoApi.address.decodeSafe(nodeAddressString);
        if (b4a.equals(nodePublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "Failed to decode node public key.", node.from.key)
            return Status.FAILURE;
        };

        // verify signature
        const message = createMessage(
            this._config.networkId,
            op.aco.txv,
            op.aco.ia,
            op.aco.in,
            OperationType.APPEND_WHITELIST
        );
        if (message.length === 0) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        // verify signature
        const hash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(hash, op.aco.tx)) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isMessageVerified = tracCryptoApi.signature.verify(op.aco.is, op.aco.tx, adminPublicKey);
        if (!isMessageVerified) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        const hashHexString = op.aco.tx.toString('hex');

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.aco.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // Check if the operation has already been applied
        const opEntry = await this._getEntryApply(hashHexString, batch);
        if (opEntry !== null) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        // Retrieve the node entry to check its current role
        const nodeEntry = await this._getEntryApply(nodeAddressString, batch);
        if (nodeEntryUtils.isWhitelisted(nodeEntry)) {
            this._safeLogApply(OperationType.APPEND_WHITELIST, "Node already whitelisted.", node.from.key)
            return Status.FAILURE;
        }; // Node is already whitelisted

        if (await this._isApplyInitalizationDisabled(batch)) {
            // Fee
            const adminNodeEntry = await this._getEntryApply(adminAddressString, batch);
            if (adminNodeEntry === null) {
                this._safeLogApply(OperationType.APPEND_WHITELIST, "Failed to validate admin entry.", node.from.key)
                return Status.FAILURE;
            };

            const decodedNodeEntry = nodeEntryUtils.decode(adminNodeEntry)
            if (decodedNodeEntry === null) {
                this._safeLogApply(OperationType.APPEND_WHITELIST, "Failed to decode admin entry.", node.from.key)
                return Status.FAILURE;
            };

            const adminBalance = toBalance(decodedNodeEntry.balance)
            if (adminBalance === null) {
                this._safeLogApply(OperationType.APPEND_WHITELIST, "Invalid admin balance.", node.from.key)
                return Status.FAILURE;
            };

            if (!adminBalance.greaterThanOrEquals(BALANCE_FEE)) {
                this._safeLogApply(OperationType.APPEND_WHITELIST, "Insufficient admin balance.", node.from.key)
                return Status.FAILURE;
            };
            const newAdminBalance = adminBalance.sub(BALANCE_FEE)

            if (newAdminBalance === null) {
                this._safeLogApply(OperationType.APPEND_WHITELIST, "Failed to apply fee to admin balance.", node.from.key)
                return Status.FAILURE;
            };
            const updatedAdminEntry = newAdminBalance.update(adminNodeEntry)

            if (updatedAdminEntry === null) {
                this._safeLogApply(OperationType.APPEND_WHITELIST, "Failed to update admin entry.", node.from.key)
                return Status.FAILURE;
            };

            await batch.put(adminAddressString, updatedAdminEntry);
        }

        if (!nodeEntry) {
            // If the node entry does not exist, create a new whitelisted node entry
            /*
                Dear reader,
                wk = 00000000000000000000000000000000 on ed25519 is point P.
                P = (19681161376707505956807079304988542015446066515923890162744021073123829784752,0).
                This point belongs to the curve but is not a valid point.
                Point P belongs to the torsion subgroup E(Fp)_TOR of the curve.

                Yes, you could theoretically (easily) forge a signature on this point.
                No, you don’t need to worry about it.

                Why? Because `wk` is only used as an identifier in our network:
                1. Trac pair of keys is higher in hierarchy.
                2. Our network leverages Libsodium, a robust cryptographic library that enforces stringent checks:
                    - Anyone attempting to create a node with such a key won't be able to participate in our network.
                    - If an attacker tries to use a small order key, signature
                    verification fails due to checks that reject such keys;
                    - The cofactor is always cleared when generating keys,
                    thanks to a process called clamping, which forces private keys
                    to lie in the prime-order subgroup by fixing certain bits.
                    This protects against attacks involving small-order points;
                3. Even if you are assigned this specific wk (the all-zero identifier), you can rest assured
                that you won't be able to perform any network actions with it. You can only directly participate
                in the network if you possess a valid wk. As an indirect user, this characteristic doesn't affect you.

            */
            // If node does not exist, then create a new licence.
            const { newLicenseLength, decodedNewLicenseLength } = await this._applyAssignNewLicense(batch);
            if (newLicenseLength !== null && decodedNewLicenseLength) {
                await batch.put(EntryType.LICENSE_COUNT, newLicenseLength)
                await batch.put(EntryType.LICENSE_INDEX + decodedNewLicenseLength, nodeAddressBuffer)
            } else {
                // This log should (if this error ever happend) ALWAYS log.
                this._safeLogApply("SYSTEM ERROR", "Something went wrong while updating license index.", node.from.key)
            }

            const initializedNodeEntry = nodeEntryUtils.init(ZERO_WK, nodeRoleUtils.NodeRole.WHITELISTED, nodeRoleUtils.ZERO_BALANCE, newLicenseLength);
            if (initializedNodeEntry.length === 0) {
                this._safeLogApply(OperationType.APPEND_WHITELIST, "Failed to initialize node entry.", node.from.key)
                return Status.FAILURE;
            }

            await batch.put(nodeAddressString, initializedNodeEntry);
            await batch.put(hashHexString, node.value);
        } else {
            // If the node entry exists, update its role to WHITELISTED. Case if account will buy license from market but it existed before - for example it had balance.
            // I assume since we dont have a marketplace now, that we by default assign a new license to any whitelisted node.

            const decodedNodeEntry = nodeEntryUtils.decode(nodeEntry);
            if (decodedNodeEntry === null) {
                this._safeLogApply(OperationType.APPEND_WHITELIST, "Failed to decode node entry.", node.from.key)
                return Status.FAILURE;
            };
            const editedNodeEntry = nodeEntryUtils.setRole(nodeEntry, nodeRoleUtils.NodeRole.WHITELISTED);

            if (editedNodeEntry === null) {
                this._safeLogApply(OperationType.APPEND_WHITELIST, "Failed to edit node entry.", node.from.key)
                return Status.FAILURE;
            }

            // Edge case: if the user license is not ZERO_LICENSE, then we do not assign a new license.
            // This means the admin has decided to unban the node.
            // This is important because if the admin mistakenly whitelists a node that already has a license,
            // the previous license could be overwritten and lost permanently.
            // Therefore, in this case we do not overwrite the license — we only change the role.
            if (!b4a.equals(decodedNodeEntry.license, nodeEntryUtils.ZERO_LICENSE)) {
                await batch.put(nodeAddressString, editedNodeEntry);

            } else {
                const { newLicenseLength, decodedNewLicenseLength } = await this._applyAssignNewLicense(batch);
                if (newLicenseLength !== null && decodedNewLicenseLength) {
                    await batch.put(EntryType.LICENSE_COUNT, newLicenseLength)
                    await batch.put(EntryType.LICENSE_INDEX + decodedNewLicenseLength, nodeAddressBuffer)
                } else {
                    // This log should (if this error ever happend) ALWAYS log.
                    this._safeLogApply("SYSTEM ERROR", "Something went wrong while updating license index.", node.from.key)
                }

                const nodeEntryWithNewLicense = nodeEntryUtils.setLicense(editedNodeEntry, newLicenseLength)
                await batch.put(nodeAddressString, nodeEntryWithNewLicense);
            }

            await batch.put(hashHexString, node.value);
        }
        // Only whitelisted node will be able to become a writer/indexer.
        return Status.SUCCESS;
    }

    async _handleApplyBanValidatorOperation(op, view, base, node, batch) {
        if (!this._stateValidationSchema.validateAdminControlOperation(op)) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };
        // Extract and validate the network prefix from the node's address
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this._config.addressPrefix);
        if (requesterAddressString === null) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate requester public key
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // ensure that an admin invoked this operation
        const adminEntry = await this._getEntryApply(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        };

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this._config.addressPrefix);
        if (decodedAdminEntry === null) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Failed to decode admin node entry.", node.from.key)
            return Status.FAILURE;
        };

        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        };

        if (!this._isAdminApply(decodedAdminEntry, node)) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        };

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterPublicKey)) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        };

        // recreate requester message
        const message = createMessage(
            this._config.networkId,
            op.aco.txv,
            op.aco.ia,
            op.aco.in,
            OperationType.BAN_VALIDATOR
        );
        if (message.length === 0) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        // compare hashes
        const regeneratedHash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(regeneratedHash, op.aco.tx)) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isMessageVerified = tracCryptoApi.signature.verify(op.aco.is, regeneratedHash, adminPublicKey);
        const txHashHexString = regeneratedHash.toString('hex');
        if (!isMessageVerified) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        }

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        }

        if (!b4a.equals(op.aco.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // check if the operation has already been applied
        const opEntry = await this._getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the node address to be banned
        const nodeToBeBannedAddressBuffer = op.aco.ia;
        const nodeToBeBannedAddressString = addressUtils.bufferToAddress(nodeToBeBannedAddressBuffer, this._config.addressPrefix);
        if (nodeToBeBannedAddressString === null) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Failed to verify target node address.", node.from.key)
            return Status.FAILURE;
        };

        const toBanNodeEntry = await this._getEntryApply(nodeToBeBannedAddressString, batch);
        if (toBanNodeEntry === null) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Failed to verify target node entry.", node.from.key)
            return Status.FAILURE;
        }; // Node entry must exist to ban it.

        // Atleast writer must be whitelisted to ban it.
        const isWhitelisted = nodeEntryUtils.isWhitelisted(toBanNodeEntry);
        const isWriter = nodeEntryUtils.isWriter(toBanNodeEntry);
        const isIndexer = nodeEntryUtils.isIndexer(toBanNodeEntry);

        // only writer/whitelisted node can be banned.
        if ((!isWhitelisted && !isWriter) || isIndexer) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Only writer/whitelisted node can be banned.", node.from.key)
            return Status.FAILURE;
        };

        const updatedToBanNodeEntry = nodeEntryUtils.setRole(toBanNodeEntry, nodeRoleUtils.NodeRole.READER);
        if (updatedToBanNodeEntry === null) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Failed to update target node role.", node.from.key)
            return Status.FAILURE;
        };

        const decodedToBanNodeEntry = nodeEntryUtils.decode(updatedToBanNodeEntry);
        if (decodedToBanNodeEntry === null) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Failed to decode target node entry.", node.from.key)
            return Status.FAILURE;
        };

        // charge fee from the admin
        const feeAmount = toBalance(transactionUtils.FEE);
        if (feeAmount === null) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Invalid fee amount.", node.from.key)
            return Status.FAILURE;
        };

        const adminNodeEntryBuffer = await this._getEntryApply(requesterAddressString, batch);
        if (adminNodeEntryBuffer === null) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Invalid admin node entry buffer.", node.from.key)
            return Status.FAILURE;
        };

        const adminNodeEntry = nodeEntryUtils.decode(adminNodeEntryBuffer);
        if (adminNodeEntry === null) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Failed to verify admin node entry.", node.from.key)
            return Status.FAILURE;
        };

        const adminBalance = toBalance(adminNodeEntry.balance);
        if (adminBalance === null) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Invalid admin balance", node.from.key)
            return Status.FAILURE;
        };

        if (!adminBalance.greaterThanOrEquals(feeAmount)) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Insufficient admin balance.", node.from.key)
            return Status.FAILURE;
        };

        // 100% fee charged from admin will be burned
        const newAdminBalance = adminBalance.sub(feeAmount);
        if (newAdminBalance === null) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Failed to apply fee to admin balance.", node.from.key)
            return Status.FAILURE;
        };

        const updatedAdminNodeEntry = newAdminBalance.update(adminNodeEntryBuffer);
        if (updatedAdminNodeEntry === null) {
            this._safeLogApply(OperationType.BAN_VALIDATOR, "Failed to update admin node balance.", node.from.key)
            return Status.FAILURE;
        }

        // Remove the writer role and update the state
        if (isWriter) {
            const finalNodeEntry = this._withdrawStakedBalanceApply(updatedToBanNodeEntry, node);
            if (finalNodeEntry === null) {
                this._safeLogApply(OperationType.BAN_VALIDATOR, "Failed to withdraw staked balance.", node.from.key)
                return Status.FAILURE;
            }
            await base.removeWriter(decodedToBanNodeEntry.wk);
            await batch.put(nodeToBeBannedAddressString, finalNodeEntry);

        } else {
            await batch.put(nodeToBeBannedAddressString, updatedToBanNodeEntry);
        }

        await batch.put(requesterAddressString, updatedAdminNodeEntry);
        await batch.put(txHashHexString, node.value);
        if (this._config.enableTxApplyLogs) {
            console.info(`Node has been banned: addr:wk:tx - ${nodeToBeBannedAddressString}:${decodedToBanNodeEntry.wk.toString('hex')}:${txHashHexString}`);
        }

        this._emitEvent(CustomEventType.UNWRITABLE, tracCryptoApi.address.decodeSafe(nodeToBeBannedAddressString))

        return Status.SUCCESS;
    }
};
