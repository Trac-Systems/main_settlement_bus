import BaseHandler from './base/BaseHandler.js';
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
import nodeEntryUtils, { NODE_ENTRY_SIZE } from '../../utils/nodeEntry.js';
import nodeRoleUtils from '../../utils/roles.js';
import {
    BALANCE_FEE,
    BALANCE_TO_STAKE,
    toBalance,
    PERCENT_75,
} from '../../utils/balance.js';
import { Status } from '../../utils/transaction.js';
import {
} from '../../../../codecs/consensus/v1/vdfConfigCodec.js';

class AddWriterHandler extends BaseHandler {
    #repo;
    #config;
    #stateValidationSchema;

    constructor(repo, config, stateValidationSchema, state, logger) {
        super(logger, state);
        this.#repo = repo;
        this.#config = config;
        this.#stateValidationSchema = stateValidationSchema;
    }

    #stakeBalance(nodeEntryBuffer, node) {
        if (!nodeEntryBuffer || nodeEntryBuffer.length === 0 || nodeEntryBuffer.length !== NODE_ENTRY_SIZE) {
            this.logger.error("StakeBalance", "Invalid node entry buffer", node.from.key);
            return null;
        }

        const decodedNodeEntry = nodeEntryUtils.decode(nodeEntryBuffer);
        if (decodedNodeEntry === null) {
            this.logger.error("StakeBalance", "Failed to decode node entry", node.from.key);
            return null;
        }

        const currentNodeBalance = toBalance(decodedNodeEntry.balance);
        if (currentNodeBalance === null) {
            this.logger.error("StakeBalance", "Invalid node balance", node.from.key);
            return null;
        }

        if (!currentNodeBalance.greaterThanOrEquals(BALANCE_TO_STAKE)) {
            this.logger.error("StakeBalance", "Insufficient balance to stake", node.from.key);
            return null;
        }

        const newNodeBalance = currentNodeBalance.sub(BALANCE_TO_STAKE);
        if (newNodeBalance === null) {
            this.logger.error("StakeBalance", "Failed to subtract stake balance", node.from.key);
            return null;
        }

        const updatedNodeEntryWithBalance = newNodeBalance.update(nodeEntryBuffer);
        if (updatedNodeEntryWithBalance === null) {
            this.logger.error("StakeBalance", "Failed to update node entry with new balance", node.from.key);
            return null;
        }

        const updatedNodeEntryWithAllBalances = nodeEntryUtils.setStakedBalance(updatedNodeEntryWithBalance, BALANCE_TO_STAKE.value);
        if (updatedNodeEntryWithAllBalances === null) {
            this.logger.error("StakeBalance", "Failed to set staked balance in node entry", node.from.key);
            return null;
        }

