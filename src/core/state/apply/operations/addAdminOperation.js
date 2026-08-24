import b4a from 'b4a';
import {
    ADMIN_INITIAL_BALANCE,
    EntryType,
    OperationType,
    ADMIN_INITIAL_STAKED_BALANCE,
} from '../../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import {
} from '../../../../codecs/apply/applyOperationCodec.js';
import {
    createMessage,
    NULL_BUFFER,
    safeWriteUInt32BE,
} from '../../../../utils/buffer.js';
import addressUtils from '../../utils/address.js';
import nodeEntryUtils from '../../utils/nodeEntry.js';
import adminEntryUtils from '../../utils/adminEntry.js';
import nodeRoleUtils from '../../utils/roles.js';
import {
} from '../../utils/balance.js';
import { Status } from '../../utils/transaction.js';
import {
} from '../../../../codecs/consensus/v1/vdfConfigCodec.js';

class AddAdminHandler {
    #repo;
    #config;
    #stateValidationSchema;

    constructor(repo, config, stateValidationSchema) {
        this.#repo = repo;
        this.#config = config;
        this.#stateValidationSchema = stateValidationSchema;
    }

    canHandle(operation) {
        return operation.type === OperationType.ADD_ADMIN;
    }

    async performOperation(op, view, base, node, batch) {
        /*
            ADD ADMIN OPERATION INITIALIZES THE NETWORK. THIS OPERATION CAN BE PERFORMED ONLY ONCE, AND THE NETWORK CREATOR
            DOES NOT HAVE TO PAY A FEE IN THIS CASE. ATTENTION: IF ANY VALIDATOR ATTEMPTS THIS OPERATION AFTER THE NETWORK
            INITIALIZATION, THEIR STAKED BALANCE WILL BE REDUCED (PUNISHMENT).
        */

        if (!this.#stateValidationSchema.validateCoreAdminOperation(op)) {
            this.#repo.safeLog(OperationType.ADD_ADMIN, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the requester address (admin)
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer, this.#config.addressPrefix);
        if (adminAddressString === null) {
            this.#repo.safeLog(OperationType.ADD_ADMIN, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        };

        // Validate requester admin public key (admin)
        const adminPublicKey = tracCryptoApi.address.decodeSafe(adminAddressString);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.ADD_ADMIN, "Error while decoding requester public key.", node.from.key)
            return Status.FAILURE;
        };

        // Check if the operation is being performed by the bootstrap node - the original deployer of the Trac Network
        if (!b4a.equals(node.from.key, this.#config.bootstrap) || !b4a.equals(op.cao.iw, this.#config.bootstrap)) {
            this.#repo.safeLog(OperationType.ADD_ADMIN, "Node is not a bootstrap node.", node.from.key)
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
            this.#repo.safeLog(OperationType.ADD_ADMIN, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        const hash = await tracCryptoApi.hash.blake3Safe(requesterMessage);
        if (!b4a.equals(hash, op.cao.tx)) {
            this.#repo.safeLog(OperationType.ADD_ADMIN, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        // verify signature
        const isMessageVerified = tracCryptoApi.signature.verify(op.cao.is, op.cao.tx, adminPublicKey)
        const txHashHexString = op.cao.tx.toString('hex');
        if (!isMessageVerified) {
            this.#repo.safeLog(OperationType.ADD_ADMIN, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repo.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repo.safeLog(OperationType.ADD_ADMIN, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.cao.txv, indexersSequenceState)) {
            this.#repo.safeLog(OperationType.ADD_ADMIN, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // Operation will be performed only once, for consistency check verify that the writer key does not exist
        // writer key should NOT exists for a brand new admin
        const writerKeyHasBeenRegistered = await this.#repo.getRegisteredWriterKey(batch, op.cao.iw.toString('hex'))
        if (writerKeyHasBeenRegistered !== null) {
            this.#repo.safeLog(OperationType.ADD_ADMIN, "Writer key already exists.", node.from.key)
            return Status.FAILURE;
        };

        const adminEntryExists = await this.#repo.getEntry(EntryType.ADMIN, batch);
        // if admin entry already exists, cannot perform this operation
        if (adminEntryExists !== null) {
            this.#repo.safeLog(OperationType.ADD_ADMIN, "Admin entry already exists.", node.from.key)
            return Status.FAILURE;
        };

        // Check if the operation has already been applied
        const opEntry = await this.#repo.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repo.safeLog(OperationType.ADD_ADMIN, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        const { newLicenseLength, decodedNewLicenseLength } = await this.#repo.assignNewLicense(batch);
        if (newLicenseLength !== null && decodedNewLicenseLength) {
            await batch.put(EntryType.LICENSE_COUNT, newLicenseLength)
            await batch.put(EntryType.LICENSE_INDEX + decodedNewLicenseLength, adminAddressBuffer)
        } else {
            // This log should (if this error ever happend) ALWAYS log.
            this.#repo.safeLog("SYSTEM ERROR", "Something went wrong while updating license index.", node.from.key)
        }

        const initializedNodeEntry = nodeEntryUtils.init(op.cao.iw, nodeRoleUtils.NodeRole.INDEXER, ADMIN_INITIAL_BALANCE, newLicenseLength, ADMIN_INITIAL_STAKED_BALANCE);
        if (initializedNodeEntry.length === 0) {
            this.#repo.safeLog(OperationType.ADD_ADMIN, "Failed to initialize node entry.", node.from.key)
            return Status.FAILURE;
        }

        // Create a new admin entry
        const newAdminEntry = adminEntryUtils.encode(adminAddressBuffer, op.cao.iw, this.#config.addressPrefix);
        if (newAdminEntry.length === 0) {
            this.#repo.safeLog(OperationType.ADD_ADMIN, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        await batch.put(adminAddressString, initializedNodeEntry);
        await batch.put(EntryType.WRITER_ADDRESS + op.cao.iw.toString('hex'), op.address);

        const { length, incrementedLength } = await this.#repo.updateWritersIndex(batch);

        if (length !== null && incrementedLength !== null) {
            // Update the writers index and length entries  
            await batch.put(EntryType.WRITERS_INDEX + length, adminAddressBuffer);
            await batch.put(EntryType.WRITERS_LENGTH, incrementedLength);
        } else {
            // This log should (if this error ever happend) ALWAYS log.
            this.#repo.safeLog("SYSTEM ERROR", "Something went wrong while updating writers index.", node.from.key)
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


}

export default AddAdminHandler;
