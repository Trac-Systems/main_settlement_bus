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
    ZERO_WK,
    NULL_BUFFER,
} from '../../../../utils/buffer.js';
import addressUtils from '../../utils/address.js';
import nodeEntryUtils from '../../utils/nodeEntry.js';
import adminEntryUtils from '../../utils/adminEntry.js';
import nodeRoleUtils from '../../utils/roles.js';
import {
    toBalance,
} from '../../utils/balance.js';
import { Status } from '../../utils/transaction.js';
import {
} from '../../../../codecs/consensus/v1/vdfConfigCodec.js';

class BalanceInitializationHandler {
    #repo;
    #config;
    #stateValidationSchema;

    constructor(repo, config, stateValidationSchema) {
        this.#repo = repo;
        this.#config = config;
        this.#stateValidationSchema = stateValidationSchema;
    }

    canHandle(operation) {
        return operation.type === OperationType.BALANCE_INITIALIZATION;
    }

    async performOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateBalanceInitialization(op)) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester network address
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer, this.#config.addressPrefix);
        if (adminAddressString === null) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        }

        // Verify requester admin public key
        const requesterAdminPublicKey = tracCryptoApi.address.decodeSafe(adminAddressString);
        if (b4a.equals(requesterAdminPublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // Validate recipient address
        const recipientAddress = op.bio.ia;
        const recipientAddressString = addressUtils.bufferToAddress(recipientAddress, this.#config.addressPrefix);
        if (recipientAddressString === null) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Recipient address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate recipient public key
        const recipientPublicKey = tracCryptoApi.address.decodeSafe(recipientAddressString);
        if (b4a.equals(recipientPublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Failed to decode recipient public key.", node.from.key)
            return Status.FAILURE;
        };

        // Verify that the amount is not zero
        const amount = toBalance(op.bio.am);
        if (amount === null) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Invalid balance.", node.from.key)
            return Status.FAILURE;
        };

        // Entry has been disabled so there is nothing to do
        if (await this.#repo.isInitalizationDisabled(batch)) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Balance initialization is disabled.", node.from.key)
            return Status.FAILURE;
        };

        // Ensure that an admin invoked this operation
        const adminEntry = await this.#repo.getEntry(EntryType.ADMIN, batch);
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this.#config.addressPrefix);

        if (decodedAdminEntry === null) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        }

        if (!this.#repo.isAdmin(decodedAdminEntry, node)) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        };

        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        };

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterAdminPublicKey)) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        }

        // Recreate requester message
        const message = createMessage(
            this.#config.networkId,
            op.bio.txv,
            op.bio.ia,
            amount.value,
            op.bio.in,
            OperationType.BALANCE_INITIALIZATION
        );
        if (message.length === 0) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(message);
        const txHashHexString = op.bio.tx.toString('hex');
        if (!b4a.equals(hash, op.bio.tx)) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        // Verify signature
        const isMessageVerified = tracCryptoApi.signature.verify(op.bio.is, hash, adminPublicKey);
        if (!isMessageVerified) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // Verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repo.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.bio.txv, indexersSequenceState)) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // Check if the operation has already been applied
        const opEntry = await this.#repo.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        let nodeEntry = null;
        const incomingAddressNodeEntryBuffer = await this.#repo.getEntry(recipientAddressString, batch);

        if (incomingAddressNodeEntryBuffer === null) {
            nodeEntry = nodeEntryUtils.init(ZERO_WK, nodeRoleUtils.NodeRole.READER, amount.value)
            if (nodeEntry.length === 0) {
                this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Failed to initialize node entry.", node.from.key)
                return Status.FAILURE;
            }

        } else {
            nodeEntry = amount.update(incomingAddressNodeEntryBuffer)
            if (nodeEntry === null) {
                this.#repo.safeLog(OperationType.BALANCE_INITIALIZATION, "Failed to set node entry balance.", node.from.key)
                return Status.FAILURE;
            }
        };

        await batch.put(recipientAddressString, nodeEntry);
        await batch.put(txHashHexString, node.value);
        return Status.SUCCESS;
    }


}

export default BalanceInitializationHandler;
