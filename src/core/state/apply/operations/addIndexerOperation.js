import BaseHandler from './base/BaseHandler.js';
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

class AddIndexerHandler extends BaseHandler {
    #repo;
    #config;
    #stateValidationSchema;

    constructor(repo, config, stateValidationSchema, state, logger) {
        super(logger, state);
        this.#repo = repo;
        this.#config = config;
        this.#stateValidationSchema = stateValidationSchema;
    }

    async #addIndexer(op, node, batch, base, txHashHexString, pretendingAddressString, requesterAddressString) {

        const pretenderNodeEntry = await this.#repo.getEntry(pretendingAddressString, batch);
        if (pretenderNodeEntry === null) {
            this.logger.error(OperationType.ADD_INDEXER, "Failed to verify target indexer entry.", node.from.key)
            return null;
        };

        const decodedPretenderNodeEntry = nodeEntryUtils.decode(pretenderNodeEntry);
        if (decodedPretenderNodeEntry === null) {
            this.logger.error(OperationType.ADD_INDEXER, "Failed to decode pretender indexer node entry.", node.from.key)
            return null;
        };

        //check if node is allowed to become an indexer
        const isNodeWriter = nodeEntryUtils.isWriter(pretenderNodeEntry);
        const isNodeIndexer = nodeEntryUtils.isIndexer(pretenderNodeEntry);
        if (!isNodeWriter || isNodeIndexer) {
            this.logger.error(OperationType.ADD_INDEXER, "Node must be a writer, and cannot already be an indexer.", node.from.key)
            return null;
        };

        //update node entry to indexer
        const updatedNodeEntry = nodeEntryUtils.setRole(pretenderNodeEntry, nodeRoleUtils.NodeRole.INDEXER)
        if (updatedNodeEntry === null) {
            this.logger.error(OperationType.ADD_INDEXER, "Failed to update node role.", node.from.key)
            return null;
        };

        // ensure that the node wk does not exist in the indexer list
        const indexerListHasWk = await this.#repo.isWriterKeyInIndexerList(decodedPretenderNodeEntry.wk, base);
        if (indexerListHasWk) {
            this.logger.error(OperationType.ADD_INDEXER, "Writer key already exists in indexer list.", node.from.key)
            return null;
        }; // Wk is already in indexer list (Node already indexer)

        // charge fee from the admin (requester)
        const feeAmount = toBalance(transactionUtils.FEE);
        if (feeAmount === null) {
            this.logger.error(OperationType.ADD_INDEXER, "Invalid fee amount.", node.from.key)
            return null;
        };

        const adminNodeEntryBuffer = await this.#repo.getEntry(requesterAddressString, batch);
        if (adminNodeEntryBuffer === null) {
            this.logger.error(OperationType.ADD_INDEXER, "Invalid requester node entry buffer.", node.from.key)
            return null;
        };

        const adminNodeEntry = nodeEntryUtils.decode(adminNodeEntryBuffer);
        if (adminNodeEntry === null) {
            this.logger.error(OperationType.ADD_INDEXER, "Failed to decode requester node entry.", node.from.key)
            return null;
        };

        const adminBalance = toBalance(adminNodeEntry.balance);
        if (adminBalance === null) {
            this.logger.error(OperationType.ADD_INDEXER, "Invalid admin balance.", node.from.key)
            return null;
        };

        if (!adminBalance.greaterThanOrEquals(feeAmount)) {
            this.logger.error(OperationType.ADD_INDEXER, "Insufficient requester balance.", node.from.key)
            return null;
        };

        // 100% fee charged from admin will be burned
        const newAdminBalance = adminBalance.sub(feeAmount);
        if (newAdminBalance === null) {
            this.logger.error(OperationType.ADD_INDEXER, "Failed to apply fee to requester balance.", node.from.key)
            return null;
        };

        const updatedAdminNodeEntry = newAdminBalance.update(adminNodeEntryBuffer);
        if (updatedAdminNodeEntry === null) {
            this.logger.error(OperationType.ADD_INDEXER, "Failed to update requester node.", node.from.key)
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

        if (this.#config.enableTxApplyLogs) {
            console.info(`Indexer added addr:wk:tx - ${pretendingAddressString}:${decodedPretenderNodeEntry.wk.toString('hex')}:${txHashHexString}`);
        }

        this.emitEvent(CustomEventType.IS_INDEXER, tracCryptoApi.address.decodeSafe(pretendingAddressString))
    }

    canHandle(operation) {
        return operation.type === OperationType.ADD_INDEXER;
    }

    async performOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateAdminControlOperation(op)) {
            this.logger.error(OperationType.ADD_INDEXER, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester address (admin)
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.logger.error(OperationType.ADD_INDEXER, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate requester public key
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.logger.error(OperationType.ADD_INDEXER, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate pretending indexer address
        const pretendingAddressBuffer = op.aco.ia;
        const pretendingAddressString = addressUtils.bufferToAddress(pretendingAddressBuffer, this.#config.addressPrefix);
        if (pretendingAddressString === null) {
            this.logger.error(OperationType.ADD_INDEXER, "Pretending indexer address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate pretending indexer public key
        const pretentingPublicKey = tracCryptoApi.address.decodeSafe(pretendingAddressString);
        if (b4a.equals(pretentingPublicKey, NULL_BUFFER)) {
            this.logger.error(OperationType.ADD_INDEXER, "Failed to decode pretending indexer public key.", node.from.key)
            return Status.FAILURE;
        };

        // ensure that an admin invoked this operation
        const adminEntry = await this.#repo.getEntry(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this.logger.error(OperationType.ADD_INDEXER, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        };

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this.#config.addressPrefix);
        if (decodedAdminEntry === null) {
            this.logger.error(OperationType.ADD_INDEXER, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        };

        if (!this.#repo.isAdmin(decodedAdminEntry, node)) {
            this.logger.error(OperationType.ADD_INDEXER, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        };

        // Extract admin public key 
        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this.logger.error(OperationType.ADD_INDEXER, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        };

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterPublicKey)) {
            this.logger.error(OperationType.ADD_INDEXER, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        };

        // verify requester signature
        const message = createMessage(
            this.#config.networkId,
            op.aco.txv,
            op.aco.ia,
            op.aco.in,
            OperationType.ADD_INDEXER
        );

        if (message.length === 0) {
            this.logger.error(OperationType.ADD_INDEXER, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(hash, op.aco.tx)) {
            this.logger.error(OperationType.ADD_INDEXER, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isMessageVerified = tracCryptoApi.signature.verify(op.aco.is, hash, adminPublicKey);
        const txHashHexString = hash.toString('hex');
        if (!isMessageVerified) {
            this.logger.error(OperationType.ADD_INDEXER, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repo.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.logger.error(OperationType.ADD_INDEXER, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.aco.txv, indexersSequenceState)) {
            this.logger.error(OperationType.ADD_INDEXER, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // anti-replay attack
        const opEntry = await this.#repo.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.logger.error(OperationType.ADD_INDEXER, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        const addIndexerResult = await this.#addIndexer(op, node, batch, base, txHashHexString, pretendingAddressString, requesterAddressString);
        if (addIndexerResult === null) {
            return Status.FAILURE;
        }

        return Status.SUCCESS;
    }


}

export default AddIndexerHandler;
