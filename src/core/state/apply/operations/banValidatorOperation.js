import b4a from 'b4a';
import {
    EntryType,
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
import adminEntryUtils from '../../utils/adminEntry.js';
import nodeRoleUtils from '../../utils/roles.js';
import transactionUtils from '../../utils/transaction.js';
import {
    toBalance,
} from '../../utils/balance.js';
import { Status } from '../../utils/transaction.js';
import {
} from '../../../../codecs/consensus/v1/vdfConfigCodec.js';

class BanValidatorHandler {
    #repo;
    #config;
    #stateValidationSchema;

    constructor(repo, config, stateValidationSchema) {
        this.#repo = repo;
        this.#config = config;
        this.#stateValidationSchema = stateValidationSchema;
    }

    canHandle(operation) {
        return operation.type === OperationType.BAN_VALIDATOR;
    }

    async performOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateAdminControlOperation(op)) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };
        // Extract and validate the network prefix from the node's address
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate requester public key
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // ensure that an admin invoked this operation
        const adminEntry = await this.#repo.getEntry(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        };

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this.#config.addressPrefix);
        if (decodedAdminEntry === null) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Failed to decode admin node entry.", node.from.key)
            return Status.FAILURE;
        };

        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        };

        if (!this.#repo.isAdmin(decodedAdminEntry, node)) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        };

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterPublicKey)) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        };

        // recreate requester message
        const message = createMessage(
            this.#config.networkId,
            op.aco.txv,
            op.aco.ia,
            op.aco.in,
            OperationType.BAN_VALIDATOR
        );
        if (message.length === 0) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        // compare hashes
        const regeneratedHash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(regeneratedHash, op.aco.tx)) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isMessageVerified = tracCryptoApi.signature.verify(op.aco.is, regeneratedHash, adminPublicKey);
        const txHashHexString = regeneratedHash.toString('hex');
        if (!isMessageVerified) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        }

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repo.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        }

        if (!b4a.equals(op.aco.txv, indexersSequenceState)) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // check if the operation has already been applied
        const opEntry = await this.#repo.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the node address to be banned
        const nodeToBeBannedAddressBuffer = op.aco.ia;
        const nodeToBeBannedAddressString = addressUtils.bufferToAddress(nodeToBeBannedAddressBuffer, this.#config.addressPrefix);
        if (nodeToBeBannedAddressString === null) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Failed to verify target node address.", node.from.key)
            return Status.FAILURE;
        };

        const toBanNodeEntry = await this.#repo.getEntry(nodeToBeBannedAddressString, batch);
        if (toBanNodeEntry === null) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Failed to verify target node entry.", node.from.key)
            return Status.FAILURE;
        }; // Node entry must exist to ban it.

        // Atleast writer must be whitelisted to ban it.
        const isWhitelisted = nodeEntryUtils.isWhitelisted(toBanNodeEntry);
        const isWriter = nodeEntryUtils.isWriter(toBanNodeEntry);
        const isIndexer = nodeEntryUtils.isIndexer(toBanNodeEntry);

        // only writer/whitelisted node can be banned.
        if ((!isWhitelisted && !isWriter) || isIndexer) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Only writer/whitelisted node can be banned.", node.from.key)
            return Status.FAILURE;
        };

        const updatedToBanNodeEntry = nodeEntryUtils.setRole(toBanNodeEntry, nodeRoleUtils.NodeRole.READER);
        if (updatedToBanNodeEntry === null) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Failed to update target node role.", node.from.key)
            return Status.FAILURE;
        };

        const decodedToBanNodeEntry = nodeEntryUtils.decode(updatedToBanNodeEntry);
        if (decodedToBanNodeEntry === null) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Failed to decode target node entry.", node.from.key)
            return Status.FAILURE;
        };

        // charge fee from the admin
        const feeAmount = toBalance(transactionUtils.FEE);
        if (feeAmount === null) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Invalid fee amount.", node.from.key)
            return Status.FAILURE;
        };

        const adminNodeEntryBuffer = await this.#repo.getEntry(requesterAddressString, batch);
        if (adminNodeEntryBuffer === null) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Invalid admin node entry buffer.", node.from.key)
            return Status.FAILURE;
        };

        const adminNodeEntry = nodeEntryUtils.decode(adminNodeEntryBuffer);
        if (adminNodeEntry === null) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Failed to verify admin node entry.", node.from.key)
            return Status.FAILURE;
        };

        const adminBalance = toBalance(adminNodeEntry.balance);
        if (adminBalance === null) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Invalid admin balance", node.from.key)
            return Status.FAILURE;
        };

        if (!adminBalance.greaterThanOrEquals(feeAmount)) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Insufficient admin balance.", node.from.key)
            return Status.FAILURE;
        };

        // 100% fee charged from admin will be burned
        const newAdminBalance = adminBalance.sub(feeAmount);
        if (newAdminBalance === null) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Failed to apply fee to admin balance.", node.from.key)
            return Status.FAILURE;
        };

        const updatedAdminNodeEntry = newAdminBalance.update(adminNodeEntryBuffer);
        if (updatedAdminNodeEntry === null) {
            this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Failed to update admin node balance.", node.from.key)
            return Status.FAILURE;
        }

        // Remove the writer role and update the state
        if (isWriter) {
            const finalNodeEntry = this.#repo.withdrawStakedBalance(updatedToBanNodeEntry, node);
            if (finalNodeEntry === null) {
                this.#repo.safeLog(OperationType.BAN_VALIDATOR, "Failed to withdraw staked balance.", node.from.key)
                return Status.FAILURE;
            }
            await base.removeWriter(decodedToBanNodeEntry.wk);
            await batch.put(nodeToBeBannedAddressString, finalNodeEntry);

        } else {
            await batch.put(nodeToBeBannedAddressString, updatedToBanNodeEntry);
        }

        await batch.put(requesterAddressString, updatedAdminNodeEntry);
        await batch.put(txHashHexString, node.value);
        if (this.#config.enableTxApplyLogs) {
            console.info(`Node has been banned: addr:wk:tx - ${nodeToBeBannedAddressString}:${decodedToBanNodeEntry.wk.toString('hex')}:${txHashHexString}`);
        }

        this.#repo.emitEvent(CustomEventType.UNWRITABLE, tracCryptoApi.address.decodeSafe(nodeToBeBannedAddressString))

        return Status.SUCCESS;
    }


}

export default BanValidatorHandler;
