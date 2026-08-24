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
import nodeEntryUtils, { setWritingKey } from '../../utils/nodeEntry.js';
import adminEntryUtils from '../../utils/adminEntry.js';
import {
    BALANCE_FEE,
    toBalance,
    PERCENT_75,
} from '../../utils/balance.js';
import { Status } from '../../utils/transaction.js';
import {
} from '../../../../codecs/consensus/v1/vdfConfigCodec.js';

class AdminRecoveryHandler {
    #repo;
    #config;
    #stateValidationSchema;

    constructor(repo, config, stateValidationSchema) {
        this.#repo = repo;
        this.#config = config;
        this.#stateValidationSchema = stateValidationSchema;
    }

    async performOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateRoleAccessOperation(op)) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.rao, "vs") || !Object.hasOwn(op.rao, "va") || !Object.hasOwn(op.rao, "vn")) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Operation is not complete.", node.from.key)
            return Status.FAILURE;
        };

        // for additional security, nonces should be different.
        if (b4a.equals(op.rao.in, op.rao.vn)) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Nonces should not be the same.", node.from.key)
            return Status.FAILURE;
        };

        // addresses should be different.
        if (b4a.equals(op.address, op.rao.va)) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Addresses should be different.", node.from.key)
            return Status.FAILURE;
        };

        // signatures should be different.
        if (b4a.equals(op.rao.is, op.rao.vs)) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Signatures should be different.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester address and pubkey
        const requesterAdminAddressBuffer = op.address;
        const requesterAdminAddressString = addressUtils.bufferToAddress(requesterAdminAddressBuffer, this.#config.addressPrefix);
        if (requesterAdminAddressString === null) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        const requesterAdminPublicKey = tracCryptoApi.address.decodeSafe(requesterAdminAddressString);
        if (b4a.equals(requesterAdminPublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate requester message
        const requesterMessage = createMessage(
            this.#config.networkId,
            op.rao.txv,
            op.rao.iw,
            op.rao.in,
            OperationType.ADMIN_RECOVERY
        );

        if (requesterMessage.length === 0) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(hash, op.rao.tx)) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        // verify requester signature
        const isRequesterMessageVerifed = tracCryptoApi.signature.verify(op.rao.is, op.rao.tx, requesterAdminPublicKey);
        const txHashHexString = op.rao.tx.toString('hex');
        if (!isRequesterMessageVerifed) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Failed to verify requester message signature.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the validator address and pubkey
        const validatorAddress = op.rao.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddress, this.#config.addressPrefix);
        if (validatorAddressString === null) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Failed to validate validator address.", node.from.key)
            return Status.FAILURE;
        };

        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Failed to decode validator public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate validator message
        const validatorMessage = createMessage(
            this.#config.networkId,
            op.rao.tx,
            op.rao.vn,
            OperationType.ADMIN_RECOVERY
        );

        if (validatorMessage.length === 0) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Failed to verify validator message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify validator signature
        const validatorHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);
        const isValidatorMessageVerifed = tracCryptoApi.signature.verify(op.rao.vs, validatorHash, validatorPublicKey);
        if (!isValidatorMessageVerifed) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // The writer key must NOT be linked to any address since this is an ADMIN recovery.
        // Until the next release with indexer rotation, we simply enforce the new writer key.
        const writerKeyHasBeenRegistered = await this.#repo.getRegisteredWriterKey(batch, op.rao.iw.toString('hex'))
        if (writerKeyHasBeenRegistered !== null) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Writer key already exists.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repo.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };
        if (!b4a.equals(op.rao.txv, indexersSequenceState)) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        const validatorEntryBuffer = await this.#repo.getEntry(validatorAddressString, batch);

        // Validator consistency checks
        const isValidatorValid = await this.#repo.isValidatorValid(validatorEntryBuffer, node, op);
        if (!isValidatorValid) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Validator consistency check failed.", node.from.key)
            return Status.FAILURE;
        }

        const adminEntry = await this.#repo.getEntry(EntryType.ADMIN, batch);
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this.#config.addressPrefix);

        if (decodedAdminEntry === null) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        };

        const publicKeyAdminEntry = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (!b4a.equals(requesterAdminPublicKey, publicKeyAdminEntry)) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Admin public key does not match the node public key.", node.from.key)
            return Status.FAILURE;
        };

        // anti-replay attack
        // NOTE: We would honestly keep this failure because in theory this should never happen.
        const opEntry = await this.#repo.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        const isOldWkInIndexerList = await this.#repo.isWriterKeyInIndexerList(decodedAdminEntry.wk, base);
        if (!isOldWkInIndexerList) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Old writer key is not in indexer list.", node.from.key)
            return Status.FAILURE;
        }; // Old admin wk is not in indexers entry

        // Update admin entry with new writing key
        const newAdminEntry = adminEntryUtils.encode(requesterAdminAddressBuffer, op.rao.iw, this.#config.addressPrefix);
        if (newAdminEntry.length === 0) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        };

        // Update node entry of the admin with new writing key
        const adminNodeEntry = await this.#repo.getEntry(requesterAdminAddressString, batch);
        const newAdminNodeEntry = setWritingKey(adminNodeEntry, op.rao.iw)

        const isNewWkInIndexerList = await this.#repo.isWriterKeyInIndexerList(op.rao.iw, base);
        if (isNewWkInIndexerList) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "New writer key is already in indexer list.", node.from.key)
            return Status.FAILURE;
        }; // New admin wk is already in indexers entry

        // charging fee from the requester (admin)
        const decodedAdminNodeEntry = nodeEntryUtils.decode(newAdminNodeEntry)
        if (decodedAdminNodeEntry === null) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Failed to decode node entry.", node.from.key)
            return Status.FAILURE;
        }

        const adminBalance = toBalance(decodedAdminNodeEntry.balance)
        if (adminBalance === null) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Invalid admin balance.", node.from.key)
            return Status.FAILURE;
        }

        if (!adminBalance.greaterThanOrEquals(BALANCE_FEE)) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Insufficient admin balance.", node.from.key)
            return Status.IGNORE;
        };
        const updatedFee = adminBalance.sub(BALANCE_FEE)

        if (updatedFee === null) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Failed to apply fee.", node.from.key)
            return Status.FAILURE;
        }
        const chargedAdminEntry = updatedFee.update(newAdminNodeEntry)

        // Reward logic
        const validatorNodeEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (validatorNodeEntry === null) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Invalid validator node entry.", node.from.key)
            return Status.FAILURE;
        };

        const validatorBalance = toBalance(validatorNodeEntry.balance);
        if (validatorBalance === null) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Invalid validator balance.", node.from.key)
            return Status.FAILURE;
        };

        const newValidatorBalance = validatorBalance.add(BALANCE_FEE.percentage(PERCENT_75));
        if (newValidatorBalance === null) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Failed to transfer fee to validator.", node.from.key)
            return Status.FAILURE;
        };

        const updatedValidatorNodeEntry = newValidatorBalance.update(validatorEntryBuffer)
        if (updatedValidatorNodeEntry === null) {
            this.#repo.safeLog(OperationType.ADMIN_RECOVERY, "Failed to update validator balance.", node.from.key)
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

        if (this.#config.enableTxApplyLogs) {
            console.info(`Admin has been recovered addr:wk:tx - ${requesterAdminAddressString}:${op.rao.iw.toString('hex')}:${txHashHexString}`);
        }

        return Status.SUCCESS;
    }


}

export default AdminRecoveryHandler;
