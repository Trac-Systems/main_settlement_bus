import b4a from 'b4a';
import ApplyRepository from './ApplyRepository.js';
import {
    ADMIN_INITIAL_BALANCE,
    EntryType,
    OperationType,
    CustomEventType,
    BATCH_SIZE,
    ADMIN_INITIAL_STAKED_BALANCE,
    ConsensusConfigSchemaVersion,
    UINT32_MAX,
    ConsensusProtocolVersion,
} from '../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { verifyWesolowski } from '@tracsystems/trac-vdf';
import {
    decodeConsensusConfig,
    safeDecodeApplyOperation,
    safeEncodeConsensusConfig,
    safeEncodeEpochProof
} from '../../../codecs/apply/applyOperationCodec.js';
import {
    createMessage,
    ZERO_WK,
    NULL_BUFFER,
    safeWriteUInt32BE,
    safeReadUint32BE,
    safeReadUint8,
    uint16ToBuffer
} from '../../../utils/buffer.js';
import { safeDecodeProofProposal, safeDecodeProofProposalApproval } from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import addressUtils from '../utils/address.js';
import nodeEntryUtils, { setWritingKey } from '../utils/nodeEntry.js';
import adminEntryUtils from '../utils/adminEntry.js';
import nodeRoleUtils from '../utils/roles.js';
import transactionUtils from '../utils/transaction.js';
import {
    BALANCE_FEE,
    toBalance,
    PERCENT_75,
} from '../utils/balance.js';
import deploymentEntryUtils from '../utils/deploymentEntry.js';
import { Status } from '../utils/transaction.js';
import { createGenesisEpochProof } from '../utils/epochProof.js';
import {
    safeDecodeVdfConfig,
} from '../../../codecs/consensus/v1/vdfConfigCodec.js';


const OVERSIZED_BATCH_PENALTY_MULTIPLIER = BATCH_SIZE;

class ApplyState {
    #config;
    #stateValidationSchema;
    #state;
    #repository;

    constructor(config, stateValidationSchema, state) {
        this.#config = config;
        this.#stateValidationSchema = stateValidationSchema;
        this.#state = state;
        this.#repository = new ApplyRepository(this.#config, this);
    }

    async apply(nodes, view, base) {
        const batch = view.batch();
        const batchInvoker = nodes[0].from.key;


        if (nodes.length > BATCH_SIZE) {
            await this.#repository.validatorPenalty(batchInvoker, batch, base, OVERSIZED_BATCH_PENALTY_MULTIPLIER);
            await batch.flush();
            await batch.close();
            return;
        }

        let invalidOperations = 0;

        for (const node of nodes) {

            if (b4a.byteLength(node.value) > transactionUtils.MAXIMUM_OPERATION_PAYLOAD_SIZE) {
                this.#repository.safeLog("Node payload exceeds the maximum operation payload size.", node.from.key)
                invalidOperations++;
                continue;
            }

            const op = safeDecodeApplyOperation(node.value);

            if (!op) {
                this.#repository.safeLog("Failed to decode operation.", node.from.key)
                invalidOperations++;
                continue;
            }

            const handler = this.#getApplyOperationHandler(op.type);

            if (handler) {
                const result = await handler(op, view, base, node, batch);
                if (result === Status.FAILURE) {
                    invalidOperations++;
                } else if (result === Status.IGNORE) {
                    continue;
                } else if (result !== Status.SUCCESS) {
                    this.#repository.safeLog(`Unknown operation status: ${result}`, node.from.key);
                    invalidOperations++;
                }
            } else {
                this.#repository.safeLog(`Unknown operation type: ${op.type}`, node.from.key)
                invalidOperations++;
            }
        }
        if (invalidOperations > 0) {
            await this.#repository.validatorPenalty(batchInvoker, batch, base, invalidOperations);
            this.#repository.safeLog(`Applied with ${invalidOperations} invalid operations.`)
        }

        await batch.flush();
        await batch.close();
    }