        return updatedNodeEntryWithAllBalances;
    }

    async #addWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddressBuffer, validatorAddressString, validatorEntryBuffer) {
        // Retrieve the node entry for the given address, if null then do not process...
        const requesterNodeEntry = await this.#repo.getEntry(requesterAddressString, batch);
        if (requesterNodeEntry === null) {
            this.logger.error(OperationType.ADD_WRITER, "Failed to verify requester node address.", node.from.key)
            return null;
        };

        const decodedRequesterNodeEntry = nodeEntryUtils.decode(requesterNodeEntry)
        if (decodedRequesterNodeEntry === null) {
            this.logger.error(OperationType.ADD_WRITER, "Failed to decode node entry.", node.from.key)
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

        const writerKeyHasBeenRegistered = await this.#repo.getRegisteredWriterKey(batch, op.rao.iw.toString('hex'))
        if (writerKeyHasBeenRegistered !== null) {
            const isCurrentWk = b4a.equals(decodedRequesterNodeEntry.wk, op.rao.iw);
            const isOwner = b4a.equals(writerKeyHasBeenRegistered, requesterAddressBuffer);

            if (!isCurrentWk || !isOwner) {
                this.logger.error(OperationType.ADD_WRITER, "Invalid writer key: either not owned by requester or different from assigned key.", node.from.key)
                return null;
            }
        }

        const isWhitelisted = decodedRequesterNodeEntry.isWhitelisted
        const isWriter = decodedRequesterNodeEntry.isWriter;
        const isIndexer = decodedRequesterNodeEntry.isIndexer;

        // To become a writer the node must be whitelisted and not already a writer or indexer
        if (isIndexer || isWriter || !isWhitelisted) {
            this.logger.error(OperationType.ADD_WRITER, "Node must be whitelisted, and cannot be a writer or an indexer.", node.from.key)
            return null;
        };

        // Charging fee from the requester
        const requesterBalance = toBalance(decodedRequesterNodeEntry.balance)
        if (requesterBalance === null) {
            this.logger.error(OperationType.ADD_WRITER, "Invalid requester balance.", node.from.key)
            return null;
        };

        if (!requesterBalance.greaterThanOrEquals(BALANCE_FEE)) {
            this.logger.error(OperationType.ADD_WRITER, "Insufficient requester balance.", node.from.key)
            return Status.IGNORE;
        };

        const updatedBalance = requesterBalance.sub(BALANCE_FEE) // Remove the fee
        if (updatedBalance === null) {
            this.logger.error(OperationType.ADD_WRITER, "Failed to apply fee to requester balance.", node.from.key)
            return null;
        };

        // Update the node entry to assign the writer role and deduct the fee from the requester's balance
        const updatedRoleRequesterNodeEntry = nodeEntryUtils.setRoleAndWriterKey(requesterNodeEntry, nodeRoleUtils.NodeRole.WRITER, op.rao.iw);
        if (updatedRoleRequesterNodeEntry === null) {
            this.logger.error(OperationType.ADD_WRITER, "Failed to update node entry with a writer role.", node.from.key)
            return null;
        };

        const chargedFeeRequesterNodeEntry = updatedBalance.update(updatedRoleRequesterNodeEntry)
        if (chargedFeeRequesterNodeEntry === null) {
            this.logger.error(OperationType.ADD_WRITER, "Failed to update node balance.", node.from.key)
            return null;
        };

        // reward the validator

        const decodedValidatorEntry = nodeEntryUtils.decode(validatorEntryBuffer)
        if (decodedValidatorEntry === null) {
            this.logger.error(OperationType.ADD_WRITER, "Failed to decode validator entry.", node.from.key)
            return null;
        };

        const validatorBalance = toBalance(decodedValidatorEntry.balance)
        if (validatorBalance === null) {
            this.logger.error(OperationType.ADD_WRITER, "Invalid validator balance.", node.from.key)
            return null;
        };

        const updatedValidatorBalance = validatorBalance.add(BALANCE_FEE.percentage(PERCENT_75))
        if (updatedValidatorBalance === null) {
            this.logger.error(OperationType.ADD_WRITER, "Failed to transfer fee to validator.", node.from.key)
            return null;
        };

        const updatedValidatorEntry = updatedValidatorBalance.update(validatorEntryBuffer)
        if (updatedValidatorEntry === null) {
            this.logger.error(OperationType.ADD_WRITER, "Failed to update validator entry.", node.from.key)
            return null;
        };

        const finalRequesterNodeEntry = this.#stakeBalance(chargedFeeRequesterNodeEntry, node);
        if (finalRequesterNodeEntry === null) {
            this.logger.error(OperationType.ADD_WRITER, "Failed to stake balance for writer.", node.from.key)
            return null;
        };

        // Add the writer role to the base and update the batch
        await base.addWriter(op.rao.iw, { isIndexer: false });
        await batch.put(requesterAddressString, finalRequesterNodeEntry);

        if (writerKeyHasBeenRegistered === null) {
            await batch.put(EntryType.WRITER_ADDRESS + op.rao.iw.toString('hex'), op.address);
        }

        const { length, incrementedLength } = await this.#repo.updateWritersIndex(batch);

        if (length !== null && incrementedLength !== null) {
            // Update the writers index and length entries
            await batch.put(EntryType.WRITERS_INDEX + length, requesterAddressBuffer);
            await batch.put(EntryType.WRITERS_LENGTH, incrementedLength);
        } else {
            // This log should (if this error ever happend) ALWAYS log.
            this.logger.error("SYSTEM ERROR", "Something went wrong while updating writers index.", node.from.key)
        }

        // Pay the fee to the validator
        await batch.put(validatorAddressString, updatedValidatorEntry);
        await batch.put(txHashHexString, node.value);

        if (this.#config.enableTxApplyLogs) {
            console.info(`Writer has been added addr:wk:tx - ${requesterAddressString}:${op.rao.iw.toString('hex')}:${txHashHexString}`);
        }
    }

    canHandle(operation) {
        return operation.type === OperationType.ADD_WRITER;
    }

    async performOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateRoleAccessOperation(op)) {
            this.logger.error(OperationType.ADD_WRITER, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.rao, "vs") || !Object.hasOwn(op.rao, "va") || !Object.hasOwn(op.rao, "vn")) {
            this.logger.error(OperationType.ADD_WRITER, "Operation is not complete.", node.from.key)
            return Status.FAILURE;
        };

        // for additional security, nonces should be different.
        if (b4a.equals(op.rao.in, op.rao.vn)) {
            this.logger.error(OperationType.ADD_WRITER, "Nonces should not be the same.", node.from.key)
            return Status.FAILURE;
        };

        // addresses should be different.
        if (b4a.equals(op.address, op.rao.va)) {
            this.logger.error(OperationType.ADD_WRITER, "Addresses should be different.", node.from.key)
            return Status.FAILURE;
        };

        // signatures should be different.
        if (b4a.equals(op.rao.is, op.rao.vs)) {
            this.logger.error(OperationType.ADD_WRITER, "Signatures should be different.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester address
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.logger.error(OperationType.ADD_WRITER, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.logger.error(OperationType.ADD_WRITER, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // if node want to register ZERO_WK, then this is NOT ALLOWED
        if (b4a.equals(op.rao.iw, ZERO_WK)) {
            this.logger.error(OperationType.ADD_WRITER, "Writer cannot initialize with zero-writer-key.", node.from.key)
            return Status.FAILURE;
        };

        // verify requester signature
        const requesterMessage = createMessage(
            this.#config.networkId,
            op.rao.txv,
            op.rao.iw,
            op.rao.in,
            OperationType.ADD_WRITER
        );

        if (requesterMessage.length === 0) {
            this.logger.error(OperationType.ADD_WRITER, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(hash, op.rao.tx)) {
            this.logger.error(OperationType.ADD_WRITER, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isRequesterMessageVerifed = tracCryptoApi.signature.verify(op.rao.is, op.rao.tx, requesterPublicKey);
        const txHashHexString = op.rao.tx.toString('hex');
        if (!isRequesterMessageVerifed) {
            this.logger.error(OperationType.ADD_WRITER, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify validator signature
        const validatorAddress = op.rao.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddress, this.#config.addressPrefix);
        if (validatorAddressString === null) {
            this.logger.error(OperationType.ADD_WRITER, "Failed to validate validator address.", node.from.key)
            return Status.FAILURE;
        };

        // validate validator public key
        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this.logger.error(OperationType.ADD_WRITER, "Failed to decode validator public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate validator message
        const validatorMessage = createMessage(
            this.#config.networkId,
            op.rao.tx,
            op.rao.vn,
            OperationType.ADD_WRITER
        );

        if (validatorMessage.length === 0) {
            this.logger.error(OperationType.ADD_WRITER, "Invalid validator message.", node.from.key)
            return Status.FAILURE;
        };

        const validatorHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);
        const isValidatorMessageVerifed = tracCryptoApi.signature.verify(op.rao.vs, validatorHash, validatorPublicKey);
        if (!isValidatorMessageVerifed) {
            this.logger.error(OperationType.ADD_WRITER, "Failed to verify validator message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repo.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.logger.error(OperationType.ADD_WRITER, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.rao.txv, indexersSequenceState)) {
            this.logger.error(OperationType.ADD_WRITER, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        const validatorEntryBuffer = await this.#repo.getEntry(validatorAddressString, batch);

        // Validator consistency checks
        const isValidatorValid = await this.isValidatorValid(validatorEntryBuffer, node, op);
        if (!isValidatorValid) {
            this.logger.error(OperationType.ADD_WRITER, "Validator consistency check failed.", node.from.key)
            return Status.FAILURE;
        }

        // anti-replay attack
        const opEntry = await this.#repo.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.logger.error(OperationType.ADD_WRITER, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        };

        const addWriterResult = await this.#addWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddressBuffer, validatorAddressString, validatorEntryBuffer);
        if (addWriterResult === null) {
            this.logger.error(OperationType.ADD_WRITER, "Failed to add writer.", node.from.key)
            return Status.FAILURE;
        }

        if (addWriterResult === Status.IGNORE) {
            this.logger.error(OperationType.ADD_WRITER, "Add writer operation ignored.", node.from.key)
            return Status.IGNORE;
        }
        return Status.SUCCESS;
    }


}

export default AddWriterHandler;