    #getApplyOperationHandler(type) {
        const handlers = {
            [OperationType.BALANCE_INITIALIZATION]: this.#handleApplyInitializeBalanceOperation.bind(this),
            [OperationType.DISABLE_INITIALIZATION]: this.#handleApplyDisableBalanceInitializationOperation.bind(this),
            [OperationType.ADD_ADMIN]: this.#handleApplyAddAdminOperation.bind(this),
            [OperationType.APPEND_WHITELIST]: this.#handleApplyAppendWhitelistOperation.bind(this),
            [OperationType.ADD_WRITER]: this.#handleApplyAddWriterOperation.bind(this),
            [OperationType.REMOVE_WRITER]: this.#handleApplyRemoveWriterOperation.bind(this),
            [OperationType.ADMIN_RECOVERY]: this.#handleApplyAdminRecoveryOperation.bind(this),
            [OperationType.ADD_INDEXER]: this.#handleApplyAddIndexerOperation.bind(this),
            [OperationType.REMOVE_INDEXER]: this.#handleApplyRemoveIndexerOperation.bind(this),
            [OperationType.BAN_VALIDATOR]: this.#handleApplyBanValidatorOperation.bind(this),
            [OperationType.BOOTSTRAP_DEPLOYMENT]: this.#handleApplyBootstrapDeploymentOperation.bind(this),
            [OperationType.TX]: this.#handleApplyTxOperation.bind(this),
            [OperationType.TRANSFER]: this.#handleApplyTransferOperation.bind(this),
            [OperationType.SET_EPOCH]: this.#handleApplySetEpochOperation.bind(this),
            [OperationType.SET_GENESIS_EPOCH]: this.#handleApplySetGenesisEpoch.bind(this),
            [OperationType.SET_CONSENSUS_CONFIG]: this.#handleApplySetConsensusConfig.bind(this),
        };
        return handlers[type] || null;
    }

    async #handleApplyInitializeBalanceOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateBalanceInitialization(op)) {
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester network address
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer, this.#config.addressPrefix);
        if (adminAddressString === null) {
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        }

        // Verify requester admin public key
        const requesterAdminPublicKey = tracCryptoApi.address.decodeSafe(adminAddressString);
        if (b4a.equals(requesterAdminPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // Validate recipient address
        const recipientAddress = op.bio.ia;
        const recipientAddressString = addressUtils.bufferToAddress(recipientAddress, this.#config.addressPrefix);
        if (recipientAddressString === null) {
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Recipient address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate recipient public key
        const recipientPublicKey = tracCryptoApi.address.decodeSafe(recipientAddressString);
        if (b4a.equals(recipientPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Failed to decode recipient public key.", node.from.key)
            return Status.FAILURE;
        };

        // Verify that the amount is not zero
        const amount = toBalance(op.bio.am);
        if (amount === null) {
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Invalid balance.", node.from.key)
            return Status.FAILURE;
        };

        // Entry has been disabled so there is nothing to do
        if (await this.#repository.isInitalizationDisabled(batch)) {
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Balance initialization is disabled.", node.from.key)
            return Status.FAILURE;
        };

        // Ensure that an admin invoked this operation
        const adminEntry = await this.#repository.getEntry(EntryType.ADMIN, batch);
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this.#config.addressPrefix);

        if (decodedAdminEntry === null) {
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        }

        if (!this.#repository.isAdmin(decodedAdminEntry, node)) {
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        };

        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        };

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterAdminPublicKey)) {
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "System admin and node public keys do not match.", node.from.key)
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
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(message);
        const txHashHexString = op.bio.tx.toString('hex');
        if (!b4a.equals(hash, op.bio.tx)) {
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        // Verify signature
        const isMessageVerified = tracCryptoApi.signature.verify(op.bio.is, hash, adminPublicKey);
        if (!isMessageVerified) {
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // Verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repository.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.bio.txv, indexersSequenceState)) {
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // Check if the operation has already been applied
        const opEntry = await this.#repository.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        let nodeEntry = null;
        const incomingAddressNodeEntryBuffer = await this.#repository.getEntry(recipientAddressString, batch);

        if (incomingAddressNodeEntryBuffer === null) {
            nodeEntry = nodeEntryUtils.init(ZERO_WK, nodeRoleUtils.NodeRole.READER, amount.value)
            if (nodeEntry.length === 0) {
                this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Failed to initialize node entry.", node.from.key)
                return Status.FAILURE;
            }

        } else {
            nodeEntry = amount.update(incomingAddressNodeEntryBuffer)
            if (nodeEntry === null) {
                this.#repository.safeLog(OperationType.BALANCE_INITIALIZATION, "Failed to set node entry balance.", node.from.key)
                return Status.FAILURE;
            }
        };

        await batch.put(recipientAddressString, nodeEntry);
        await batch.put(txHashHexString, node.value);
        return Status.SUCCESS;
    }

    async #handleApplyDisableBalanceInitializationOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateCoreAdminOperation(op)) {
            this.#repository.safeLog(OperationType.DISABLE_INITIALIZATION, "Schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // Entry has been disabled so there is nothing to do
        if (await this.#repository.isInitalizationDisabled(batch)) {
            this.#repository.safeLog(OperationType.DISABLE_INITIALIZATION, "Balance initialization already disabled.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the network address
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer, this.#config.addressPrefix);
        if (adminAddressString === null) {
            this.#repository.safeLog(OperationType.DISABLE_INITIALIZATION, "Failed to validate requester address.", node.from.key)
            return Status.FAILURE;
        };

        // Validate requester admin public key
        const requesterAdminPublicKey = tracCryptoApi.address.decodeSafe(adminAddressString);
        if (b4a.equals(requesterAdminPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.DISABLE_INITIALIZATION, "Failed to decode requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // Ensure that an admin invoked this operation
        const adminEntry = await this.#repository.getEntry(EntryType.ADMIN, batch);
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this.#config.addressPrefix);

        if (decodedAdminEntry === null) {
            this.#repository.safeLog(OperationType.DISABLE_INITIALIZATION, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        }

        if (!this.#repository.isAdmin(decodedAdminEntry, node)) {
            this.#repository.safeLog(OperationType.DISABLE_INITIALIZATION, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        };

        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.DISABLE_INITIALIZATION, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        };

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterAdminPublicKey)) {
            this.#repository.safeLog(OperationType.DISABLE_INITIALIZATION, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        };

        // Recreate requester message
        const message = createMessage(
            this.#config.networkId,
            op.cao.txv,
            op.cao.iw,
            op.cao.in,
            OperationType.DISABLE_INITIALIZATION
        );
        if (message.length === 0) {
            this.#repository.safeLog(OperationType.DISABLE_INITIALIZATION, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(message);
        const txHashHexString = op.cao.tx.toString('hex');
        if (!b4a.equals(hash, op.cao.tx)) {
            this.#repository.safeLog(OperationType.DISABLE_INITIALIZATION, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        // Verify signature
        const isMessageVerified = tracCryptoApi.signature.verify(op.cao.is, hash, adminPublicKey);
        if (!isMessageVerified) {
            this.#repository.safeLog(OperationType.DISABLE_INITIALIZATION, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // Verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repository.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repository.safeLog(OperationType.DISABLE_INITIALIZATION, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.cao.txv, indexersSequenceState)) {
            this.#repository.safeLog(OperationType.DISABLE_INITIALIZATION, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // Check if the operation has already been applied
        const opEntry = await this.#repository.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repository.safeLog(OperationType.DISABLE_INITIALIZATION, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        await batch.put(EntryType.INITIALIZATION, safeWriteUInt32BE(0));
        await batch.put(txHashHexString, node.value);

        return Status.SUCCESS;
    }

    async #handleApplyAddAdminOperation(op, view, base, node, batch) {
        /*
            ADD ADMIN OPERATION INITIALIZES THE NETWORK. THIS OPERATION CAN BE PERFORMED ONLY ONCE, AND THE NETWORK CREATOR
            DOES NOT HAVE TO PAY A FEE IN THIS CASE. ATTENTION: IF ANY VALIDATOR ATTEMPTS THIS OPERATION AFTER THE NETWORK
            INITIALIZATION, THEIR STAKED BALANCE WILL BE REDUCED (PUNISHMENT).
        */

        if (!this.#stateValidationSchema.validateCoreAdminOperation(op)) {
            this.#repository.safeLog(OperationType.ADD_ADMIN, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester address (admin)
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer, this.#config.addressPrefix);
        if (adminAddressString === null) {
            this.#repository.safeLog(OperationType.ADD_ADMIN, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate requester admin public key (admin)
        const adminPublicKey = tracCryptoApi.address.decodeSafe(adminAddressString);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.ADD_ADMIN, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // Check if the operation is being performed by the bootstrap node - the original deployer of the Trac Network
        if (!b4a.equals(node.from.key, this.#config.bootstrap) || !b4a.equals(op.cao.iw, this.#config.bootstrap)) {
            this.#repository.safeLog(OperationType.ADD_ADMIN, "Node is not a bootstrap node.", node.from.key)
            return Status.FAILURE;
        };

        // recreate requester message
        const requesterMessage = createMessage(
            this.#config.networkId,
            op.cao.txv,
            op.cao.iw,
            op.cao.in,
            OperationType.ADD_ADMIN
        );

        if (requesterMessage.length === 0) {
            this.#repository.safeLog(OperationType.ADD_ADMIN, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(hash, op.cao.tx)) {
            this.#repository.safeLog(OperationType.ADD_ADMIN, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        // verify signature
        const isMessageVerified = tracCryptoApi.signature.verify(op.cao.is, op.cao.tx, adminPublicKey)
        const txHashHexString = op.cao.tx.toString('hex');
        if (!isMessageVerified) {
            this.#repository.safeLog(OperationType.ADD_ADMIN, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repository.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repository.safeLog(OperationType.ADD_ADMIN, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.cao.txv, indexersSequenceState)) {
            this.#repository.safeLog(OperationType.ADD_ADMIN, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // Operation will be performed only once, for consistency check verify that the writer key does not exist
        // writer key should NOT exists for a brand new admin
        const writerKeyHasBeenRegistered = await this.#repository.getRegisteredWriterKey(batch, op.cao.iw.toString('hex'))
        if (writerKeyHasBeenRegistered !== null) {
            this.#repository.safeLog(OperationType.ADD_ADMIN, "Writer key already exists.", node.from.key)
            return Status.FAILURE;
        };

        const adminEntryExists = await this.#repository.getEntry(EntryType.ADMIN, batch);
        // if admin entry already exists, cannot perform this operation
        if (adminEntryExists !== null) {
            this.#repository.safeLog(OperationType.ADD_ADMIN, "Admin entry already exists.", node.from.key)
            return Status.FAILURE;
        };

        // Check if the operation has already been applied
        const opEntry = await this.#repository.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repository.safeLog(OperationType.ADD_ADMIN, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        const { newLicenseLength, decodedNewLicenseLength } = await this.#repository.assignNewLicense(batch);
        if (newLicenseLength !== null && decodedNewLicenseLength) {
            await batch.put(EntryType.LICENSE_COUNT, newLicenseLength)
            await batch.put(EntryType.LICENSE_INDEX + decodedNewLicenseLength, adminAddressBuffer)
        } else {
            // This log should (if this error ever happend) ALWAYS log.
            this.#repository.safeLog("SYSTEM ERROR", "Something went wrong while updating license index.", node.from.key)
        }

        const initializedNodeEntry = nodeEntryUtils.init(op.cao.iw, nodeRoleUtils.NodeRole.INDEXER, ADMIN_INITIAL_BALANCE, newLicenseLength, ADMIN_INITIAL_STAKED_BALANCE);
        if (initializedNodeEntry.length === 0) {
            this.#repository.safeLog(OperationType.ADD_ADMIN, "Failed to initialize node entry.", node.from.key)
            return Status.FAILURE;
        }

        // Create a new admin entry
        const newAdminEntry = adminEntryUtils.encode(adminAddressBuffer, op.cao.iw, this.#config.addressPrefix);
        if (newAdminEntry.length === 0) {
            this.#repository.safeLog(OperationType.ADD_ADMIN, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        await batch.put(adminAddressString, initializedNodeEntry);
        await batch.put(EntryType.WRITER_ADDRESS + op.cao.iw.toString('hex'), op.address);

        const { length, incrementedLength } = await this.#repository.updateWritersIndex(batch);

        if (length !== null && incrementedLength !== null) {
            // Update the writers index and length entries  
            await batch.put(EntryType.WRITERS_INDEX + length, adminAddressBuffer);
            await batch.put(EntryType.WRITERS_LENGTH, incrementedLength);
        } else {
            // This log should (if this error ever happend) ALWAYS log.
            this.#repository.safeLog("SYSTEM ERROR", "Something went wrong while updating writers index.", node.from.key)
        }

        // initialize admin entry and initialization flag
        await batch.put(EntryType.ADMIN, newAdminEntry);
        await batch.put(EntryType.INITIALIZATION, safeWriteUInt32BE(1));
        await batch.put(txHashHexString, node.value);

        if (this.#config.enableTxApplyLogs) {
            console.info(`Admin added addr:wk:tx - ${adminAddressString}:${op.cao.iw.toString('hex')}:${txHashHexString}`);
        }

        return Status.SUCCESS;
    }

    async #handleApplyAdminRecoveryOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateRoleAccessOperation(op)) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.rao, "vs") || !Object.hasOwn(op.rao, "va") || !Object.hasOwn(op.rao, "vn")) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Operation is not complete.", node.from.key)
            return Status.FAILURE;
        };

        // for additional security, nonces should be different.
        if (b4a.equals(op.rao.in, op.rao.vn)) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Nonces should not be the same.", node.from.key)
            return Status.FAILURE;
        };

        // addresses should be different.
        if (b4a.equals(op.address, op.rao.va)) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Addresses should be different.", node.from.key)
            return Status.FAILURE;
        };

        // signatures should be different.
        if (b4a.equals(op.rao.is, op.rao.vs)) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Signatures should be different.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester address and pubkey
        const requesterAdminAddressBuffer = op.address;
        const requesterAdminAddressString = addressUtils.bufferToAddress(requesterAdminAddressBuffer, this.#config.addressPrefix);
        if (requesterAdminAddressString === null) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        const requesterAdminPublicKey = tracCryptoApi.address.decodeSafe(requesterAdminAddressString);
        if (b4a.equals(requesterAdminPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Error while decoding requester public key.", node.from.key)
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
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(hash, op.rao.tx)) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        // verify requester signature
        const isRequesterMessageVerifed = tracCryptoApi.signature.verify(op.rao.is, op.rao.tx, requesterAdminPublicKey);
        const txHashHexString = op.rao.tx.toString('hex');
        if (!isRequesterMessageVerifed) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Failed to verify requester message signature.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the validator address and pubkey
        const validatorAddress = op.rao.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddress, this.#config.addressPrefix);
        if (validatorAddressString === null) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Failed to validate validator address.", node.from.key)
            return Status.FAILURE;
        };

        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Failed to decode validator public key.", node.from.key)
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
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Failed to verify validator message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify validator signature
        const validatorHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);
        const isValidatorMessageVerifed = tracCryptoApi.signature.verify(op.rao.vs, validatorHash, validatorPublicKey);
        if (!isValidatorMessageVerifed) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // The writer key must NOT be linked to any address since this is an ADMIN recovery.
        // Until the next release with indexer rotation, we simply enforce the new writer key.
        const writerKeyHasBeenRegistered = await this.#repository.getRegisteredWriterKey(batch, op.rao.iw.toString('hex'))
        if (writerKeyHasBeenRegistered !== null) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Writer key already exists.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repository.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };
        if (!b4a.equals(op.rao.txv, indexersSequenceState)) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        const validatorEntryBuffer = await this.#repository.getEntry(validatorAddressString, batch);

        // Validator consistency checks
        const isValidatorValid = await this.#repository.isValidatorValid(validatorEntryBuffer, node, op);
        if (!isValidatorValid) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Validator consistency check failed.", node.from.key)
            return Status.FAILURE;
        }

        const adminEntry = await this.#repository.getEntry(EntryType.ADMIN, batch);
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this.#config.addressPrefix);

        if (decodedAdminEntry === null) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        };

        const publicKeyAdminEntry = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (!b4a.equals(requesterAdminPublicKey, publicKeyAdminEntry)) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Admin public key does not match the node public key.", node.from.key)
            return Status.FAILURE;
        };

        // anti-replay attack
        // NOTE: We would honestly keep this failure because in theory this should never happen.
        const opEntry = await this.#repository.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        const isOldWkInIndexerList = await this.#repository.isWriterKeyInIndexerList(decodedAdminEntry.wk, base);
        if (!isOldWkInIndexerList) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Old writer key is not in indexer list.", node.from.key)
            return Status.FAILURE;
        }; // Old admin wk is not in indexers entry

        // Update admin entry with new writing key
        const newAdminEntry = adminEntryUtils.encode(requesterAdminAddressBuffer, op.rao.iw, this.#config.addressPrefix);
        if (newAdminEntry.length === 0) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        };

        // Update node entry of the admin with new writing key
        const adminNodeEntry = await this.#repository.getEntry(requesterAdminAddressString, batch);
        const newAdminNodeEntry = setWritingKey(adminNodeEntry, op.rao.iw)

        const isNewWkInIndexerList = await this.#repository.isWriterKeyInIndexerList(op.rao.iw, base);
        if (isNewWkInIndexerList) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "New writer key is already in indexer list.", node.from.key)
            return Status.FAILURE;
        }; // New admin wk is already in indexers entry

        // charging fee from the requester (admin)
        const decodedAdminNodeEntry = nodeEntryUtils.decode(newAdminNodeEntry)
        if (decodedAdminNodeEntry === null) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Failed to decode node entry.", node.from.key)
            return Status.FAILURE;
        }

        const adminBalance = toBalance(decodedAdminNodeEntry.balance)
        if (adminBalance === null) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Invalid admin balance.", node.from.key)
            return Status.FAILURE;
        }

        if (!adminBalance.greaterThanOrEquals(BALANCE_FEE)) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Insufficient admin balance.", node.from.key)
            return Status.IGNORE;
        };
        const updatedFee = adminBalance.sub(BALANCE_FEE)

        if (updatedFee === null) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Failed to apply fee.", node.from.key)
            return Status.FAILURE;
        }
        const chargedAdminEntry = updatedFee.update(newAdminNodeEntry)

        // Reward logic
        const validatorNodeEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (validatorNodeEntry === null) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Invalid validator node entry.", node.from.key)
            return Status.FAILURE;
        };

        const validatorBalance = toBalance(validatorNodeEntry.balance);
        if (validatorBalance === null) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Invalid validator balance.", node.from.key)
            return Status.FAILURE;
        };

        const newValidatorBalance = validatorBalance.add(BALANCE_FEE.percentage(PERCENT_75));
        if (newValidatorBalance === null) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Failed to transfer fee to validator.", node.from.key)
            return Status.FAILURE;
        };

        const updatedValidatorNodeEntry = newValidatorBalance.update(validatorEntryBuffer)
        if (updatedValidatorNodeEntry === null) {
            this.#repository.safeLog(OperationType.ADMIN_RECOVERY, "Failed to update validator balance.", node.from.key)
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

    async #handleApplyAppendWhitelistOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateAdminControlOperation(op)) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // Validate the recipient address
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer, this.#config.addressPrefix);
        if (adminAddressString === null) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Recipient address is invalid.", node.from.key)
            return Status.FAILURE;
        };
        // Validate recipient public key
        const requesterAdminPublicKey = tracCryptoApi.address.decodeSafe(adminAddressString);
        if (b4a.equals(requesterAdminPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Failed to decode recipient public key.", node.from.key)
            return Status.FAILURE;
        };

        // Retrieve and decode the admin entry to verify the operation is initiated by an admin
        const adminEntry = await this.#repository.getEntry(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Failed to verify admin entry.", node.from.key)
            return Status.FAILURE;
        };

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this.#config.addressPrefix);
        if (decodedAdminEntry === null) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        }

        if (!this.#repository.isAdmin(decodedAdminEntry, node)) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        };

        // Extract admin entry
        const adminAddress = decodedAdminEntry.address;
        const adminPublicKey = tracCryptoApi.address.decodeSafe(adminAddress);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        };

        //admin consistency check
        if (!b4a.equals(adminPublicKey, requesterAdminPublicKey)) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the network prefix from the node's address
        const nodeAddressBuffer = op.aco.ia;

        const nodeAddressString = addressUtils.bufferToAddress(nodeAddressBuffer, this.#config.addressPrefix);
        if (nodeAddressString === null) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Failed to verify node address.", node.from.key)
            return Status.FAILURE;
        };
        const nodePublicKey = tracCryptoApi.address.decodeSafe(nodeAddressString);
        if (b4a.equals(nodePublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Failed to decode node public key.", node.from.key)
            return Status.FAILURE;
        };

        // verify signature
        const message = createMessage(
            this.#config.networkId,
            op.aco.txv,
            op.aco.ia,
            op.aco.in,
            OperationType.APPEND_WHITELIST
        );
        if (message.length === 0) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        // verify signature
        const hash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(hash, op.aco.tx)) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isMessageVerified = tracCryptoApi.signature.verify(op.aco.is, op.aco.tx, adminPublicKey);
        if (!isMessageVerified) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        const hashHexString = op.aco.tx.toString('hex');

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repository.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.aco.txv, indexersSequenceState)) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // Check if the operation has already been applied
        const opEntry = await this.#repository.getEntry(hashHexString, batch);
        if (opEntry !== null) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        // Retrieve the node entry to check its current role
        const nodeEntry = await this.#repository.getEntry(nodeAddressString, batch);
        if (nodeEntryUtils.isWhitelisted(nodeEntry)) {
            this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Node already whitelisted.", node.from.key)
            return Status.FAILURE;
        }; // Node is already whitelisted

        if (await this.#repository.isInitalizationDisabled(batch)) {
            // Fee
            const adminNodeEntry = await this.#repository.getEntry(adminAddressString, batch);
            if (adminNodeEntry === null) {
                this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Failed to validate admin entry.", node.from.key)
                return Status.FAILURE;
            };

            const decodedNodeEntry = nodeEntryUtils.decode(adminNodeEntry)
            if (decodedNodeEntry === null) {
                this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Failed to decode admin entry.", node.from.key)
                return Status.FAILURE;
            };

            const adminBalance = toBalance(decodedNodeEntry.balance)
            if (adminBalance === null) {
                this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Invalid admin balance.", node.from.key)
                return Status.FAILURE;
            };

            if (!adminBalance.greaterThanOrEquals(BALANCE_FEE)) {
                this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Insufficient admin balance.", node.from.key)
                return Status.FAILURE;
            };
            const newAdminBalance = adminBalance.sub(BALANCE_FEE)

            if (newAdminBalance === null) {
                this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Failed to apply fee to admin balance.", node.from.key)
                return Status.FAILURE;
            };
            const updatedAdminEntry = newAdminBalance.update(adminNodeEntry)

            if (updatedAdminEntry === null) {
                this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Failed to update admin entry.", node.from.key)
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
            const { newLicenseLength, decodedNewLicenseLength } = await this.#repository.assignNewLicense(batch);
            if (newLicenseLength !== null && decodedNewLicenseLength) {
                await batch.put(EntryType.LICENSE_COUNT, newLicenseLength)
                await batch.put(EntryType.LICENSE_INDEX + decodedNewLicenseLength, nodeAddressBuffer)
            } else {
                // This log should (if this error ever happend) ALWAYS log.
                this.#repository.safeLog("SYSTEM ERROR", "Something went wrong while updating license index.", node.from.key)
            }

            const initializedNodeEntry = nodeEntryUtils.init(ZERO_WK, nodeRoleUtils.NodeRole.WHITELISTED, nodeRoleUtils.ZERO_BALANCE, newLicenseLength);
            if (initializedNodeEntry.length === 0) {
                this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Failed to initialize node entry.", node.from.key)
                return Status.FAILURE;
            }

            await batch.put(nodeAddressString, initializedNodeEntry);
            await batch.put(hashHexString, node.value);
        } else {
            // If the node entry exists, update its role to WHITELISTED. Case if account will buy license from market but it existed before - for example it had balance.
            // I assume since we dont have a marketplace now, that we by default assign a new license to any whitelisted node.

            const decodedNodeEntry = nodeEntryUtils.decode(nodeEntry);
            if (decodedNodeEntry === null) {
                this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Failed to decode node entry.", node.from.key)
                return Status.FAILURE;
            };
            const editedNodeEntry = nodeEntryUtils.setRole(nodeEntry, nodeRoleUtils.NodeRole.WHITELISTED);

            if (editedNodeEntry === null) {
                this.#repository.safeLog(OperationType.APPEND_WHITELIST, "Failed to edit node entry.", node.from.key)
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
                const { newLicenseLength, decodedNewLicenseLength } = await this.#repository.assignNewLicense(batch);
                if (newLicenseLength !== null && decodedNewLicenseLength) {
                    await batch.put(EntryType.LICENSE_COUNT, newLicenseLength)
                    await batch.put(EntryType.LICENSE_INDEX + decodedNewLicenseLength, nodeAddressBuffer)
                } else {
                    // This log should (if this error ever happend) ALWAYS log.
                    this.#repository.safeLog("SYSTEM ERROR", "Something went wrong while updating license index.", node.from.key)
                }

                const nodeEntryWithNewLicense = nodeEntryUtils.setLicense(editedNodeEntry, newLicenseLength)
                await batch.put(nodeAddressString, nodeEntryWithNewLicense);
            }

            await batch.put(hashHexString, node.value);
        }
        // Only whitelisted node will be able to become a writer/indexer.
        return Status.SUCCESS;
    }

    async #handleApplyAddWriterOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateRoleAccessOperation(op)) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.rao, "vs") || !Object.hasOwn(op.rao, "va") || !Object.hasOwn(op.rao, "vn")) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Operation is not complete.", node.from.key)
            return Status.FAILURE;
        };

        // for additional security, nonces should be different.
        if (b4a.equals(op.rao.in, op.rao.vn)) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Nonces should not be the same.", node.from.key)
            return Status.FAILURE;
        };

        // addresses should be different.
        if (b4a.equals(op.address, op.rao.va)) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Addresses should be different.", node.from.key)
            return Status.FAILURE;
        };

        // signatures should be different.
        if (b4a.equals(op.rao.is, op.rao.vs)) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Signatures should be different.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester address
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // if node want to register ZERO_WK, then this is NOT ALLOWED
        if (b4a.equals(op.rao.iw, ZERO_WK)) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Writer cannot initialize with zero-writer-key.", node.from.key)
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
            this.#repository.safeLog(OperationType.ADD_WRITER, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(hash, op.rao.tx)) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isRequesterMessageVerifed = tracCryptoApi.signature.verify(op.rao.is, op.rao.tx, requesterPublicKey);
        const txHashHexString = op.rao.tx.toString('hex');
        if (!isRequesterMessageVerifed) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify validator signature
        const validatorAddress = op.rao.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddress, this.#config.addressPrefix);
        if (validatorAddressString === null) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Failed to validate validator address.", node.from.key)
            return Status.FAILURE;
        };

        // validate validator public key
        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Failed to decode validator public key.", node.from.key)
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
            this.#repository.safeLog(OperationType.ADD_WRITER, "Invalid validator message.", node.from.key)
            return Status.FAILURE;
        };

        const validatorHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);
        const isValidatorMessageVerifed = tracCryptoApi.signature.verify(op.rao.vs, validatorHash, validatorPublicKey);
        if (!isValidatorMessageVerifed) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Failed to verify validator message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repository.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.rao.txv, indexersSequenceState)) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        const validatorEntryBuffer = await this.#repository.getEntry(validatorAddressString, batch);

        // Validator consistency checks
        const isValidatorValid = await this.#repository.isValidatorValid(validatorEntryBuffer, node, op);
        if (!isValidatorValid) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Validator consistency check failed.", node.from.key)
            return Status.FAILURE;
        }

        // anti-replay attack
        const opEntry = await this.#repository.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        };

        const addWriterResult = await this.#addWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddressBuffer, validatorAddressString, validatorEntryBuffer);
        if (addWriterResult === null) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Failed to add writer.", node.from.key)
            return Status.FAILURE;
        }

        if (addWriterResult === Status.IGNORE) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Add writer operation ignored.", node.from.key)
            return Status.IGNORE;
        }
        return Status.SUCCESS;
    }


    async #handleApplyRemoveWriterOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateRoleAccessOperation(op)) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.rao, "vs") || !Object.hasOwn(op.rao, "va") || !Object.hasOwn(op.rao, "vn")) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Operation is not complete.", node.from.key)
            return Status.FAILURE;
        };

        // for additional security, nonces should be different.
        if (b4a.equals(op.rao.in, op.rao.vn)) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Nonces should not be the same.", node.from.key)
            return Status.FAILURE;
        };

        // addresses should be different.
        if (b4a.equals(op.address, op.rao.va)) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Addresses should be different.", node.from.key)
            return Status.FAILURE;
        };

        // signatures should be different.
        if (b4a.equals(op.rao.is, op.rao.vs)) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Signatures should be different.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the network address
        const requesterAddress = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddress, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate requester public key
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // verify requester signature
        const requesterMessage = createMessage(
            this.#config.networkId,
            op.rao.txv,
            op.rao.iw,
            op.rao.in,
            OperationType.REMOVE_WRITER
        );
        if (requesterMessage.length === 0) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        // compare hashes
        const hash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(hash, op.rao.tx)) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isRequesterMessageVerifed = tracCryptoApi.signature.verify(op.rao.is, op.rao.tx, requesterPublicKey);
        const txHashHexString = op.rao.tx.toString('hex');
        if (!isRequesterMessageVerifed) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify validator signature
        const validatorAddress = op.rao.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddress, this.#config.addressPrefix);
        if (validatorAddressString === null) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Failed to verify validator address.", node.from.key)
            return Status.FAILURE;
        };

        // validate validator public key
        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Failed to decode validator public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate validator message
        const validatorMessage = createMessage(
            this.#config.networkId,
            op.rao.tx,
            op.rao.vn,
            OperationType.REMOVE_WRITER
        );
        if (validatorMessage.length === 0) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Invalid validator message.", node.from.key)
            return Status.FAILURE;
        };

        const validatorHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);
        const isValidatorMessageVerifed = tracCryptoApi.signature.verify(op.rao.vs, validatorHash, validatorPublicKey);
        if (!isValidatorMessageVerifed) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Failed to verify validator message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repository.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.rao.txv, indexersSequenceState)) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        const validatorEntryBuffer = await this.#repository.getEntry(validatorAddressString, batch);

        // Validator consistency checks
        const isValidatorValid = await this.#repository.isValidatorValid(validatorEntryBuffer, node, op);
        if (!isValidatorValid) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Validator consistency check failed.", node.from.key)
            return Status.FAILURE;
        };

        // anti-replay attack
        const opEntry = await this.#repository.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        };

        // Proceed to remove the writer role from the node
        const removeWriterResult = await this.#removeWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddress, validatorAddressString, validatorEntryBuffer);
        if (removeWriterResult === null) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Failed to remove writer.", node.from.key)
            return Status.FAILURE;
        }

        if (removeWriterResult === Status.IGNORE) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Remove writer operation ignored.", node.from.key)
            return Status.IGNORE;
        }

        return Status.SUCCESS;
    }


    async #handleApplyAddIndexerOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateAdminControlOperation(op)) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester address (admin)
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate requester public key
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate pretending indexer address
        const pretendingAddressBuffer = op.aco.ia;
        const pretendingAddressString = addressUtils.bufferToAddress(pretendingAddressBuffer, this.#config.addressPrefix);
        if (pretendingAddressString === null) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Pretending indexer address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate pretending indexer public key
        const pretentingPublicKey = tracCryptoApi.address.decodeSafe(pretendingAddressString);
        if (b4a.equals(pretentingPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Failed to decode pretending indexer public key.", node.from.key)
            return Status.FAILURE;
        };

        // ensure that an admin invoked this operation
        const adminEntry = await this.#repository.getEntry(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        };

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this.#config.addressPrefix);
        if (decodedAdminEntry === null) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        };

        if (!this.#repository.isAdmin(decodedAdminEntry, node)) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        };

        // Extract admin public key 
        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        };

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterPublicKey)) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "System admin and node public keys do not match.", node.from.key)
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
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(hash, op.aco.tx)) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isMessageVerified = tracCryptoApi.signature.verify(op.aco.is, hash, adminPublicKey);
        const txHashHexString = hash.toString('hex');
        if (!isMessageVerified) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repository.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.aco.txv, indexersSequenceState)) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // anti-replay attack
        const opEntry = await this.#repository.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        const addIndexerResult = await this.#addIndexer(op, node, batch, base, txHashHexString, pretendingAddressString, requesterAddressString);
        if (addIndexerResult === null) {
            return Status.FAILURE;
        }

        return Status.SUCCESS;
    }


    async #handleApplyRemoveIndexerOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateAdminControlOperation(op)) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester address (admin)
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate requester public key (admin)
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate pretending indexer address
        const toRemoveAddressBuffer = op.aco.ia;
        const toRemoveAddressString = addressUtils.bufferToAddress(toRemoveAddressBuffer, this.#config.addressPrefix);
        if (toRemoveAddressString === null) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Target indexer address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        const toRemoveAddressPublicKey = tracCryptoApi.address.decodeSafe(toRemoveAddressString);
        if (b4a.equals(toRemoveAddressPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Failed to decode target indexer public key.", node.from.key)
            return Status.FAILURE;
        };

        // ensure that an admin invoked this operation
        const adminEntry = await this.#repository.getEntry(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        };

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this.#config.addressPrefix);
        if (decodedAdminEntry === null) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        };

        if (!this.#repository.isAdmin(decodedAdminEntry, node)) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        };

        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(requesterPublicKey, adminPublicKey)) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        };

        // verify requester signature
        const message = createMessage(
            this.#config.networkId,
            op.aco.txv,
            op.aco.ia,
            op.aco.in,
            OperationType.REMOVE_INDEXER
        );

        if (message.length === 0) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };
        // compare hashes
        const hash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(hash, op.aco.tx)) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isMessageVerified = tracCryptoApi.signature.verify(op.aco.is, hash, adminPublicKey);
        const txHashHexString = hash.toString('hex');
        if (!isMessageVerified) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repository.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.aco.txv, indexersSequenceState)) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // anti-replay attack
        const opEntry = await this.#repository.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        const removeIndexerResult = await this.#removeIndexer(op, node, batch, base, txHashHexString, toRemoveAddressString, toRemoveAddressBuffer, requesterAddressString);
        if (removeIndexerResult === null) {
            return Status.FAILURE;
        };
        return Status.SUCCESS;
    }


    async #handleApplyBanValidatorOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateAdminControlOperation(op)) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };
        // Extract and validate the network prefix from the node's address
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate requester public key
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // ensure that an admin invoked this operation
        const adminEntry = await this.#repository.getEntry(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        };

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this.#config.addressPrefix);
        if (decodedAdminEntry === null) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Failed to decode admin node entry.", node.from.key)
            return Status.FAILURE;
        };

        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        };

        if (!this.#repository.isAdmin(decodedAdminEntry, node)) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        };

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterPublicKey)) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "System admin and node public keys do not match.", node.from.key)
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
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        // compare hashes
        const regeneratedHash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(regeneratedHash, op.aco.tx)) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isMessageVerified = tracCryptoApi.signature.verify(op.aco.is, regeneratedHash, adminPublicKey);
        const txHashHexString = regeneratedHash.toString('hex');
        if (!isMessageVerified) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        }

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repository.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        }

        if (!b4a.equals(op.aco.txv, indexersSequenceState)) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // check if the operation has already been applied
        const opEntry = await this.#repository.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the node address to be banned
        const nodeToBeBannedAddressBuffer = op.aco.ia;
        const nodeToBeBannedAddressString = addressUtils.bufferToAddress(nodeToBeBannedAddressBuffer, this.#config.addressPrefix);
        if (nodeToBeBannedAddressString === null) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Failed to verify target node address.", node.from.key)
            return Status.FAILURE;
        };

        const toBanNodeEntry = await this.#repository.getEntry(nodeToBeBannedAddressString, batch);
        if (toBanNodeEntry === null) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Failed to verify target node entry.", node.from.key)
            return Status.FAILURE;
        }; // Node entry must exist to ban it.

        // Atleast writer must be whitelisted to ban it.
        const isWhitelisted = nodeEntryUtils.isWhitelisted(toBanNodeEntry);
        const isWriter = nodeEntryUtils.isWriter(toBanNodeEntry);
        const isIndexer = nodeEntryUtils.isIndexer(toBanNodeEntry);

        // only writer/whitelisted node can be banned.
        if ((!isWhitelisted && !isWriter) || isIndexer) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Only writer/whitelisted node can be banned.", node.from.key)
            return Status.FAILURE;
        };

        const updatedToBanNodeEntry = nodeEntryUtils.setRole(toBanNodeEntry, nodeRoleUtils.NodeRole.READER);
        if (updatedToBanNodeEntry === null) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Failed to update target node role.", node.from.key)
            return Status.FAILURE;
        };

        const decodedToBanNodeEntry = nodeEntryUtils.decode(updatedToBanNodeEntry);
        if (decodedToBanNodeEntry === null) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Failed to decode target node entry.", node.from.key)
            return Status.FAILURE;
        };

        // charge fee from the admin
        const feeAmount = toBalance(transactionUtils.FEE);
        if (feeAmount === null) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Invalid fee amount.", node.from.key)
            return Status.FAILURE;
        };

        const adminNodeEntryBuffer = await this.#repository.getEntry(requesterAddressString, batch);
        if (adminNodeEntryBuffer === null) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Invalid admin node entry buffer.", node.from.key)
            return Status.FAILURE;
        };

        const adminNodeEntry = nodeEntryUtils.decode(adminNodeEntryBuffer);
        if (adminNodeEntry === null) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Failed to verify admin node entry.", node.from.key)
            return Status.FAILURE;
        };

        const adminBalance = toBalance(adminNodeEntry.balance);
        if (adminBalance === null) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Invalid admin balance", node.from.key)
            return Status.FAILURE;
        };

        if (!adminBalance.greaterThanOrEquals(feeAmount)) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Insufficient admin balance.", node.from.key)
            return Status.FAILURE;
        };

        // 100% fee charged from admin will be burned
        const newAdminBalance = adminBalance.sub(feeAmount);
        if (newAdminBalance === null) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Failed to apply fee to admin balance.", node.from.key)
            return Status.FAILURE;
        };

        const updatedAdminNodeEntry = newAdminBalance.update(adminNodeEntryBuffer);
        if (updatedAdminNodeEntry === null) {
            this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Failed to update admin node balance.", node.from.key)
            return Status.FAILURE;
        }

        // Remove the writer role and update the state
        if (isWriter) {
            const finalNodeEntry = this.#repository.withdrawStakedBalance(updatedToBanNodeEntry, node);
            if (finalNodeEntry === null) {
                this.#repository.safeLog(OperationType.BAN_VALIDATOR, "Failed to withdraw staked balance.", node.from.key)
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

        this.#repository.emitEvent(CustomEventType.UNWRITABLE, tracCryptoApi.address.decodeSafe(nodeToBeBannedAddressString))

        return Status.SUCCESS;
    }

    async #handleApplyBootstrapDeploymentOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateBootstrapDeploymentOperation(op)) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };
        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.bdo, "vs") || !Object.hasOwn(op.bdo, "va") || !Object.hasOwn(op.bdo, "vn")) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Operation is not complete.", node.from.key)
            return Status.FAILURE;
        };
        // do not allow to deploy bootstrap deployment on the same bootstrap.
        if (b4a.equals(op.bdo.bs, this.#config.bootstrap)) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Cannot deploy bootstrap on existing same bootstrap.", node.from.key)
            return Status.FAILURE;
        };
        // for additional security, nonces should be different.
        if (b4a.equals(op.bdo.in, op.bdo.vn)) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Nonces should not be the same.", node.from.key)
            return Status.FAILURE;
        };
        // addresses should be different.
        if (b4a.equals(op.address, op.bdo.va)) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Addresses should be different.", node.from.key)
            return Status.FAILURE;
        };
        // signatures should be different.
        if (b4a.equals(op.bdo.is, op.bdo.vs)) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Signatures should be different.", node.from.key)
            return Status.FAILURE;
        };


        // validate requester signature
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // validate requester public key
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to decode requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate requester message
        const requesterMessage = createMessage(
            this.#config.networkId,
            op.bdo.txv,
            op.bdo.bs,
            op.bdo.ic,
            op.bdo.in,
            OperationType.BOOTSTRAP_DEPLOYMENT
        );

        if (requesterMessage.length === 0) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        // ensure that tx is valid
        const regeneratedTxHash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(regeneratedTxHash, op.bdo.tx)) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isRequesterSignatureValid = tracCryptoApi.signature.verify(op.bdo.is, regeneratedTxHash, requesterPublicKey);
        if (!isRequesterSignatureValid) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        const bootstrapDeploymentHexString = op.bdo.bs.toString('hex');

        //validation of validator signature
        const validatorAddressBuffer = op.bdo.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer, this.#config.addressPrefix);
        if (validatorAddressString === null) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator address.", node.from.key)
            return Status.FAILURE;
        };

        // validate validator public key
        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to decode validator public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate validator message
        const validatorMessage = createMessage(
            this.#config.networkId,
            op.bdo.tx,
            op.bdo.vn,
            OperationType.BOOTSTRAP_DEPLOYMENT
        );

        if (validatorMessage.length === 0) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator message.", node.from.key)
            return Status.FAILURE;
        };

        const validatorMessageHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);

        const isValidatorSignatureValid = tracCryptoApi.signature.verify(op.bdo.vs, validatorMessageHash, validatorPublicKey);
        if (!isValidatorSignatureValid) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to verify validator message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repository.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.bdo.txv, indexersSequenceState)) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        const validatorEntryBuffer = await this.#repository.getEntry(validatorAddressString, batch);

        // Validator consistency checks
        const isValidatorValid = await this.#repository.isValidatorValid(validatorEntryBuffer, node, op);
        if (!isValidatorValid) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Validator consistency check failed.", node.from.key)
            return Status.FAILURE;
        }

        // anti-replay attack
        const hashHexString = op.bdo.tx.toString('hex');
        const opEntry = await this.#repository.getEntry(hashHexString, batch);
        if (opEntry !== null) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        }; // Operation has already been applied.

        // If deployment already exists, do not process it again.
        const alreadyRegisteredBootstrap = await this.#repository.getDeploymentEntry(bootstrapDeploymentHexString, batch);
        if (alreadyRegisteredBootstrap !== null) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Bootstrap already registered.", node.from.key)
            return Status.IGNORE;
        };

        const deploymentEntry = deploymentEntryUtils.encode(op.bdo.tx, requesterAddressBuffer, this.#config.addressPrefix);
        if (deploymentEntry.length === 0) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid deployment entry.", node.from.key)
            return Status.FAILURE;
        };

        const feeAmount = toBalance(transactionUtils.FEE);
        if (feeAmount === null) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid fee amount.", node.from.key)
            return Status.FAILURE;
        };

        // charge fee from the invoker
        const requesterNodeEntryBuffer = await this.#repository.getEntry(requesterAddressString, batch);
        if (requesterNodeEntryBuffer === null) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid requester node entry buffer.", node.from.key)
            return Status.FAILURE;
        };

        const requesterNodeEntry = nodeEntryUtils.decode(requesterNodeEntryBuffer);
        if (requesterNodeEntry === null) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid requester node entry.", node.from.key)
            return Status.FAILURE;
        };

        const requesterBalance = toBalance(requesterNodeEntry.balance);
        if (requesterBalance === null) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid requester balance.", node.from.key)
            return Status.FAILURE;
        };

        if (!requesterBalance.greaterThanOrEquals(feeAmount)) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Insufficient requester balance.", node.from.key)
            return Status.IGNORE;
        };

        const newRequesterBalance = requesterBalance.sub(feeAmount);
        if (newRequesterBalance === null) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to apply fee to requester.", node.from.key)
            return Status.FAILURE;
        };

        const updatedRequesterNodeEntry = newRequesterBalance.update(requesterNodeEntryBuffer);
        if (updatedRequesterNodeEntry === null) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to update requester node balance.", node.from.key)
            return Status.FAILURE;
        };

        // reward validator for processing this transaction.
        const validatorNodeEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (validatorNodeEntry === null) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator node entry.", node.from.key)
            return Status.FAILURE;
        };

        const validatorBalance = toBalance(validatorNodeEntry.balance);
        if (validatorBalance === null) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator balance.", node.from.key)
            return Status.FAILURE;
        };

        const newValidatorBalance = validatorBalance.add(feeAmount.percentage(PERCENT_75));
        if (newValidatorBalance === null) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to transfer fee to validator.", node.from.key)
            return Status.FAILURE;
        };

        const updatedValidatorNodeEntry = newValidatorBalance.update(validatorEntryBuffer);
        if (updatedValidatorNodeEntry === null) {
            this.#repository.safeLog(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to update validator node balance.", node.from.key)
            return Status.FAILURE;
        };

        await batch.put(EntryType.DEPLOYMENT + bootstrapDeploymentHexString, deploymentEntry);
        await batch.put(requesterAddressString, updatedRequesterNodeEntry);
        await batch.put(validatorAddressString, updatedValidatorNodeEntry);
        await batch.put(hashHexString, node.value);

        if (this.#config.enableTxApplyLogs) {
            console.info(`Deployment operation: ${hashHexString} and deployment/${bootstrapDeploymentHexString} have been appended.`);
        }
        return Status.SUCCESS;
    }

    async #handleApplyTxOperation(op, view, base, node, batch) {
        // ATTENTION: The sanitization should be done before ANY other check, otherwise we risk crashing
        if (!this.#stateValidationSchema.validateTransactionOperation(op)) {
            this.#repository.safeLog(OperationType.TX, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };
        // reject transaction which is not complete
        if (!Object.hasOwn(op.txo, "vs") || !Object.hasOwn(op.txo, "va") || !Object.hasOwn(op.txo, "vn")) {
            this.#repository.safeLog(OperationType.TX, "Operation is not complete.", node.from.key)
            return Status.FAILURE;
        };
        // reject if the validator signed their own transaction
        if (b4a.equals(op.address, op.txo.va)) {
            this.#repository.safeLog(OperationType.TX, "Validator cannot sign its own transaction.", node.from.key)
            return Status.FAILURE;
        };
        // reject if the nonces are the same
        if (b4a.equals(op.txo.in, op.txo.vn)) {
            this.#repository.safeLog(OperationType.TX, "Nonces should not be the same.", node.from.key)
            return Status.FAILURE;
        };
        // reject if the signatures are the same
        if (b4a.equals(op.txo.is, op.txo.vs)) {
            this.#repository.safeLog(OperationType.TX, "Signatures should not be the same.", node.from.key)
            return Status.FAILURE;
        };
        // reject if the external bootstrap is the same as the network bootstrap
        if (b4a.equals(op.txo.bs, op.txo.mbs)) {
            this.#repository.safeLog(OperationType.TX, "Network and external bootstrap cannot be the same.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.txo.mbs, this.#config.bootstrap)) {
            this.#repository.safeLog(OperationType.TX, "Declared MSB bootstrap is different than real MSB bootstrap.", node.from.key)
            return Status.FAILURE;
        };

        // validate invoker signature
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.#repository.safeLog(OperationType.TX, "Invalid requester address.", node.from.key)
            return Status.FAILURE;
        };

        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.TX, "Failed to decode requester public key.", node.from.key)
            return Status.FAILURE;
        };

        const requesterMessage = createMessage(
            this.#config.networkId,
            op.txo.txv,
            op.txo.iw,
            op.txo.ch,
            op.txo.bs,
            this.#config.bootstrap,
            op.txo.in,
            OperationType.TX
        );
        if (requesterMessage.length === 0) {
            this.#repository.safeLog(OperationType.TX, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const regeneratedTxHash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(regeneratedTxHash, op.txo.tx)) {
            this.#repository.safeLog(OperationType.TX, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isRequesterSignatureValid = tracCryptoApi.signature.verify(op.txo.is, op.txo.tx, requesterPublicKey); // tx contains already a nonce.
        if (!isRequesterSignatureValid) {
            this.#repository.safeLog(OperationType.TX, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        //second signature
        const validatorAddressBuffer = op.txo.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer, this.#config.addressPrefix);
        if (validatorAddressString === null) {
            this.#repository.safeLog(OperationType.TX, "Invalid validator address.", node.from.key)
            return Status.FAILURE;
        };

        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.TX, "Failed to decode validator public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate validator message
        const validatorMessage = createMessage(
            this.#config.networkId,
            op.txo.tx,
            op.txo.vn,
            OperationType.TX
        );

        if (validatorMessage.length === 0) {
            this.#repository.safeLog(OperationType.TX, "Invalid validator message.", node.from.key)
            return Status.FAILURE;
        };

        const validatorMessageHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);
        const isValidatorSignatureValid = tracCryptoApi.signature.verify(op.txo.vs, validatorMessageHash, validatorPublicKey);
        if (!isValidatorSignatureValid) {
            this.#repository.safeLog(OperationType.TX, "Failed to verify validator message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repository.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repository.safeLog(OperationType.TX, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.txo.txv, indexersSequenceState)) {
            this.#repository.safeLog(OperationType.TX, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        const validatorEntryBuffer = await this.#repository.getEntry(validatorAddressString, batch);

        // Validator consistency checks
        const isValidatorValid = await this.#repository.isValidatorValid(validatorEntryBuffer, node, op);
        if (!isValidatorValid) {
            this.#repository.safeLog(OperationType.TX, "Validator consistency check failed.", node.from.key)
            return Status.FAILURE;
        }

        // anti-replay attack
        const hashHexString = op.txo.tx.toString('hex');
        const opEntry = await this.#repository.getEntry(hashHexString, batch);
        if (opEntry !== null) {
            this.#repository.safeLog(OperationType.TX, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        };

        // if user is performing a transaction on non-deployed bootstrap, then we need to reject it.
        // if deployment/<bootstrap> is not null then it means that the bootstrap is already deployed, and it should
        // point to payload, which is pointing to the txHash.
        const bootstrapHasBeenRegistered = await this.#repository.getDeploymentEntry(op.txo.bs.toString('hex'), batch);
        if (bootstrapHasBeenRegistered === null) {
            this.#repository.safeLog(OperationType.TX, "Bootstrap has not been registered.", node.from.key)
            return Status.FAILURE;
        };

        // check the subnetwork creator address
        const deploymentEntry = deploymentEntryUtils.decode(bootstrapHasBeenRegistered, this.#config.addressLength);
        if (deploymentEntry === null) {
            this.#repository.safeLog(OperationType.TX, "Invalid deployment entry.", node.from.key)
            return Status.FAILURE;
        };

        const subnetworkCreatorAddressString = addressUtils.bufferToAddress(deploymentEntry.address, this.#config.addressPrefix);
        if (subnetworkCreatorAddressString === null) {
            this.#repository.safeLog(OperationType.TX, "Invalid subnet creator address.", node.from.key)
            return Status.FAILURE;
        };

        const feeAmount = toBalance(transactionUtils.FEE);
        if (feeAmount === null) {
            this.#repository.safeLog(OperationType.TX, "Invalid fee amount.", node.from.key)
            return Status.FAILURE;
        };

        const transferFeeTxOperationResult = await this.#repository.transferFeeTxOperation(
            requesterAddressString,
            validatorAddressString,
            validatorEntryBuffer,
            subnetworkCreatorAddressString,
            feeAmount,
            batch,
            node
        );

        // TODO: cover next 4 guards below with tests
        if (transferFeeTxOperationResult === null) {
            this.#repository.safeLog(OperationType.TX, "Fee transfer operation failed completely.", node.from.key);
            return Status.FAILURE;
        }

        if (transferFeeTxOperationResult === Status.IGNORE) {
            this.#repository.safeLog(OperationType.TX, "Fee transfer operation skipped.", node.from.key);
            return Status.IGNORE;
        }

        if (transferFeeTxOperationResult.requesterEntry === null) {
            this.#repository.safeLog(OperationType.TX, "Failed to process requester fee deduction.", node.from.key)
            return Status.FAILURE;
        }

        if (transferFeeTxOperationResult.validatorEntry === null) {
            this.#repository.safeLog(OperationType.TX, "Failed to process validator fee reward.", node.from.key)
            return Status.FAILURE;
        }

        await batch.put(requesterAddressString, transferFeeTxOperationResult.requesterEntry);
        await batch.put(validatorAddressString, transferFeeTxOperationResult.validatorEntry);

        // Handle optional subnetwork creator fee - may be null if creator is requester or validator
        if (transferFeeTxOperationResult.subnetworkCreatorEntry !== null) {
            await batch.put(subnetworkCreatorAddressString, transferFeeTxOperationResult.subnetworkCreatorEntry);
        }
        await batch.put(hashHexString, node.value);

        if (this.#config.enableTxApplyLogs) {
            console.info(`Subnetwork TX operation: ${hashHexString} has been appended.`);
        }
        return Status.SUCCESS;
    }

    async #handleApplyTransferOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateTransferOperation(op)) {
            this.#repository.safeLog(OperationType.TRANSFER, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };
        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.tro, "vs") || !Object.hasOwn(op.tro, "va") || !Object.hasOwn(op.tro, "vn")) {
            this.#repository.safeLog(OperationType.TRANSFER, "Operation is not complete.", node.from.key)
            return Status.FAILURE;
        };
        // for additional security, nonces should be different.
        if (b4a.equals(op.tro.in, op.tro.vn)) {
            this.#repository.safeLog(OperationType.TRANSFER, "Nonces should not be the same.", node.from.key)
            return Status.FAILURE;
        };
        // addresses should be different.
        if (b4a.equals(op.address, op.tro.va)) {
            this.#repository.safeLog(OperationType.TRANSFER, "Addresses should not be the same.", node.from.key)
            return Status.FAILURE;
        };
        // signatures should be different.
        if (b4a.equals(op.tro.is, op.tro.vs)) {
            this.#repository.safeLog(OperationType.TRANSFER, "Signatures should not be the same.", node.from.key)
            return Status.FAILURE;
        };

        // validate requester signature
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.TRANSFER, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // recreate requester message
        const requesterMessage = createMessage(
            this.#config.networkId,
            op.tro.txv,
            op.tro.to,
            op.tro.am,
            op.tro.in,
            OperationType.TRANSFER
        );

        if (requesterMessage.length === 0) {
            this.#repository.safeLog(OperationType.TRANSFER, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        // ensure that tx is valid
        const regeneratedTxHash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(regeneratedTxHash, op.tro.tx)) {
            this.#repository.safeLog(OperationType.TRANSFER, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isRequesterSignatureValid = tracCryptoApi.signature.verify(op.tro.is, regeneratedTxHash, requesterPublicKey);
        if (!isRequesterSignatureValid) {
            this.#repository.safeLog(OperationType.TRANSFER, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // signature of the validator
        const validatorAddressBuffer = op.tro.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer, this.#config.addressPrefix);
        if (validatorAddressString === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Validator address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.TRANSFER, "Failed to decode validator public key.", node.from.key)
            return Status.FAILURE;
        };

        const validatorMessage = createMessage(
            this.#config.networkId,
            op.tro.tx,
            op.tro.vn,
            OperationType.TRANSFER
        );

        if (validatorMessage.length === 0) {
            this.#repository.safeLog(OperationType.TRANSFER, "Invalid validator message.", node.from.key)
            return Status.FAILURE;
        };

        const validatorMessageHash = await tracCryptoApi.hash.blake3Safe(validatorMessage);
        const isValidatorSignatureValid = tracCryptoApi.signature.verify(op.tro.vs, validatorMessageHash, validatorPublicKey);
        if (!isValidatorSignatureValid) {
            this.#repository.safeLog(OperationType.TRANSFER, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repository.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.tro.txv, indexersSequenceState)) {
            this.#repository.safeLog(OperationType.TRANSFER, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        const validatorEntryBuffer = await this.#repository.getEntry(validatorAddressString, batch);

        // Validator consistency checks
        const isValidatorValid = await this.#repository.isValidatorValid(validatorEntryBuffer, node, op);
        if (!isValidatorValid) {
            this.#repository.safeLog(OperationType.TRANSFER, "Validator consistency check failed.", node.from.key)
            return Status.FAILURE;
        }

        // anti-replay attack
        const hashHexString = op.tro.tx.toString('hex');
        const opEntry = await this.#repository.getEntry(hashHexString, batch);
        if (opEntry !== null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        };

        // Check if recipient address is valid.
        const recipientAddressBuffer = op.tro.to;
        const recipientAddressString = addressUtils.bufferToAddress(recipientAddressBuffer, this.#config.addressPrefix);
        if (recipientAddressString === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Invalid recipient address.", node.from.key)
            return Status.FAILURE;
        };

        const recipientPublicKey = tracCryptoApi.address.decodeSafe(recipientAddressString);
        if (b4a.equals(recipientPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.TRANSFER, "Failed to decode recipient public key.", node.from.key)
            return Status.FAILURE;
        };

        const isSelfTransfer = b4a.equals(requesterAddressBuffer, recipientAddressBuffer);
        const isRecipientValidator = b4a.equals(recipientAddressBuffer, validatorAddressBuffer);

        const transferResult = await this.#transfer(
            requesterAddressString,
            recipientAddressString,
            validatorAddressString,
            validatorEntryBuffer,
            op.tro.am,
            transactionUtils.FEE,
            isSelfTransfer,
            isRecipientValidator,
            batch,
            node
        );

        if (transferResult === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Invalid transfer result.", node.from.key);
            return Status.FAILURE;
        }

        if (transferResult === Status.IGNORE) {
            this.#repository.safeLog(OperationType.TRANSFER, "Transfer operation skipped.", node.from.key);
            return Status.IGNORE;
        };

        if (transferResult.senderEntry === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Invalid sender entry.", node.from.key)
            return Status.FAILURE;
        };

        if (transferResult.validatorEntry === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Invalid validator entry.", node.from.key)
            return Status.FAILURE;
        };

        if (!isSelfTransfer) {
            if (transferResult.recipientEntry === null) {
                this.#repository.safeLog(OperationType.TRANSFER, "Invalid recipient entry.", node.from.key)
                return Status.FAILURE;
            };

            await batch.put(recipientAddressString, transferResult.recipientEntry);
        }

        await batch.put(requesterAddressString, transferResult.senderEntry);
        await batch.put(validatorAddressString, transferResult.validatorEntry);

        if (!isSelfTransfer && !isRecipientValidator && transferResult.recipientEntry !== null) {
            await batch.put(recipientAddressString, transferResult.recipientEntry);
        }

        await batch.put(hashHexString, node.value);

        if (this.#config.enableTxApplyLogs) {
            console.info(`Transfer operation: ${hashHexString} has been appended.`);
        }
        return Status.SUCCESS;
    }

    async #handleApplySetEpochOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateSetEpochOperation(op)) {
            this.#repository.safeLog(OperationType.SET_EPOCH, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        const proofProposal = safeDecodeProofProposal(op.seo.pd);
        if (proofProposal === null) {
            this.#repository.safeLog(OperationType.SET_EPOCH, "Failed to decode proof proposal.", node.from.key)
            return Status.FAILURE;
        }

        const currentEpochBuffer = await this.#repository.getEntry(EntryType.EPOCH_CURRENT, batch);
        if (currentEpochBuffer === null) {
            this.#repository.safeLog(OperationType.SET_EPOCH, "Current epoch is not initialized. Genesis epoch has not been set.", node.from.key)
            return Status.FAILURE;
        }

        const currentEpoch = currentEpochBuffer.readBigUInt64BE(0);
        const nextEpoch = currentEpoch + 1n;
        const proposedEpoch = proofProposal.epoch.readBigUInt64BE(0);

        if (proposedEpoch < nextEpoch) {
            this.#repository.safeLog(OperationType.SET_EPOCH, `Stale epoch proposal. Epoch ${currentEpoch} is already committed.`, node.from.key)
            return Status.IGNORE;
        }

        if (proposedEpoch > nextEpoch) {
            this.#repository.safeLog(OperationType.SET_EPOCH, `Unexpected epoch. Proposal must target epoch ${nextEpoch} but got ${proposedEpoch}.`, node.from.key)
            return Status.FAILURE;
        }

        if (proofProposal.protocol_version[0] !== ConsensusProtocolVersion.V1) {
            this.#repository.safeLog(OperationType.SET_EPOCH, "Unsupported proof proposal protocol version.", node.from.key)
            return Status.FAILURE;
        }

        const expectedNetworkId = uint16ToBuffer(this.#config.networkId);
        if (!b4a.equals(proofProposal.network_id, expectedNetworkId)) {
            this.#repository.safeLog(OperationType.SET_EPOCH, "Invalid proof proposal network id.", node.from.key)
            return Status.FAILURE;
        }

        const currentEpochHash = await this.#repository.getEntry(EntryType.EPOCH + currentEpoch.toString(), batch);
        if (currentEpochHash === null || !b4a.equals(currentEpochHash, proofProposal.previous_epoch_record_hash)) {
            this.#repository.safeLog(OperationType.SET_EPOCH, `Previous epoch record hash mismatch for epoch ${currentEpoch}.`, node.from.key)
            return Status.FAILURE;
        }

        const currentConsensusConfigBuffer = await this.#repository.getEntry(EntryType.CONSENSUS_CONFIG_CURRENT, batch);
        if (currentConsensusConfigBuffer === null) {
            this.#repository.safeLog(OperationType.SET_EPOCH, "Consensus config is not initialized.", node.from.key)
            return Status.FAILURE;
        }

        const currentConsensusConfigIndex = safeReadUint32BE(currentConsensusConfigBuffer);
        if (currentConsensusConfigIndex === null) {
            this.#repository.safeLog(OperationType.SET_EPOCH, "Failed to read current consensus config index from buffer", node.from.key)
            return Status.FAILURE;
        }

        const consensusConfigBuffer = await this.#repository.getEntry(
            EntryType.CONSENSUS_CONFIG_RECORD + currentConsensusConfigIndex,
            batch
        );
        if (consensusConfigBuffer === null) {
            this.#repository.safeLog(OperationType.SET_EPOCH, "Consensus config record does not exist.", node.from.key)
            return Status.FAILURE;
        }

        const consensusConfig = decodeConsensusConfig(consensusConfigBuffer);
        const schemaVersion = safeReadUint8(consensusConfig.sv);
        if (schemaVersion !== ConsensusConfigSchemaVersion.VDF_V1) {
            this.#repository.safeLog(OperationType.SET_EPOCH, "Unsupported consensus config schema version.", node.from.key)
            return Status.FAILURE;
        }

        const decodedVdfParams = safeDecodeVdfConfig(consensusConfig.cd);
        if (decodedVdfParams === null) {
            this.#repository.safeLog(OperationType.SET_EPOCH, "Invalid VDF params value.", node.from.key)
            return Status.FAILURE;
        }

        const { difficulty, discriminantBitSize } = decodedVdfParams;
        if (
            !b4a.equals(difficulty, proofProposal.difficulty) ||
            !b4a.equals(discriminantBitSize, proofProposal.discriminant_bit_size)
        ) {
            this.#repository.safeLog(OperationType.SET_EPOCH, "VDF parameters do not match the current consensus config.", node.from.key)
            return Status.FAILURE;
        }

        const challengeData = createMessage(
            proofProposal.protocol_version,
            proofProposal.network_id,
            proofProposal.epoch,
            proofProposal.previous_epoch_record_hash,
            proofProposal.proposer,
            proofProposal.difficulty,
            proofProposal.discriminant_bit_size
        );

        let vdfProofVerified = false;
        try {
            //TODO: Implement safe version
            vdfProofVerified = await verifyWesolowski(
                challengeData,
                difficulty.readUInt32BE(0),
                proofProposal.proof,
                discriminantBitSize.readUInt16BE(0)
            );
        } catch (error) {
            console.error(error);
        }
        if (!vdfProofVerified) {
            this.#repository.safeLog(OperationType.SET_EPOCH, "VDF proof is invalid.", node.from.key)
            return Status.FAILURE;
        }

        const indexerAddresses = new Set();
        for (const indexer of Object.values(base.system.indexers)) {
            const indexerAddressBuffer = await this.#repository.getRegisteredWriterKey(batch, indexer.key.toString('hex'));
            if (!indexerAddressBuffer) continue;
            const indexerAddress = addressUtils.bufferToAddress(indexerAddressBuffer, this.#config.addressPrefix);
            if (indexerAddress) indexerAddresses.add(indexerAddress);
        }

        const proposerAddress = addressUtils.bufferToAddress(proofProposal.proposer, this.#config.addressPrefix);
        if (!proposerAddress || !indexerAddresses.has(proposerAddress)) {
            this.#repository.safeLog(OperationType.SET_EPOCH, "Proposer is not a registered indexer.", node.from.key)
            return Status.FAILURE;
        }

        const proposerPublicKey = tracCryptoApi.address.decodeSafe(proposerAddress);
        let proposalSignatureVerified = false;
        if (!b4a.equals(proposerPublicKey, NULL_BUFFER)) {
            const proposalMessage = createMessage(challengeData, proofProposal.proof);
            try {
                const proposalHash = await tracCryptoApi.hash.blake3(proposalMessage);
                proposalSignatureVerified = tracCryptoApi.signature.verify(proofProposal.signature, proposalHash, proposerPublicKey);
            } catch {
                proposalSignatureVerified = false;
            }
        }
        if (!proposalSignatureVerified) {
            this.#repository.safeLog(OperationType.SET_EPOCH, "Failed to verify proof proposal signature.", node.from.key)
            return Status.FAILURE;
        }

        const validApprovers = new Set();
        for (const encodedApproval of op.seo.app) {
            const approval = safeDecodeProofProposalApproval(encodedApproval);
            if (approval === null) continue;

            const approverAddress = addressUtils.bufferToAddress(approval.approver, this.#config.addressPrefix);
            if (!approverAddress || approverAddress === proposerAddress || !indexerAddresses.has(approverAddress)) continue;

            const approverPublicKey = tracCryptoApi.address.decodeSafe(approverAddress);
            if (b4a.equals(approverPublicKey, NULL_BUFFER)) continue;

            const approvalMessage = createMessage(challengeData, proofProposal.proof, approval.approver, proofProposal.signature);
            let approvalVerified = false;
            try {
                const approvalHash = await tracCryptoApi.hash.blake3(approvalMessage);
                approvalVerified = tracCryptoApi.signature.verify(approval.approval_sig, approvalHash, approverPublicKey);
            } catch {
                approvalVerified = false;
            }
            if (approvalVerified) validApprovers.add(approverAddress);
        }

        const indexerCount = Object.values(base.system.indexers).length;
        const quorumThreshold = indexerCount <= 2 ? 1 : Math.floor(indexerCount / 2) + 1;
        const totalValidSigners = 1 + validApprovers.size; // proposer's own verified signature counts as one signer

        if (totalValidSigners < quorumThreshold) {
            this.#repository.safeLog(OperationType.SET_EPOCH, `Insufficient valid approvals for quorum. Required ${quorumThreshold}, got ${totalValidSigners}.`, node.from.key)
            return Status.FAILURE;
        }

        const encodedEpochProof = safeEncodeEpochProof({ pd: op.seo.pd, app: op.seo.app });
        if (encodedEpochProof.length === 0) {
            this.#repository.safeLog(OperationType.SET_EPOCH, "Failed to encode epoch proof.", node.from.key)
            return Status.FAILURE;
        }

        const epochProofHash = await tracCryptoApi.hash.blake3Safe(encodedEpochProof);
        const nextEpochBuffer = b4a.alloc(8);
        nextEpochBuffer.writeBigUInt64BE(nextEpoch);

        await batch.put(EntryType.EPOCH_CURRENT, nextEpochBuffer);
        await batch.put(EntryType.EPOCH + nextEpoch.toString(), epochProofHash);
        await batch.put(EntryType.EPOCH_HASH + epochProofHash.toString('hex'), encodedEpochProof);

        if (this.#config.enableTxApplyLogs) {
            console.info(`Epoch ${nextEpoch} committed. proposer:approvals - ${proposerAddress}:${validApprovers.size}`);
        }

        this.#state.emit(CustomEventType.EPOCH_CREATED, { epoch: nextEpoch, proposerAddress }); // notify epoch committed
        return Status.SUCCESS;
    }







    /**
     * Retrieves the address assigned to a given writing key from the registry.
     *
     * @param {Object} batch - The current Hyperbee batch instance used for reading state.
     * @param {string} writingKey - The writing key in hex string format.
     * @returns {Buffer|null} The address buffer assigned to the writing key, or null if not registered.
     */











    async #handleApplySetGenesisEpoch(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateConsensusControlOperation(op)) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        }

        // Extract and validate the requester address (admin)
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        }

        // Validate requester public key
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Failed to decode requester public key.", node.from.key)
            return Status.FAILURE;
        }
        // ensure that an admin invoked this operation
        const adminEntry = await this.#repository.getEntry(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        }

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this.#config.addressPrefix);
        if (decodedAdminEntry === null) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        }

        if (!this.#repository.isAdmin(decodedAdminEntry, node)) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        }

        // Extract admin public key
        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        }
        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterPublicKey)) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        }

        const encodedConsensusConfig = safeEncodeConsensusConfig(op.cco.cc);

        if (encodedConsensusConfig.length === 0) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Failed to encode consensus config.", node.from.key);
            return Status.FAILURE;
        }

        if (!this.#repository.validateConsensusConfig(op.cco.cc)) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Consensus config validation failed.", node.from.key);
            return Status.FAILURE;
        }

        // verify requester signature
        const message = createMessage(
            this.#config.networkId,
            op.cco.txv,
            encodedConsensusConfig,
            op.cco.in,
            OperationType.SET_GENESIS_EPOCH
        );

        if (message.length === 0) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        }

        const hash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(hash, op.cco.tx)) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        }

        // verify signature
        const isMessageVerified = tracCryptoApi.signature.verify(op.cco.is, op.cco.tx, adminPublicKey)
        const txHashHexString = op.cco.tx.toString('hex');

        if (!isMessageVerified) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        }

        // verify tx validity - prevent deferred execution attack        
        const indexersSequenceState = await this.#repository.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        }

        if (!b4a.equals(op.cco.txv, indexersSequenceState)) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        }

        // anti-replay attack
        const opEntry = await this.#repository.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        }

        // check if CurrentEpoch have been initialized if yes - failure
        const currentEpoch = await this.#repository.getEntry(EntryType.EPOCH_CURRENT, batch);
        if (currentEpoch !== null) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Current epoch is set. Cannot set a new genesis epoch", node.from.key)
            return Status.IGNORE;
        }

        // check if genesis epoch is initialized. If yes - failure
        const epochZero = EntryType.EPOCH + "0";
        const genesisEpochHash = await this.#repository.getEntry(epochZero , batch);
        if (genesisEpochHash !== null) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Genesis epoch is set. Cannot set a new one", node.from.key)
            return Status.IGNORE;
        }

        const currentConsensusConfigIndex = await this.#repository.getEntry(
            EntryType.CONSENSUS_CONFIG_CURRENT,
            batch
        );

        const genesisConsensusConfigKey = EntryType.CONSENSUS_CONFIG_RECORD + 0;

        const genesisConsensusConfig = await this.#repository.getEntry(
            genesisConsensusConfigKey,
            batch
        );

        // Check if currently genesis config exists
        if (currentConsensusConfigIndex !== null || genesisConsensusConfig !== null) {
            this.#repository.safeLog(
                OperationType.SET_GENESIS_EPOCH,
                "Genesis consensus config is set. Cannot set a new genesis epoch",
                node.from.key
            );
            return Status.IGNORE;
        }


        const genesisEpoch = await createGenesisEpochProof(
            this.#config,
            requesterAddressString,
            encodedConsensusConfig
        );

        if (genesisEpoch === null) {
            this.#repository.safeLog(OperationType.SET_GENESIS_EPOCH, "Could not initialize genesis epoch", node.from.key)
            return Status.FAILURE;
        }

        // initialize CurrentEpoch field
        const zeroAsUint64Buffer = b4a.alloc(8, 0);
        await batch.put(
            EntryType.EPOCH_CURRENT,
            zeroAsUint64Buffer
        );
        
        // initialize Epoch Field
        const epochProofHash = await tracCryptoApi.hash.blake3Safe(genesisEpoch);
        await batch.put(
            epochZero,
            epochProofHash
        );

        // initialize EpochHash Field
        const epochProofHashString = epochProofHash.toString('hex');
        const epochHashLedgerEntry = EntryType.EPOCH_HASH + epochProofHashString;
        await batch.put(
            epochHashLedgerEntry,
            genesisEpoch
        );

        // initialize consensus config schema V1 and make record 0 current
        await batch.put(
            EntryType.CONSENSUS_CONFIG_CURRENT,
            safeWriteUInt32BE(0)
        );
        await batch.put(
            genesisConsensusConfigKey,
            encodedConsensusConfig
        );

        // Put txHashHexString into the state to avoid replay attack
        await batch.put(txHashHexString, node.value);

        if (this.#config.enableTxApplyLogs) {
            console.info(`Genesis Epoch initialized addr:wk:tx - ${requesterAddressString}:${decodedAdminEntry.wk.toString('hex')}:${txHashHexString}`);
        }

        this.#state.emit(CustomEventType.GENESIS_EPOCH_CREATED, { epoch: 0n, proposerAddress: requesterAddressString });
        return Status.SUCCESS;
    }

    async #handleApplySetConsensusConfig(op, _view, base, node, batch) {
        if (!this.#stateValidationSchema.validateConsensusControlOperation(op)) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        }

        const requesterAddressString = addressUtils.bufferToAddress(op.address, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        }

        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Failed to decode requester public key.", node.from.key)
            return Status.FAILURE;
        }

        const adminEntry = await this.#repository.getEntry(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        }

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this.#config.addressPrefix);
        if (decodedAdminEntry === null) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        }

        if (!this.#repository.isAdmin(decodedAdminEntry, node)) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        }

        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        }

        if (!b4a.equals(adminPublicKey, requesterPublicKey)) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        }

        const encodedConsensusConfig = safeEncodeConsensusConfig(op.cco.cc);

        if (encodedConsensusConfig.length === 0) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Failed to encode consensus config.", node.from.key);
            return Status.FAILURE;
        }

        if (!this.#repository.validateConsensusConfig(op.cco.cc)) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Consensus config validation failed.", node.from.key);
            return Status.FAILURE;
        }

        const message = createMessage(
            this.#config.networkId,
            op.cco.txv,
            encodedConsensusConfig,
            op.cco.in,
            OperationType.SET_CONSENSUS_CONFIG
        );

        if (message.length === 0) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        }

        const hash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(hash, op.cco.tx)) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        }

        const isMessageVerified = tracCryptoApi.signature.verify(op.cco.is, op.cco.tx, adminPublicKey);
        if (!isMessageVerified) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        }

        const indexersSequenceState = await this.#repository.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        }

        if (!b4a.equals(op.cco.txv, indexersSequenceState)) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        }

        const txHashHexString = op.cco.tx.toString('hex');
        const opEntry = await this.#repository.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        }

        const currentConsensusConfigBuffer = await this.#repository.getEntry(EntryType.CONSENSUS_CONFIG_CURRENT, batch);
        if (currentConsensusConfigBuffer === null) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Initial consensus config has not been initialized yet", node.from.key)
            return Status.IGNORE;
        }

        const currentConsensusConfigIndex = safeReadUint32BE(currentConsensusConfigBuffer);
        if (currentConsensusConfigIndex === null) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG,"Failed to read current consensus config index from buffer", node.from.key)
            return Status.FAILURE;
        }
        if (currentConsensusConfigIndex === UINT32_MAX) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Consensus config index overflow.", node.from.key)
            return Status.FAILURE;
        }

        const nextConsensusConfigIndex = currentConsensusConfigIndex + 1;
        const nextConsensusConfigKey = EntryType.CONSENSUS_CONFIG_RECORD + nextConsensusConfigIndex;
        const nextConsensusConfigIndexBuffer = safeWriteUInt32BE(nextConsensusConfigIndex);

        if (nextConsensusConfigIndexBuffer.length === 0) {
            this.#repository.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Failed to encode next consensus config index.", node.from.key);
            return Status.FAILURE;
        }

        await batch.put(EntryType.CONSENSUS_CONFIG_CURRENT, nextConsensusConfigIndexBuffer);
        await batch.put(nextConsensusConfigKey, encodedConsensusConfig);
        await batch.put(txHashHexString, node.value);

        if (this.#config.enableTxApplyLogs) {
            console.info(`VDF params updated addr:wk:tx - ${requesterAddressString}:${decodedAdminEntry.wk.toString('hex')}:${txHashHexString}`);
        }

        return Status.SUCCESS;
    }


    async #addWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddressBuffer, validatorAddressString, validatorEntryBuffer) {
        // Retrieve the node entry for the given address, if null then do not process...
        const requesterNodeEntry = await this.#repository.getEntry(requesterAddressString, batch);
        if (requesterNodeEntry === null) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Failed to verify requester node address.", node.from.key)
            return null;
        };

        const decodedRequesterNodeEntry = nodeEntryUtils.decode(requesterNodeEntry)
        if (decodedRequesterNodeEntry === null) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Failed to decode node entry.", node.from.key)
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

        const writerKeyHasBeenRegistered = await this.#repository.getRegisteredWriterKey(batch, op.rao.iw.toString('hex'))
        if (writerKeyHasBeenRegistered !== null) {
            const isCurrentWk = b4a.equals(decodedRequesterNodeEntry.wk, op.rao.iw);
            const isOwner = b4a.equals(writerKeyHasBeenRegistered, requesterAddressBuffer);

            if (!isCurrentWk || !isOwner) {
                this.#repository.safeLog(OperationType.ADD_WRITER, "Invalid writer key: either not owned by requester or different from assigned key.", node.from.key)
                return null;
            }
        }

        const isWhitelisted = decodedRequesterNodeEntry.isWhitelisted
        const isWriter = decodedRequesterNodeEntry.isWriter;
        const isIndexer = decodedRequesterNodeEntry.isIndexer;

        // To become a writer the node must be whitelisted and not already a writer or indexer
        if (isIndexer || isWriter || !isWhitelisted) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Node must be whitelisted, and cannot be a writer or an indexer.", node.from.key)
            return null;
        };

        // Charging fee from the requester
        const requesterBalance = toBalance(decodedRequesterNodeEntry.balance)
        if (requesterBalance === null) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Invalid requester balance.", node.from.key)
            return null;
        };

        if (!requesterBalance.greaterThanOrEquals(BALANCE_FEE)) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Insufficient requester balance.", node.from.key)
            return Status.IGNORE;
        };

        const updatedBalance = requesterBalance.sub(BALANCE_FEE) // Remove the fee
        if (updatedBalance === null) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Failed to apply fee to requester balance.", node.from.key)
            return null;
        };

        // Update the node entry to assign the writer role and deduct the fee from the requester's balance
        const updatedRoleRequesterNodeEntry = nodeEntryUtils.setRoleAndWriterKey(requesterNodeEntry, nodeRoleUtils.NodeRole.WRITER, op.rao.iw);
        if (updatedRoleRequesterNodeEntry === null) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Failed to update node entry with a writer role.", node.from.key)
            return null;
        };

        const chargedFeeRequesterNodeEntry = updatedBalance.update(updatedRoleRequesterNodeEntry)
        if (chargedFeeRequesterNodeEntry === null) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Failed to update node balance.", node.from.key)
            return null;
        };

        // reward the validator

        const decodedValidatorEntry = nodeEntryUtils.decode(validatorEntryBuffer)
        if (decodedValidatorEntry === null) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Failed to decode validator entry.", node.from.key)
            return null;
        };

        const validatorBalance = toBalance(decodedValidatorEntry.balance)
        if (validatorBalance === null) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Invalid validator balance.", node.from.key)
            return null;
        };

        const updatedValidatorBalance = validatorBalance.add(BALANCE_FEE.percentage(PERCENT_75))
        if (updatedValidatorBalance === null) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Failed to transfer fee to validator.", node.from.key)
            return null;
        };

        const updatedValidatorEntry = updatedValidatorBalance.update(validatorEntryBuffer)
        if (updatedValidatorEntry === null) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Failed to update validator entry.", node.from.key)
            return null;
        };

        const finalRequesterNodeEntry = this.#repository.stakeBalance(chargedFeeRequesterNodeEntry, node);
        if (finalRequesterNodeEntry === null) {
            this.#repository.safeLog(OperationType.ADD_WRITER, "Failed to stake balance for writer.", node.from.key)
            return null;
        };

        // Add the writer role to the base and update the batch
        await base.addWriter(op.rao.iw, { isIndexer: false });
        await batch.put(requesterAddressString, finalRequesterNodeEntry);

        if (writerKeyHasBeenRegistered === null) {
            await batch.put(EntryType.WRITER_ADDRESS + op.rao.iw.toString('hex'), op.address);
        }

        const { length, incrementedLength } = await this.#repository.updateWritersIndex(batch);

        if (length !== null && incrementedLength !== null) {
            // Update the writers index and length entries
            await batch.put(EntryType.WRITERS_INDEX + length, requesterAddressBuffer);
            await batch.put(EntryType.WRITERS_LENGTH, incrementedLength);
        } else {
            // This log should (if this error ever happend) ALWAYS log.
            this.#repository.safeLog("SYSTEM ERROR", "Something went wrong while updating writers index.", node.from.key)
        }

        // Pay the fee to the validator
        await batch.put(validatorAddressString, updatedValidatorEntry);
        await batch.put(txHashHexString, node.value);

        if (this.#config.enableTxApplyLogs) {
            console.info(`Writer has been added addr:wk:tx - ${requesterAddressString}:${op.rao.iw.toString('hex')}:${txHashHexString}`);
        }
    }

    async #removeWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddress, validatorAddressString, validatorEntryBuffer) {

        // Fetch the node entry for the given address
        const requesterNodeEntry = await this.#repository.getEntry(requesterAddressString, batch);
        if (requesterNodeEntry === null) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Failed to verify requester node entry.", node.from.key)
            return null;
        };

        const decodedNodeEntry = nodeEntryUtils.decode(requesterNodeEntry);
        if (decodedNodeEntry === null) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Failed to decode requester node entry.", node.from.key)
            return null;
        };

        // Check if the node is a writer or an indexer
        const isNodeWriter = decodedNodeEntry.isWriter;
        const isNodeIndexer = decodedNodeEntry.isIndexer;

        if (isNodeIndexer || !isNodeWriter) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Node has to be a writer, and cannot be an indexer.", node.from.key)
            return null;
        };

        /**
         * Ensure that:
         * 1) writer key exists in registry (we can not unregister something that was not registered),
         * 2) matches the one in node entry ,
         * 3) belongs to the requester - this prevents unauthorized key removal
         */
        const writerKeyHasBeenRegistered = await this.#repository.getRegisteredWriterKey(batch, op.rao.iw.toString('hex'))
        if (writerKeyHasBeenRegistered === null ||
            !b4a.equals(op.rao.iw, decodedNodeEntry.wk) ||
            !b4a.equals(writerKeyHasBeenRegistered, requesterAddress)
        ) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Writer key must be registered, match node's current key, and belong to the requester.", node.from.key)
            return null;
        }

        // Charging fee from the requester
        const requesterBalance = toBalance(decodedNodeEntry.balance);
        if (requesterBalance === null) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Invalid requester balance.", node.from.key)
            return null;
        };

        if (!requesterBalance.greaterThanOrEquals(BALANCE_FEE)) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Insufficient requester balance.", node.from.key)
            return Status.IGNORE;
        };

        const updatedBalance = requesterBalance.sub(BALANCE_FEE);
        if (updatedBalance === null) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Failed to apply fee to requester balance.", node.from.key)
            return null;
        };

        // Downgrade role from WRITER to WHITELISTED and deduct the fee from the requester's balance
        const updatedNodeEntry = nodeEntryUtils.setRole(requesterNodeEntry, nodeRoleUtils.NodeRole.WHITELISTED);
        if (updatedNodeEntry === null) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Failed to update node entry role.", node.from.key)
            return null;
        };
        const chargedNodeEntry = updatedBalance.update(updatedNodeEntry);
        if (chargedNodeEntry === null) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Failed to update node balance.", node.from.key)
            return null;
        };

        // Validator reward logic 
        const decodedValidatorEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (decodedValidatorEntry === null) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Failed to decode validator node entry.", node.from.key)
            return null;
        };

        const validatorBalance = toBalance(decodedValidatorEntry.balance)
        if (validatorBalance === null) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Invalid validator balance.", node.from.key)
            return null;
        };

        const validatorNewBalance = validatorBalance.add(BALANCE_FEE.percentage(PERCENT_75))
        if (validatorNewBalance === null) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Failed to transfer fee to validator balance.", node.from.key)
            return null;
        };

        const updateValidatorEntry = validatorNewBalance.update(validatorEntryBuffer)
        if (updateValidatorEntry === null) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Failed to update validator balance.", node.from.key)
            return null;
        };

        const finalRequesterNodeEntry = this.#repository.withdrawStakedBalance(chargedNodeEntry, node);
        if (finalRequesterNodeEntry === null) {
            this.#repository.safeLog(OperationType.REMOVE_WRITER, "Failed to unstake balance for writer.", node.from.key)
            return null;
        };

        // Remove the writer role and update the state
        await base.removeWriter(decodedNodeEntry.wk);
        await batch.put(requesterAddressString, finalRequesterNodeEntry);

        // Reward the validator
        await batch.put(validatorAddressString, updateValidatorEntry);
        await batch.put(txHashHexString, node.value);

        if (this.#config.enableTxApplyLogs) {
            console.info(`Writer removed: addr:wk:tx - ${requesterAddressString}:${op.rao.iw.toString('hex')}:${txHashHexString}`);
        }

        this.#repository.emitEvent(CustomEventType.UNWRITABLE, tracCryptoApi.address.decodeSafe(requesterAddressString))
    }

    async #addIndexer(op, node, batch, base, txHashHexString, pretendingAddressString, requesterAddressString) {

        const pretenderNodeEntry = await this.#repository.getEntry(pretendingAddressString, batch);
        if (pretenderNodeEntry === null) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Failed to verify target indexer entry.", node.from.key)
            return null;
        };

        const decodedPretenderNodeEntry = nodeEntryUtils.decode(pretenderNodeEntry);
        if (decodedPretenderNodeEntry === null) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Failed to decode pretender indexer node entry.", node.from.key)
            return null;
        };

        //check if node is allowed to become an indexer
        const isNodeWriter = nodeEntryUtils.isWriter(pretenderNodeEntry);
        const isNodeIndexer = nodeEntryUtils.isIndexer(pretenderNodeEntry);
        if (!isNodeWriter || isNodeIndexer) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Node must be a writer, and cannot already be an indexer.", node.from.key)
            return null;
        };

        //update node entry to indexer
        const updatedNodeEntry = nodeEntryUtils.setRole(pretenderNodeEntry, nodeRoleUtils.NodeRole.INDEXER)
        if (updatedNodeEntry === null) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Failed to update node role.", node.from.key)
            return null;
        };

        // ensure that the node wk does not exist in the indexer list
        const indexerListHasWk = await this.#repository.isWriterKeyInIndexerList(decodedPretenderNodeEntry.wk, base);
        if (indexerListHasWk) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Writer key already exists in indexer list.", node.from.key)
            return null;
        }; // Wk is already in indexer list (Node already indexer)

        // charge fee from the admin (requester)
        const feeAmount = toBalance(transactionUtils.FEE);
        if (feeAmount === null) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Invalid fee amount.", node.from.key)
            return null;
        };

        const adminNodeEntryBuffer = await this.#repository.getEntry(requesterAddressString, batch);
        if (adminNodeEntryBuffer === null) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Invalid requester node entry buffer.", node.from.key)
            return null;
        };

        const adminNodeEntry = nodeEntryUtils.decode(adminNodeEntryBuffer);
        if (adminNodeEntry === null) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Failed to decode requester node entry.", node.from.key)
            return null;
        };

        const adminBalance = toBalance(adminNodeEntry.balance);
        if (adminBalance === null) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Invalid admin balance.", node.from.key)
            return null;
        };

        if (!adminBalance.greaterThanOrEquals(feeAmount)) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Insufficient requester balance.", node.from.key)
            return null;
        };

        // 100% fee charged from admin will be burned
        const newAdminBalance = adminBalance.sub(feeAmount);
        if (newAdminBalance === null) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Failed to apply fee to requester balance.", node.from.key)
            return null;
        };

        const updatedAdminNodeEntry = newAdminBalance.update(adminNodeEntryBuffer);
        if (updatedAdminNodeEntry === null) {
            this.#repository.safeLog(OperationType.ADD_INDEXER, "Failed to update requester node.", node.from.key)
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

        this.#repository.emitEvent(CustomEventType.IS_INDEXER, tracCryptoApi.address.decodeSafe(pretendingAddressString))
    }

    async #removeIndexer(op, node, batch, base, txHashHexString, toRemoveAddressString, toRemoveAddressBuffer, requesterAddressString) {
        const toRemoveNodeEntry = await this.#repository.getEntry(toRemoveAddressString, batch);
        if (toRemoveNodeEntry === null) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Failed to verify target indexer entry.", node.from.key)
            return null;
        };

        const decodedNodeEntry = nodeEntryUtils.decode(toRemoveNodeEntry);
        if (decodedNodeEntry === null) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Failed to decode target indexer node entry.", node.from.key)
            return null;
        };

        // Check if the node entry is an indexer
        const isNodeIndexer = nodeEntryUtils.isIndexer(toRemoveNodeEntry);
        if (!isNodeIndexer) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Node must be an indexer.", node.from.key)
            return null;
        };

        //update node entry to writer
        const updatedNodeEntry = nodeEntryUtils.setRoleAndWriterKey(toRemoveNodeEntry, nodeRoleUtils.NodeRole.WRITER, decodedNodeEntry.wk)
        if (updatedNodeEntry === null) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Failed to update node role.", node.from.key)
            return null;
        };

        // Ensure that the node is an indexer
        const indexerListHasWk = await this.#repository.isWriterKeyInIndexerList(decodedNodeEntry.wk, base);
        if (!indexerListHasWk) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Writer key does not exist in indexer list.", node.from.key)
            return null;
        }; // Node is not an indexer.

        // Charging fee from the admin (requester)
        const adminNodeEntry = await this.#repository.getEntry(requesterAddressString, batch);
        if (adminNodeEntry === null) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Invalid requester node entry.", node.from.key)
            return null;
        };

        const decodedAdminNodeEntry = nodeEntryUtils.decode(adminNodeEntry)
        if (decodedAdminNodeEntry === null) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Failed to decode requester node entry.", node.from.key)
            return null;
        };

        const adminBalance = toBalance(decodedAdminNodeEntry.balance)
        if (adminBalance === null) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Invalid admin balance.", node.from.key)
            return null;
        };

        if (!adminBalance.greaterThanOrEquals(BALANCE_FEE)) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Insufficient requester balance.", node.from.key)
            return null;
        };

        // 100% fee will be burned
        const newAdminBalance = adminBalance.sub(BALANCE_FEE)
        if (newAdminBalance === null) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Failed to apply fee to requester balance.", node.from.key)
            return null;
        };

        const updatedAdminNodeEntry = newAdminBalance.update(adminNodeEntry)
        if (updatedAdminNodeEntry === null) {
            this.#repository.safeLog(OperationType.REMOVE_INDEXER, "Failed to update requester node.", node.from.key)
            return null;
        };

        // downgrade role to writer
        await base.removeWriter(decodedNodeEntry.wk);
        await base.addWriter(decodedNodeEntry.wk, { isIndexer: false });

        // update writers index and length
        const { length, incrementedLength } = await this.#repository.updateWritersIndex(batch);

        if (length !== null && incrementedLength !== null) {
            // Update the writers index and length entries 
            await batch.put(EntryType.WRITERS_INDEX + length, toRemoveAddressBuffer);
            await batch.put(EntryType.WRITERS_LENGTH, incrementedLength);
        } else {
            // This log should (if this error ever happend) ALWAYS log.
            this.#repository.safeLog("SYSTEM ERROR", "Something went wrong while updating writers index.", node.from.key)
        }

        //update node entry and indexers entry
        await batch.put(toRemoveAddressString, updatedNodeEntry);

        // update requester (admin) entry after fee deduction
        await batch.put(requesterAddressString, updatedAdminNodeEntry);

        // store operation hash to avoid replay attack.
        await batch.put(txHashHexString, node.value);
        if (this.#config.enableTxApplyLogs) {
            console.info(`Indexer has been removed addr:wk:tx - ${toRemoveAddressString}:${decodedNodeEntry.wk.toString('hex')}:${txHashHexString}`);
        }

        this.#repository.emitEvent(CustomEventType.IS_NON_INDEXER, tracCryptoApi.address.decodeSafe(toRemoveAddressString))
        return Status.SUCCESS;
    }

    async #transfer(senderAddressString, recipientAddressString, validatorAddressString, validatorEntryBuffer, transferAmountBuffer, feeAmountBuffer, isSelfTransfer, isRecipientValidator, batch, node) {
        if (!senderAddressString ||
            !recipientAddressString ||
            !validatorAddressString ||
            !validatorEntryBuffer ||
            !transferAmountBuffer ||
            !feeAmountBuffer ||
            (isSelfTransfer === null || isSelfTransfer === undefined) ||
            !batch ||
            !node
        ) {
            this.#repository.safeLog(OperationType.TRANSFER, "Invalid transfer incoming data.", node.from.key)
            return null;
        }

        const transferAmount = toBalance(transferAmountBuffer);
        const feeAmount = toBalance(feeAmountBuffer);
        if (transferAmount === null || feeAmount === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Invalid fee/transfer amount.", node.from.key)
            return null;
        }

        // totalDeductedAmount = transferAmount + fee. When transferamount is 0, then totalDeductedAmount = fee. Because 0 + fee = fee.
        const totalDeductedAmount = isSelfTransfer ? feeAmount : transferAmount.add(feeAmount);
        if (totalDeductedAmount === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Invalid total deducted amount.", node.from.key)
            return null;
        }

        const senderEntryBuffer = await this.#repository.getEntry(senderAddressString, batch);
        if (senderEntryBuffer === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Invalid sender node entry buffer.", node.from.key)
            return null;
        }

        const senderEntry = nodeEntryUtils.decode(senderEntryBuffer);
        if (senderEntry === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Invalid sender node entry.", node.from.key)
            return null;
        }

        const senderBalance = toBalance(senderEntry.balance);
        if (senderBalance === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Invalid sender balance.", node.from.key)
            return null;
        }

        if (!senderBalance.greaterThanOrEquals(totalDeductedAmount)) {
            this.#repository.safeLog(OperationType.TRANSFER, "Insufficient sender balance.", node.from.key)
            return Status.IGNORE;
        }

        const newSenderBalance = senderBalance.sub(totalDeductedAmount);
        if (newSenderBalance === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Failed to apply fee to sender node balance.", node.from.key)
            return null;
        }

        const updatedSenderEntry = newSenderBalance.update(senderEntryBuffer);
        if (updatedSenderEntry === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Failed to update sender node balance.", node.from.key)
            return null;
        }

        const result = {
            senderEntry: updatedSenderEntry,
            recipientEntry: null,
            validatorEntry: null,
        };

        if (!isSelfTransfer && !isRecipientValidator) {
            const recipientEntryBuffer = await this.#repository.getEntry(recipientAddressString, batch);
            if (recipientEntryBuffer === null) {
                if (transferAmount.value === null) {
                    this.#repository.safeLog(OperationType.TRANSFER, "Invalid transfer amount.", node.from.key)
                    return null;
                };
                const newRecipientEntry = nodeEntryUtils.init(
                    ZERO_WK,
                    nodeRoleUtils.NodeRole.READER,
                    transferAmount.value
                );
                if (newRecipientEntry.length === 0) {
                    this.#repository.safeLog(OperationType.TRANSFER, "Invalid recipient entry.", node.from.key)
                    return null;
                };
                result.recipientEntry = newRecipientEntry;
            } else {
                const recipientEntry = nodeEntryUtils.decode(recipientEntryBuffer);
                if (recipientEntry === null) {
                    this.#repository.safeLog(OperationType.TRANSFER, "Invalid recipient entry.", node.from.key)
                    return null;
                };

                const recipientBalance = toBalance(recipientEntry.balance);
                if (recipientBalance === null) {
                    this.#repository.safeLog(OperationType.TRANSFER, "Invalid recipient balance.", node.from.key)
                    return null;
                };

                const newRecipientBalance = recipientBalance.add(transferAmount);
                if (newRecipientBalance === null) {
                    this.#repository.safeLog(OperationType.TRANSFER, "Failed to transfer amount to recipient balance.", node.from.key)
                    return null;
                };

                const updatedRecipientEntry = newRecipientBalance.update(recipientEntryBuffer);
                if (updatedRecipientEntry === null) {
                    this.#repository.safeLog(OperationType.TRANSFER, "Failed to update recipient node balance.", node.from.key)
                    return null;
                };
                result.recipientEntry = updatedRecipientEntry;
            }
        }

        const validatorEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (validatorEntry === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Invalid validator entry.", node.from.key)
            return null;
        }

        const validatorBalance = toBalance(validatorEntry.balance);
        if (validatorBalance === null) return null;

        const validatorReward = feeAmount.percentage(PERCENT_75);
        if (validatorReward === null) return null;

        const newValidatorBalance = isRecipientValidator
            ? validatorBalance.add(transferAmount).add(validatorReward)
            : validatorBalance.add(validatorReward);

        if (newValidatorBalance === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Failed to transfer fee to validator balance.", node.from.key)
            return null;
        }

        const updatedValidatorEntry = newValidatorBalance.update(validatorEntryBuffer);
        if (updatedValidatorEntry === null) {
            this.#repository.safeLog(OperationType.TRANSFER, "Failed to update validator node balance.", node.from.key)
            return null;
        }

        result.validatorEntry = updatedValidatorEntry;

        if (isRecipientValidator) {
            result.recipientEntry = updatedValidatorEntry;
        }

        return result;
    }
}

export default ApplyState;
