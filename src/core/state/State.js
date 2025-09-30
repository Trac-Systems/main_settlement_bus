import ReadyResource from 'ready-resource';
import Autobase from 'autobase';
import Hyperbee from 'hyperbee';
import b4a from 'b4a';
import {
    ACK_INTERVAL,
    ADMIN_INITIAL_BALANCE,
    EntryType,
    OperationType,
    AUTOBASE_VALUE_ENCODING,
    HYPERBEE_KEY_ENCODING,
    HYPERBEE_VALUE_ENCODING,
    BATCH_SIZE,
    ADMIN_INITIAL_STAKED_BALANCE
} from '../../utils/constants.js';
import { isHexString, sleep } from '../../utils/helpers.js';
import PeerWallet from 'trac-wallet';
import Check from '../../utils/check.js';
import { safeDecodeApplyOperation } from '../../utils/protobuf/operationHelpers.js';
import { createMessage, ZERO_WK } from '../../utils/buffer.js';
import addressUtils from './utils/address.js';
import adminEntryUtils from './utils/adminEntry.js';
import nodeEntryUtils, { setWritingKey, ZERO_BALANCE, NODE_ENTRY_SIZE } from './utils/nodeEntry.js';
import nodeRoleUtils from './utils/roles.js';
import lengthEntryUtils from './utils/lengthEntry.js';
import transactionUtils from './utils/transaction.js';
import { blake3Hash } from '../../utils/crypto.js';
import {
    BALANCE_FEE,
    toBalance,
    PERCENT_75,
    PERCENT_50,
    PERCENT_25,
    BALANCE_TO_STAKE,
    BALANCE_ZERO,
    BALANCE_PENEALTY
} from './utils/balance.js';
import { safeWriteUInt32BE } from '../../utils/buffer.js';
import deploymentEntryUtils from './utils/deploymentEntry.js';
import { deepCopyBuffer } from '../../utils/buffer.js';

class State extends ReadyResource {
    #base;
    #bee;
    #bootstrap;
    #store;
    #wallet;
    #enable_txlogs;
    #writingKey;

    constructor(store, bootstrap, wallet, options = {}) {
        super();

        this.#store = store;
        this.#bootstrap = bootstrap;
        this.#wallet = wallet;
        this.#enable_txlogs = options.enable_txlogs === true;

        this.check = new Check();
        this.#base = new Autobase(this.#store, this.#bootstrap, {
            ackInterval: ACK_INTERVAL,
            valueEncoding: AUTOBASE_VALUE_ENCODING,
            open: this.#setupHyperbee.bind(this),
            apply: this.#apply.bind(this),
        })
    }

    get base() {
        return this.#base;
    }

    get writingKey() {
        return this.#writingKey;
    }

    get bootstrap() {
        return this.#bootstrap;
    }

    async _open() {
        console.log("State initialization...")
        await this.#base.ready();
        this.#writingKey = this.#base.local.key;
    }

    async _close() {
        console.log("State: closing gracefully...");
        if (this.#bee !== null) {
            await this.#bee.close();
        }
        await sleep(100);

        if (this.#base !== null) {
            await this.#base.close();
        }
        await sleep(100);

    }

    isWritable() {
        return this.#base.writable;
    }

    isIndexer() {
        return this.#base.isIndexer;
    }

    getUnsignedLength() {
        return this.#base.view.core.length;
    }

    getSignedLength() {
        return this.#base.view.core.signedLength;
    }

    getFee() {
        return transactionUtils.FEE;
    }

    async get(key) {
        const result = await this.#base.view.get(key);
        if (result === null) return null;
        return result.value;
    }

    async getSigned(key) {
        const view_session = this.#base.view.checkout(this.#base.view.core.signedLength);
        const result = await view_session.get(key);
        if (result === null) return null;
        return result.value;
    }

    async getAdminEntry() {
        const adminEntry = await this.getSigned(EntryType.ADMIN);
        return adminEntry ? adminEntryUtils.decode(adminEntry) : null;
    }

    async getNodeEntry(address) {
        const nodeEntry = await this.getSigned(address);
        return nodeEntry ? nodeEntryUtils.decode(nodeEntry) : null;
    }

    async getUnsignedNodeEntry(address) {
        const nodeEntry = await this.get(address);
        return nodeEntry ? nodeEntryUtils.decode(nodeEntry) : null;
    }

    async isAddressWhitelisted(address) {
        const nodeEntry = await this.getNodeEntry(address);
        if (nodeEntry === null) return false;
        return !!nodeEntry.isWhitelisted;
    }

    async isAddressWriter(address) {
        const nodeEntry = await this.getNodeEntry(address);
        if (nodeEntry === null) return false;
        return !!nodeEntry.isWriter;
    }

    async isAddressIndexer(address) {
        const nodeEntry = await this.getNodeEntry(address);
        if (nodeEntry === null) return false;
        return !!nodeEntry.isIndexer;
    }

    async getIndexersEntry() {
        const indexersEntry = Object.values(this.#base.system.indexers);
        return indexersEntry
    }

    async isWkInIndexersEntry(wk) {
        if (wk === null) return false;
        const indexerListHasWk = Object.values(this.#base.system.indexers)
            .some(entry => b4a.equals(entry.key, wk));
        return indexerListHasWk;
    }

    async getWriterLength() {
        const writersLength = await this.getSigned(EntryType.WRITERS_LENGTH);
        return writersLength ? lengthEntryUtils.decodeBE(writersLength) : null;
    }

    // Not using it, but figured it might spark an idea for a cli command for licenses count or some util.
    async getLicenseCount() {
        const licenseLength = await this.getSigned(EntryType.LICENSE_COUNT);
        return licenseLength ? lengthEntryUtils.decodeBE(licenseLength) : null;
    }

    async getWriterIndex(index) {
        if (index < 0 || index > Number.MAX_SAFE_INTEGER) return null;
        const writerPublicKey = await this.getSigned(EntryType.WRITERS_INDEX + index);
        return writerPublicKey ? writerPublicKey : null;
    }

    async getRegisteredBootstrapEntry(bootstrap) {
        if (!bootstrap || !isHexString(bootstrap) || bootstrap.length !== 64) return null;
        return await this.get(EntryType.DEPLOYMENT + bootstrap);

    }

    async append(payload) {
        await this.#base.append(payload);
    }

    async getIndexerSequenceState() {
        const buf = []
        for (const indexer of Object.values(this.#base.system.indexers)) {
            buf.push(indexer.key);
        }
        return await blake3Hash(b4a.concat(buf));
    }

    async isInitalizationDisabled() {
        // Retrieve the flag to verify if initialization is allowed
        let initialization = await this.getSigned(EntryType.INITIALIZATION);

        if (null === initialization) {
            return false
        } else {
            return b4a.equals(initialization, safeWriteUInt32BE(0, 0))
        }
    }

    async confirmedTransactionsBetween(startSignedLength, endSignedLength) {
        // 1. Check for integer numbers
        if (!Number.isInteger(startSignedLength) || !Number.isInteger(endSignedLength)) {
            throw new Error("Params must be integer");
        }

        // 2. Ensure non-negative numbers
        if (startSignedLength < 0 || endSignedLength < 0) {
            throw new Error("Params must be non-negative");
        }

        // 3. Handle invalid range and the case where start and end are the same
        if (startSignedLength > endSignedLength) {
            throw new Error("endSignedLength must be greater than or equal to startSignedLength");
        }

        // 4. If the range is empty (start and end are the same), return an empty array
        if (startSignedLength === endSignedLength) return [];

        const currentSignedLength = this.getSignedLength();
        const signedLength2End = Math.min(currentSignedLength, endSignedLength);

        const startSeq = startSignedLength;
        const endSeq = signedLength2End - 1;

        if (startSeq > endSeq) {
            throw new Error("Invalid range");
        }

        const historyStream = this.#base.view.createHistoryStream({
            gte: startSeq,
            lte: endSeq
        });

        const filters = (entry) => {
            const isPut = entry.type === "put";
            const isHex = isHexString(entry.key);
            const is64 = entry.key.length === 64;
            return isPut && isHex && is64;
        }

        let hashes = [];
        for await (const entry of historyStream) {
            if (filters(entry)) {
                hashes.push(entry.key);
            }
        }

        return hashes;
    }

    #setupHyperbee(store) {
        this.#bee = new Hyperbee(store.get('view'), {
            extension: false,
            keyEncoding: HYPERBEE_KEY_ENCODING,
            valueEncoding: HYPERBEE_VALUE_ENCODING
        })
        return this.#bee;
    }

    // ATTENTION: DO NOT USE METHODS ABOVE IN APPLY PART!
    ///////////////////////////////APPLY////////////////////////////////////

    async #apply(nodes, view, base) {
        const batch = view.batch();
        for (const node of nodes) {
            const op = safeDecodeApplyOperation(node.value);
            if (b4a.byteLength(node.value) > transactionUtils.MAXIMUM_OPERATION_PAYLOAD_SIZE) {
                this.#enable_txlogs && this.#safeLogApply("Node payload exceeds the maximum operation payload size.", node.from.key)
                return;
            };

            const handler = this.#getApplyOperationHandler(op.type);
            if (handler) {
                await handler(op, view, base, node, batch);
            } else {
                this.#enable_txlogs && this.#safeLogApply("Unknown operation type.", node.from.key)
            }
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
        };
        return handlers[type] || null;
    }

    async #handleApplyInitializeBalanceOperation(op, view, base, node, batch) {
        if (!this.check.validateBalanceInitialization(op)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BALANCE_INITIALIZATION, "Contract schema validation failed.", node.from.key)
            return;
        };

        // Extract and validate the requester network address
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer);
        if (adminAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BALANCE_INITIALIZATION, "Requester address is invalid.", node.from.key)
            return;
        }

        // Verify requester admin public key
        const requesterAdminPublicKey = PeerWallet.decodeBech32mSafe(adminAddressString);
        if (requesterAdminPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BALANCE_INITIALIZATION, "Error while decoding requester public key.", node.from.key)
            return;
        };

        // Validate recipient address
        const recipientAddress = op.bio.ia;
        const recipientAddressString = addressUtils.bufferToAddress(recipientAddress);
        if (recipientAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BALANCE_INITIALIZATION, "Recipient address is invalid.", node.from.key)
            return;
        };

        // Validate recipient public key
        const recipientPublicKey = PeerWallet.decodeBech32mSafe(recipientAddressString);
        if (recipientPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BALANCE_INITIALIZATION, "Failed to decode recipient public key.", node.from.key)
            return;
        };

        // Verify that the amount is not zero
        const amount = toBalance(op.bio.am);
        if (amount == null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BALANCE_INITIALIZATION, "Invalid balance.", node.from.key)
            return;
        };

        // Entry has been disabled so there is nothing to do
        if (await this.#isApplyInitalizationDisabled(batch)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BALANCE_INITIALIZATION, "Balance initialization is disabled.", node.from.key)
            return;
        };

        // Ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);

        // NOTE: Would it make sense to extract null === decodedAdminEntry and log the error?
        if (null === decodedAdminEntry || !this.#isAdminApply(decodedAdminEntry, node)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BALANCE_INITIALIZATION, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return;
        };

        const adminPublicKey = PeerWallet.decodeBech32mSafe(decodedAdminEntry.address);
        if (adminPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BALANCE_INITIALIZATION, "Failed to decode admin public key.", node.from.key)
            return;
        };

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterAdminPublicKey)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BALANCE_INITIALIZATION, "System admin and node public keys do not match.", node.from.key)
            return;
        }

        // Recreate requester message
        const message = createMessage(op.address, op.bio.txv, op.bio.in, op.bio.ia, amount.value, OperationType.BALANCE_INITIALIZATION);
        if (message.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BALANCE_INITIALIZATION, "Invalid requester message.", node.from.key)
            return;
        };

        const hash = await blake3Hash(message);
        const txHashHexString = op.bio.tx.toString('hex');
        if (!b4a.equals(hash, op.bio.tx)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BALANCE_INITIALIZATION, "Message hash does not match the tx_hash.", node.from.key)
            return;
        };

        // Verify signature
        const isMessageVerifed = this.#wallet.verify(op.bio.is, hash, adminPublicKey);
        if (!isMessageVerifed) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BALANCE_INITIALIZATION, "Failed to verify message signature.", node.from.key)
            return;
        };

        // Verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BALANCE_INITIALIZATION, "Indexer sequence state is invalid.", node.from.key)
            return;
        };

        if (!b4a.equals(op.bio.txv, indexersSequenceState)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BALANCE_INITIALIZATION, "Transaction was not executed.", node.from.key)
            return;
        };

        // Check if the operation has already been applied
        const opEntry = await this.#getEntryApply(txHashHexString, batch);
        if (null !== opEntry) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BALANCE_INITIALIZATION, "Operation has already been applied.", node.from.key)
            return;
        };

        const initializedNodeEntry = nodeEntryUtils.init(ZERO_WK, nodeRoleUtils.NodeRole.READER, amount.value)
        await batch.put(recipientAddressString, initializedNodeEntry);
        await batch.put(txHashHexString, node.value);
    }

    async #handleApplyDisableBalanceInitializationOperation(op, view, base, node, batch) {
        if (!this.check.validateCoreAdminOperation(op)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.DISABLE_INITIALIZATION, "Schema validation failed.", node.from.key)
            return;
        };

        // Entry has been disabled so there is nothing to do
        if (await this.#isApplyInitalizationDisabled(batch)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.DISABLE_INITIALIZATION, "Balance initialization already disabled.", node.from.key)
            return;
        };

        // Extract and validate the network address
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer);
        if (adminAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.DISABLE_INITIALIZATION, "Failed to validate requester address.", node.from.key)
            return;
        };

        // Validate requester admin public key
        const requesterAdminPublicKey = PeerWallet.decodeBech32mSafe(adminAddressString);
        if (requesterAdminPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.DISABLE_INITIALIZATION, "Failed to decode requester public key.", node.from.key)
            return;
        };

        // Ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);

        if (null === decodedAdminEntry || !this.#isAdminApply(decodedAdminEntry, node)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.DISABLE_INITIALIZATION, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return;
        };

        const adminPublicKey = PeerWallet.decodeBech32mSafe(decodedAdminEntry.address);
        if (adminPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.DISABLE_INITIALIZATION, "Failed to decode admin public key.", node.from.key)
            return;
        };

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterAdminPublicKey)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.DISABLE_INITIALIZATION, "System admin and node public keys do not match.", node.from.key)
            return;
        };

        // Recreate requester message
        const message = createMessage(op.address, op.cao.txv, op.cao.iw, op.cao.in, OperationType.DISABLE_INITIALIZATION);
        if (message.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.DISABLE_INITIALIZATION, "Invalid requester message.", node.from.key)
            return;
        };

        const hash = await blake3Hash(message);
        const txHashHexString = op.cao.tx.toString('hex');
        if (!b4a.equals(hash, op.cao.tx)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.DISABLE_INITIALIZATION, "Message hash does not match the tx_hash.", node.from.key)
            return;
        };

        // Verify signature
        const isMessageVerifed = this.#wallet.verify(op.cao.is, hash, adminPublicKey);
        if (!isMessageVerifed) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.DISABLE_INITIALIZATION, "Failed to verify message signature.", node.from.key)
            return;
        };

        // Verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.DISABLE_INITIALIZATION, "Indexer sequence state is invalid.", node.from.key)
            return;
        };

        if (!b4a.equals(op.cao.txv, indexersSequenceState)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.DISABLE_INITIALIZATION, "Transaction was not executed.", node.from.key)
            return;
        };

        // Check if the operation has already been applied
        const opEntry = await this.#getEntryApply(txHashHexString, batch);
        if (null !== opEntry) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.DISABLE_INITIALIZATION, "Operation has already been applied.", node.from.key)
            return;
        };

        await batch.put(EntryType.INITIALIZATION, safeWriteUInt32BE(0, 0));
        await batch.put(txHashHexString, node.value);
    }

    async #handleApplyAddAdminOperation(op, view, base, node, batch) {
        /*
            ADD ADMIN OPERATION INITIALIZES THE NETWORK. THIS OPERATION CAN BE PERFORMED ONLY ONCE, AND THE NETWORK CREATOR
            DOES NOT HAVE TO PAY A FEE IN THIS CASE. ATTENTION: IF ANY VALIDATOR ATTEMPTS THIS OPERATION AFTER THE NETWORK
            INITIALIZATION, THEIR STAKED BALANCE WILL BE REDUCED (PUNISHMENT).
        */

        if (!this.check.validateCoreAdminOperation(op)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_ADMIN, "Contract schema validation failed.", node.from.key)
            return;
        };

        // Extract and validate the requester address (admin)
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer);
        if (adminAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_ADMIN, "Requester address is invalid.", node.from.key)
            return;
        };

        // Validate requester admin public key (admin)
        const adminPublicKey = PeerWallet.decodeBech32mSafe(adminAddressString);
        if (adminPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_ADMIN, "Error while decoding requester public key.", node.from.key)
            return;
        };

        // Check if the operation is being performed by the bootstrap node - the original deployer of the Trac Network
        if (!b4a.equals(node.from.key, this.#bootstrap) || !b4a.equals(op.cao.iw, this.#bootstrap)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_ADMIN, "Node is not a bootstrap node.", node.from.key)
            return;
        };

        // recreate requester message
        const requesterMessage = createMessage(
            adminAddressBuffer,
            op.cao.txv,
            op.cao.iw,
            op.cao.in,
            OperationType.ADD_ADMIN
        );

        if (requesterMessage.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_ADMIN, "Invalid requester message.", node.from.key)
            return;
        };

        const hash = await blake3Hash(requesterMessage);
        if (!b4a.equals(hash, op.cao.tx)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_ADMIN, "Message hash does not match the tx_hash.", node.from.key)
            return;
        };

        // verify signature
        const isMessageVerifed = this.#wallet.verify(op.cao.is, op.cao.tx, adminPublicKey)
        const txHashHexString = op.cao.tx.toString('hex');
        if (!isMessageVerifed) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_ADMIN, "Failed to verify message signature.", node.from.key)
            return;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_ADMIN, "Indexer sequence state is invalid.", node.from.key)
            return;
        };

        if (!b4a.equals(op.cao.txv, indexersSequenceState)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_ADMIN, "Transaction was not executed.", node.from.key)
            return;
        };

        // Operation will be performed only once, for consistency check verify that the writer key does not exist
        // writer key should NOT exists for a brand new admin
        const writerKeyHasBeenRegistered = await this.#getRegisteredWriterKeyApply(batch, op.cao.iw.toString('hex'))
        if (writerKeyHasBeenRegistered !== null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_ADMIN, "Writer key already exists.", node.from.key)
            return;
        };

        const adminEntryExists = await this.#getEntryApply(EntryType.ADMIN, batch);
        // if admin entry already exists, cannot perform this operation
        if (adminEntryExists !== null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_ADMIN, "Admin entry already exists.", node.from.key)
            return;
        };

        // Check if the operation has already been applied
        const opEntry = await this.#getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_ADMIN, "Operation has already been applied.", node.from.key)
            return;
        };
                
        const newLicense = await this.#applyAssignNewLicense(batch, adminAddressBuffer);
        const initializedNodeEntry = nodeEntryUtils.init(op.cao.iw, nodeRoleUtils.NodeRole.INDEXER, ADMIN_INITIAL_BALANCE, newLicense, ADMIN_INITIAL_STAKED_BALANCE);
        if (initializedNodeEntry.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_ADMIN, "Failed to initialize node entry.", node.from.key)
            return;
        }

        // Create a new admin entry
        const newAdminEntry = adminEntryUtils.encode(adminAddressBuffer, op.cao.iw);
        if (newAdminEntry.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_ADMIN, "Failed to verify message signature.", node.from.key)
            return;
        };

        await batch.put(adminAddressString, initializedNodeEntry);
        await batch.put(EntryType.WRITER_ADDRESS + op.cao.iw.toString('hex'), op.address);
        await this.#updateWritersIndex(adminAddressBuffer, batch);

        // initialize admin entry and initialization flag
        await batch.put(EntryType.ADMIN, newAdminEntry);
        await batch.put(txHashHexString, node.value);
        await batch.put(EntryType.INITIALIZATION, safeWriteUInt32BE(1, 0));

        console.log(`Admin added addr:wk:tx - ${adminAddressString}:${op.cao.iw.toString('hex')}:${txHashHexString}`);
    }

    async #handleApplyAdminRecoveryOperation(op, view, base, node, batch) {
        if (!this.check.validateRoleAccessOperation(op)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Contract schema validation failed.", node.from.key)
            return;
        };

        // Extract and validate the requester address and pubkey
        const requesterAdminAddressBuffer = op.address;
        const requesterAdminAddressString = addressUtils.bufferToAddress(requesterAdminAddressBuffer);
        if (requesterAdminAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Requester address is invalid.", node.from.key)
            return;
        };

        const requesterAdminPublicKey = PeerWallet.decodeBech32mSafe(requesterAdminAddressString);
        if (requesterAdminPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Error while decoding requester public key.", node.from.key)
            return;
        };

        // recreate requester message
        const requesterMessage = createMessage(
            op.address,
            op.rao.txv,
            op.rao.iw,
            op.rao.in,
            OperationType.ADMIN_RECOVERY
        );

        if (requesterMessage.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Invalid requester message.", node.from.key)
            return;
        };

        const hash = await blake3Hash(requesterMessage);
        if (!b4a.equals(hash, op.rao.tx)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Message hash does not match the tx_hash.", node.from.key)
            return;
        };

        // verify requester signature
        const isRequesterMessageVerifed = this.#wallet.verify(op.rao.is, op.rao.tx, requesterAdminPublicKey);
        const txHashHexString = op.rao.tx.toString('hex');
        if (!isRequesterMessageVerifed) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to verify requester message signature.", node.from.key)
            return;
        };

        // Extract and validate the validator address and pubkey
        const validatorAddress = op.rao.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddress);
        if (validatorAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to validate validator address.", node.from.key)
            return;
        };

        const validatorPublicKey = PeerWallet.decodeBech32mSafe(validatorAddressString);
        if (validatorPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to decode validator public key.", node.from.key)
            return;
        };

        // recreate validator message
        const validatorMessage = createMessage(
            op.rao.tx,
            op.rao.va,
            op.rao.vn,
            OperationType.ADMIN_RECOVERY
        );

        if (validatorMessage.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to verify validator message signature.", node.from.key)
            return;
        };

        // verify validator signature
        const validatorHash = await blake3Hash(validatorMessage);
        const isValidatorMessageVerifed = this.#wallet.verify(op.rao.vs, validatorHash, validatorPublicKey);
        if (!isValidatorMessageVerifed) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to verify message signature.", node.from.key)
            return;
        };

        // The writer key must NOT be linked to any address since this is an ADMIN recovery.
        // Until the next release with indexer rotation, we simply enforce the new writer key.
        const writerKeyHasBeenRegistered = await this.#getRegisteredWriterKeyApply(batch, op.rao.iw.toString('hex'))
        if (writerKeyHasBeenRegistered !== null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Writer key already exists.", node.from.key)
            return;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Indexer sequence state is invalid.", node.from.key)
            return;
        };
        if (!b4a.equals(op.rao.txv, indexersSequenceState)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Transaction was not executed.", node.from.key)
            return;
        };

        // anti-replay attack
        const opEntry = await this.#getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Operation has already been applied.", node.from.key)
            return;
        };

        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);

        if (decodedAdminEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to decode admin entry.", node.from.key)
            return;
        };
        const publicKeyAdminEntry = PeerWallet.decodeBech32mSafe(decodedAdminEntry.address);
        if (!b4a.equals(requesterAdminPublicKey, publicKeyAdminEntry)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Admin public key does not match the node public key.", node.from.key)
            return;
        };

        const isOldWkInIndexerList = await this.#isWriterKeyInIndexerListApply(decodedAdminEntry.wk, base);
        if (!isOldWkInIndexerList) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Old writer key is not in indexer list.", node.from.key)
            return;
        }; // Old admin wk is not in indexers entry

        // Update admin entry with new writing key
        const newAdminEntry = adminEntryUtils.encode(requesterAdminAddressBuffer, op.rao.iw);
        if (newAdminEntry.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Invalid admin entry.", node.from.key)
            return;
        };

        // Update node entry of the admin with new writing key
        const adminNodeEntry = await this.#getEntryApply(requesterAdminAddressString, batch);
        const newAdminNodeEntry = setWritingKey(adminNodeEntry, op.rao.iw)

        const isNewWkInIndexerList = await this.#isWriterKeyInIndexerListApply(op.rao.iw, base);
        if (isNewWkInIndexerList) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "New writer key is already in indexer list.", node.from.key)
            return;
        }; // New admin wk is already in indexers entry

        // charging fee from the requester (admin)
        const decodedAdminNodeEntry = nodeEntryUtils.decode(newAdminNodeEntry)
        if (decodedAdminNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to decode admin entry.", node.from.key)
            return;
        }

        const adminBalance = toBalance(decodedAdminNodeEntry.balance)
        if (adminBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Invalid admin balance.", node.from.key)
            return;
        }

        if (!adminBalance.greaterThanOrEquals(BALANCE_FEE)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Insufficient admin balance.", node.from.key)
            return;
        };
        const updatedFee = adminBalance.sub(BALANCE_FEE)

        if (updatedFee === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to apply fee.", node.from.key)
            return;
        }
        const chargedAdminEntry = updatedFee.update(newAdminNodeEntry)

        // Reward logic
        const validatorNodeEntryBuffer = await this.#getEntryApply(validatorAddressString, batch);
        if (validatorNodeEntryBuffer === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Invalid node entry buffer.", node.from.key)
            return;
        };

        const validatorNodeEntry = nodeEntryUtils.decode(validatorNodeEntryBuffer);
        if (validatorNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Invalid validator node entry.", node.from.key)
            return;
        };

        const validatorBalance = toBalance(validatorNodeEntry.balance);
        if (validatorBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Invalid validator balance.", node.from.key)
            return;
        };

        const newValidatorBalance = validatorBalance.add(BALANCE_FEE.percentage(PERCENT_75));
        if (newValidatorBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to transfer fee to validator.", node.from.key)
            return;
        };

        const updatedValidatorNodeEntry = newValidatorBalance.update(validatorNodeEntryBuffer)
        if (updatedValidatorNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADMIN_RECOVERY, "Failed to update validator balance.", node.from.key)
            return;
        };

        // Revoke old wk and add new one as an indexer
        await base.removeWriter(decodedAdminEntry.wk);
        await base.addWriter(op.rao.iw, { isIndexer: true });
        await batch.put(EntryType.WRITER_ADDRESS + op.rao.iw.toString('hex'), op.address);

        // Remove the old admin entry and add the new one
        await batch.put(EntryType.ADMIN, newAdminEntry);
        // This updates the admin node entry with the new writer key and deducted fee.
        await batch.put(requesterAdminAddressString, chargedAdminEntry);
        await batch.put(txHashHexString, node.value);

        // Actually pay the fee
        await batch.put(validatorAddressString, updatedValidatorNodeEntry);

        console.log(`Admin has been recovered addr:wk:tx - ${requesterAdminAddressString}:${op.rao.iw.toString('hex')}:${txHashHexString}`);
    }

    async #handleApplyAppendWhitelistOperation(op, view, base, node, batch) {
        if (!this.check.validateAdminControlOperation(op)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Contract schema validation failed.", node.from.key)
            return;
        };

        // Validate the recipient address
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer);
        if (adminAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Recipient address is invalid.", node.from.key)
            return;
        };
        // Validate recipient public key
        const requesterAdminPublicKey = PeerWallet.decodeBech32mSafe(adminAddressString);
        if (requesterAdminPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Failed to decode recipient public key.", node.from.key)
            return;
        };

        // Retrieve and decode the admin entry to verify the operation is initiated by an admin
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Failed to verify admin entry.", node.from.key)
            return;
        };
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (decodedAdminEntry === null || !this.#isAdminApply(decodedAdminEntry, node)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Failed to decode admin entry.", node.from.key)
            return;
        };

        // Extract admin entry
        const adminAddress = decodedAdminEntry.address;
        const adminPublicKey = PeerWallet.decodeBech32mSafe(adminAddress);
        if (adminPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Failed to decode admin public key.", node.from.key)
            return;
        };

        //admin consistency check
        if (!b4a.equals(adminPublicKey, requesterAdminPublicKey)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "System admin and node public keys do not match.", node.from.key)
            return;
        };

        // Extract and validate the network prefix from the node's address
        const nodeAddressBuffer = op.aco.ia;

        const nodeAddressString = addressUtils.bufferToAddress(nodeAddressBuffer);
        if (nodeAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Failed to verify node address.", node.from.key)
            return;
        };
        const nodePublicKey = PeerWallet.decodeBech32mSafe(nodeAddressString);
        if (nodePublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Failed to decode node public key.", node.from.key)
            return;
        };

        // verify signature createMessage(this.#address, this.#txValidity, this.#incomingAddress, nonce, this.#operationType);
        const message = createMessage(op.address, op.aco.txv, op.aco.ia, op.aco.in, OperationType.APPEND_WHITELIST);
        if (message.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Invalid requester message.", node.from.key)
            return;
        };

        // verify signature
        const hash = await blake3Hash(message);
        if (!b4a.equals(hash, op.aco.tx)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Message hash does not match the tx_hash.", node.from.key)
            return;
        };

        const isMessageVerified = this.#wallet.verify(op.aco.is, op.aco.tx, adminPublicKey);
        if (!isMessageVerified) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Failed to verify message signature.", node.from.key)
            return;
        };

        const hashHexString = op.aco.tx.toString('hex');

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Indexer sequence state is invalid.", node.from.key)
            return;
        };

        if (!b4a.equals(op.aco.txv, indexersSequenceState)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Transaction was not executed.", node.from.key)
            return;
        };

        // Check if the operation has already been applied
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (opEntry !== null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Operation has already been applied.", node.from.key)
            return;
        };

        // Retrieve the node entry to check its current role
        const nodeEntry = await this.#getEntryApply(nodeAddressString, batch);
        if (nodeEntryUtils.isWhitelisted(nodeEntry)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Node already whitelisted.", node.from.key)
            return;
        }; // Node is already whitelisted

        if (await this.#isApplyInitalizationDisabled(batch)) {
            // Fee
            const adminNodeEntry = await this.#getEntryApply(adminAddressString, batch);
            if (adminNodeEntry === null) {
                this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Failed to validate admin entry.", node.from.key)
                return;
            };

            const decodedNodeEntry = nodeEntryUtils.decode(adminNodeEntry)
            if (decodedNodeEntry === null) {
                this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Failed to decode admin entry.", node.from.key)
                return;
            };

            const adminBalance = toBalance(decodedNodeEntry.balance)
            if (adminBalance === null) {
                this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Invalid admin balance.", node.from.key)
                return;
            };

            if (!adminBalance.greaterThanOrEquals(BALANCE_FEE)) {
                this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Insufficient admin balance.", node.from.key)
                return;
            };
            const newAdminBalance = adminBalance.sub(BALANCE_FEE)

            if (newAdminBalance === null) {
                this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Failed to apply fee to admin balance.", node.from.key)
                return;
            };
            const updatedAdminEntry = newAdminBalance.update(adminNodeEntry)

            if (updatedAdminEntry === null) {
                this.#enable_txlogs && this.#safeLogApply(OperationType.APPEND_WHITELIST, "Failed to update admin entry.", node.from.key)
                return;
            };

            await batch.put(adminAddressString, updatedAdminEntry);
        }

        const newLicense = await this.#applyAssignNewLicense(batch, nodeAddressBuffer);

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
            const initializedNodeEntry = nodeEntryUtils.init(ZERO_WK, nodeRoleUtils.NodeRole.WHITELISTED, ZERO_BALANCE, newLicense);
            await batch.put(nodeAddressString, initializedNodeEntry);
            await batch.put(hashHexString, node.value);
        } else {
            // If the node entry exists, update its role to WHITELISTED. Case if account will buy license from market but it existed before - for example it had balance.
            // I assume since we dont have a marketplace now, that we by default assign a new license to any whitelisted node.
            const editedNodeEntry = nodeEntryUtils.setRole(nodeEntry, nodeRoleUtils.NodeRole.WHITELISTED);
            const nodeEntryWithNewLicense = nodeEntryUtils.setLicense(editedNodeEntry, newLicense)
            await batch.put(nodeAddressString, nodeEntryWithNewLicense);
            await batch.put(hashHexString, node.value);
        }
        // Only whitelisted node will be able to become a writer/indexer.

    }

    async #handleApplyAddWriterOperation(op, view, base, node, batch) {
        if (!this.check.validateRoleAccessOperation(op)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Contract schema validation failed.", node.from.key)
            return;
        };

        // Extract and validate the requester address
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer);
        if (requesterAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Requester address is invalid.", node.from.key)
            return;
        };

        const requesterPublicKey = PeerWallet.decodeBech32mSafe(requesterAddressString);
        if (requesterPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Error while decoding requester public key.", node.from.key)
            return;
        };

        // if node want to register ZERO_WK, then this is NOT ALLOWED
        if (b4a.equals(op.rao.iw, ZERO_WK)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Writer cannot initialize with zero-writer-key.", node.from.key)
            return;
        };

        // verify requester signature
        const requesterMessage = createMessage(
            op.address,
            op.rao.txv,
            op.rao.iw,
            op.rao.in,
            OperationType.ADD_WRITER
        );

        if (requesterMessage.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Invalid requester message.", node.from.key)
            return;
        };

        const hash = await blake3Hash(requesterMessage);
        if (!b4a.equals(hash, op.rao.tx)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Message hash does not match the tx_hash.", node.from.key)
            return;
        };

        const isRequesterMessageVerifed = this.#wallet.verify(op.rao.is, op.rao.tx, requesterPublicKey);
        const txHashHexString = op.rao.tx.toString('hex');
        if (!isRequesterMessageVerifed) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Failed to verify message signature.", node.from.key)
            return;
        };

        // verify validator signature
        const validatorAddress = op.rao.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddress);
        if (validatorAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Failed to validate validator address.", node.from.key)
            return;
        };

        // validate validator public key
        const validatorPublicKey = PeerWallet.decodeBech32mSafe(validatorAddressString);
        if (validatorPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Failed to decode validator public key.", node.from.key)
            return;
        };

        const validatorMessage = createMessage(
            op.rao.tx,
            op.rao.va,
            op.rao.vn,
            OperationType.ADD_WRITER
        );

        if (validatorMessage.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Invalid validator message.", node.from.key)
            return;
        };

        const validatorHash = await blake3Hash(validatorMessage);
        const isValidatorMessageVerifed = this.#wallet.verify(op.rao.vs, validatorHash, validatorPublicKey);
        if (!isValidatorMessageVerifed) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Failed to verify validator message signature.", node.from.key)
            return;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Indexer sequence state is invalid.", node.from.key)
            return;
        };

        if (!b4a.equals(op.rao.txv, indexersSequenceState)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Transaction was not executed.", node.from.key)
            return;
        };

        // anti-replay attack
        const opEntry = await this.#getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Operation has already been applied.", node.from.key)
            return;
        };

        await this.#addWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddressBuffer, validatorAddressString);
    }

    async #addWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddressBuffer, validatorAddressString) {
        // Retrieve the node entry for the given address, if null then do not process...
        const requesterNodeEntry = await this.#getEntryApply(requesterAddressString, batch);
        if (requesterNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Failed to verify requester node address.", node.from.key)
            return;
        };

        const decodedRequesterNodeEntry = nodeEntryUtils.decode(requesterNodeEntry)
        if (decodedRequesterNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Failed to decode node entry.", node.from.key)
            return;
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

        const writerKeyHasBeenRegistered = await this.#getRegisteredWriterKeyApply(batch, op.rao.iw.toString('hex'))
        if (writerKeyHasBeenRegistered !== null) {
            const isCurrentWk = b4a.equals(decodedRequesterNodeEntry.wk, op.rao.iw);
            const isOwner = b4a.equals(writerKeyHasBeenRegistered, requesterAddressBuffer);

            if (!isCurrentWk || !isOwner) {
                this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Invalid writer key: either not owned by requester or different from assigned key.", node.from.key)
                return;
            }
        }

        const isWhitelisted = decodedRequesterNodeEntry.isWhitelisted
        const isWriter = decodedRequesterNodeEntry.isWriter;
        const isIndexer = decodedRequesterNodeEntry.isIndexer;

        // To become a writer the node must be whitelisted and not already a writer or indexer
        if (isIndexer || isWriter || !isWhitelisted) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Node must be whitelisted, and cannot be a writer or an indexer.", node.from.key)
            return;
        };

        // Charging fee from the requester
        const requesterBalance = toBalance(decodedRequesterNodeEntry.balance)
        if (requesterBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Failed to verify requester balance.", node.from.key)
            return;
        };

        if (!requesterBalance.greaterThanOrEquals(BALANCE_FEE)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Insufficient requester balance.", node.from.key)
            return;
        };

        const updatedBalance = requesterBalance.sub(BALANCE_FEE) // Remove the fee
        if (updatedBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Failed to apply fee to node.", node.from.key)
            return;
        };

        // Update the node entry to assign the writer role and deduct the fee from the requester's balance
        const updatedRoleRequesterNodeEntry = nodeEntryUtils.setRoleAndWriterKey(requesterNodeEntry, nodeRoleUtils.NodeRole.WRITER, op.rao.iw);
        if (updatedRoleRequesterNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Failed to update node entry with a writer role.", node.from.key)
            return;
        };

        const chargedFeeRequesterNodeEntry = updatedBalance.update(updatedRoleRequesterNodeEntry)
        if (chargedFeeRequesterNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Failed to update node balance.", node.from.key)
            return;
        };

        // reward the validator
        const validatorEntry = await this.#getEntryApply(validatorAddressString, batch);
        if (validatorEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Failed to verify validator entry.", node.from.key)
            return;
        };

        const decodedValidatorEntry = nodeEntryUtils.decode(validatorEntry)
        if (decodedValidatorEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Failed to decode validator entry.", node.from.key)
            return;
        };

        const validatorBalance = toBalance(decodedValidatorEntry.balance)
        if (validatorBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Invalid validator balance.", node.from.key)
            return;
        };

        const updatedValidatorBalance = validatorBalance.add(BALANCE_FEE.percentage(PERCENT_75))
        if (updatedValidatorBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Failed to transfer fee to validator.", node.from.key)
            return;
        };

        const updatedValidatorEntry = updatedValidatorBalance.update(validatorEntry)
        if (updatedValidatorEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Failed to update validator entry.", node.from.key)
            return;
        };

        const finalRequesterNodeEntry = this.#stakeBalanceApply(chargedFeeRequesterNodeEntry, node);
        if (finalRequesterNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_WRITER, "Failed to stake balance for writer.", node.from.key)
            return;
        };

        // Add the writer role to the base and update the batch
        await base.addWriter(op.rao.iw, { isIndexer: false });
        await batch.put(requesterAddressString, finalRequesterNodeEntry);

        if (writerKeyHasBeenRegistered === null) {
            await batch.put(EntryType.WRITER_ADDRESS + op.rao.iw.toString('hex'), op.address);
        }

        await this.#updateWritersIndex(requesterAddressBuffer, batch);
        await batch.put(txHashHexString, node.value);

        // Pay the fee to the validator
        await batch.put(validatorAddressString, updatedValidatorEntry);
        console.log(`Writer added addr:wk:tx - ${requesterAddressString}:${op.rao.iw.toString('hex')}:${txHashHexString}`);
    }

    async #handleApplyRemoveWriterOperation(op, view, base, node, batch) {
        if (!this.check.validateRoleAccessOperation(op)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Contract schema validation failed.", node.from.key)
            return;
        };

        // Extract and validate the network address
        const requesterAddress = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddress);
        if (requesterAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Requester address is invalid.", node.from.key)
            return;
        };

        // Validate requester public key
        const requesterPublicKey = PeerWallet.decodeBech32mSafe(requesterAddressString);
        if (requesterPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Error while decoding requester public key.", node.from.key)
            return;
        };

        // verify requester signature
        const requesterMessage = createMessage(
            op.address,
            op.rao.txv,
            op.rao.iw,
            op.rao.in,
            OperationType.REMOVE_WRITER
        );
        if (requesterMessage.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Invalid requester message.", node.from.key)
            return;
        };

        // compare hashes
        const hash = await blake3Hash(requesterMessage);
        if (!b4a.equals(hash, op.rao.tx)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Message hash does not match the tx_hash.", node.from.key)
            return;
        };

        const isRequesterMessageVerifed = this.#wallet.verify(op.rao.is, op.rao.tx, requesterPublicKey);
        const txHashHexString = op.rao.tx.toString('hex');
        if (!isRequesterMessageVerifed) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Failed to verify message signature.", node.from.key)
            return;
        };

        // verify validator signature
        const validatorAddress = op.rao.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddress);
        if (validatorAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Failed to verify validator address.", node.from.key)
            return;
        };

        // validate validator public key
        const validatorPublicKey = PeerWallet.decodeBech32mSafe(validatorAddressString);
        if (validatorPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Failed to decode validator public key.", node.from.key)
            return;
        };

        const validatorMessage = createMessage(
            op.rao.tx,
            op.rao.va,
            op.rao.vn,
            OperationType.REMOVE_WRITER
        );
        if (validatorMessage.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Invalid validator message.", node.from.key)
            return;
        };

        const validatorHash = await blake3Hash(validatorMessage);
        const isValidatorMessageVerifed = this.#wallet.verify(op.rao.vs, validatorHash, validatorPublicKey);
        if (!isValidatorMessageVerifed) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Failed to verify validator message signature.", node.from.key)
            return;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Indexer sequence state is invalid.", node.from.key)
            return;
        };

        if (!b4a.equals(op.rao.txv, indexersSequenceState)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Transaction was not executed.", node.from.key)
            return;
        };

        // anti-replay attack
        const opEntry = await this.#getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Operation has already been applied.", node.from.key)
            return;
        };

        // Proceed to remove the writer role from the node
        await this.#removeWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddress, validatorAddressString);
    }

    async #removeWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddress, validatorAddressString) {

        // Fetch the node entry for the given address
        const requesterNodeEntry = await this.#getEntryApply(requesterAddressString, batch);
        if (requesterNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Failed to verify requester node entry.", node.from.key)
            return;
        };

        // Fetch the validator node entry to reward it later
        const validatorNodeEntry = await this.#getEntryApply(validatorAddressString, batch);
        if (validatorNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Failed to verify validator node entry.", node.from.key)
            return;
        };

        const decodedNodeEntry = nodeEntryUtils.decode(requesterNodeEntry);
        if (decodedNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Failed to decode requester node entry.", node.from.key)
            return;
        };

        // Check if the node is a writer or an indexer
        const isNodeWriter = decodedNodeEntry.isWriter;
        const isNodeIndexer = decodedNodeEntry.isIndexer;

        if (isNodeIndexer || !isNodeWriter) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Node has to be a writer, and cannot be an indexer.", node.from.key)
            return;
        };

        /**
         * Ensure that: 
         * 1) writer key exists in registry (we can not unregister something that was not registered), 
         * 2) matches the one in node entry , 
         * 3) belongs to the requester - this prevents unauthorized key removal
         */
        const writerKeyHasBeenRegistered = await this.#getRegisteredWriterKeyApply(batch, op.rao.iw.toString('hex'))
        if (writerKeyHasBeenRegistered === null ||
            !b4a.equals(op.rao.iw, decodedNodeEntry.wk) ||
            !b4a.equals(writerKeyHasBeenRegistered, requesterAddress)
        ) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Writer key must be registered, match node's current key, and belong to the requester.", node.from.key)
            return;
        }

        // Charging fee from the requester
        const requesterBalance = toBalance(decodedNodeEntry.balance);
        if (requesterBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Invalid requester balance.", node.from.key)
            return;
        };

        if (!requesterBalance.greaterThanOrEquals(BALANCE_FEE)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Insufficient requester balance.", node.from.key)
            return;
        };

        const updatedBalance = requesterBalance.sub(BALANCE_FEE);
        if (updatedBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Failed to apply fee to requester balance.", node.from.key)
            return;
        };

        // Downgrade role from WRITER to WHITELISTED and deduct the fee from the requester's balance
        const updatedNodeEntry = nodeEntryUtils.setRole(requesterNodeEntry, nodeRoleUtils.NodeRole.WHITELISTED);
        if (updatedNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Failed to update node entry role.", node.from.key)
            return;
        };
        const chargedNodeEntry = updatedBalance.update(updatedNodeEntry);
        if (chargedNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Failed to update node entry.", node.from.key)
            return;
        };

        // Validator reward logic 
        const decodedValidatorEntry = nodeEntryUtils.decode(validatorNodeEntry);
        if (decodedValidatorEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Failed to decode valdiator node entry.", node.from.key)
            return;
        };

        const validatorBalance = toBalance(decodedValidatorEntry.balance)
        if (validatorBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Invalid validator balance.", node.from.key)
            return;
        };

        const validatorNewBalance = validatorBalance.add(BALANCE_FEE.percentage(PERCENT_75))
        if (validatorNewBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Failed to transfer fee to validator balance.", node.from.key)
            return;
        };

        const updateValidatorEntry = validatorNewBalance.update(validatorNodeEntry)
        if (updateValidatorEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Failed to update validator balance.", node.from.key)
            return;
        };

        const finalRequesterNodeEntry = this.#withdrawStakedBalanceApply(chargedNodeEntry, node);
        if (finalRequesterNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_WRITER, "Failed to unstake balance for writer.", node.from.key)
            return;
        };

        // Remove the writer role and update the state
        await base.removeWriter(decodedNodeEntry.wk);
        await batch.put(requesterAddressString, finalRequesterNodeEntry);

        await batch.put(txHashHexString, node.value);
        // Reward the validator
        await batch.put(validatorAddressString, updateValidatorEntry);
        console.log(`Writer removed: addr:wk:tx - ${requesterAddressString}:${op.rao.iw.toString('hex')}:${txHashHexString}`);
    }

    async #handleApplyAddIndexerOperation(op, view, base, node, batch) {
        if (!this.check.validateAdminControlOperation(op)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Contract schema validation failed.", node.from.key)
            return;
        };

        // Extract and validate the requester address (admin)
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer);
        if (requesterAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Requester address is invalid.", node.from.key)
            return;
        };

        // Validate requester public key
        const requesterPublicKey = PeerWallet.decodeBech32mSafe(requesterAddressString);
        if (requesterPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Error while decoding requester public key.", node.from.key)
            return;
        };

        // Extract and validate pretending indexer address
        const pretendingAddressBuffer = op.aco.ia;
        const pretendingAddressString = addressUtils.bufferToAddress(pretendingAddressBuffer);
        if (pretendingAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Pretending indexer address is invalid.", node.from.key)
            return;
        };

        // Validate pretending indexer public key
        const pretentingPublicKey = PeerWallet.decodeBech32mSafe(pretendingAddressString);
        if (pretentingPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Failed to decode pretending indexer public key.", node.from.key)
            return;
        };

        // ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Invalid admin entry.", node.from.key)
            return;
        };

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (decodedAdminEntry === null || !this.#isAdminApply(decodedAdminEntry, node)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return;
        };

        // Extract admin public key 
        const adminPublicKey = PeerWallet.decodeBech32mSafe(decodedAdminEntry.address);
        if (adminPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Failed to decode admin public key.", node.from.key)
            return;
        };

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterPublicKey)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "System admin and node public keys do not match.", node.from.key)
            return;
        };

        // verify requester signature
        const message = createMessage(
            op.address,
            op.aco.txv,
            op.aco.ia,
            op.aco.in,
            OperationType.ADD_INDEXER
        );
        if (message.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Invalid requester message.", node.from.key)
            return;
        };

        const hash = await blake3Hash(message);
        if (!b4a.equals(hash, op.aco.tx)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Message hash does not match the tx_hash.", node.from.key)
            return;
        };

        const isMessageVerifed = this.#wallet.verify(op.aco.is, hash, adminPublicKey);
        const txHashHexString = hash.toString('hex');
        if (!isMessageVerifed) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Failed to verify message signature.", node.from.key)
            return;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Indexer sequence state is invalid.", node.from.key)
            return;
        };

        if (!b4a.equals(op.aco.txv, indexersSequenceState)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Transaction was not executed.", node.from.key)
            return;
        };

        // anti-replay attack
        const opEntry = await this.#getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Operation has already been applied.", node.from.key)
            return;
        };

        await this.#addIndexer(op, node, batch, base, txHashHexString, pretendingAddressString, requesterAddressString);
    }

    async #addIndexer(op, node, batch, base, txHashHexString, pretendingAddressString, requesterAddressString) {

        const pretenderNodeEntry = await this.#getEntryApply(pretendingAddressString, batch);
        if (pretenderNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Failed to verify pretender indexer entry.", node.from.key)
            return;
        };

        const decodedPretenderNodeEntry = nodeEntryUtils.decode(pretenderNodeEntry);
        if (decodedPretenderNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Failed to decode pretender indexer node entry.", node.from.key)
            return;
        };

        //check if node is allowed to become an indexer
        const isNodeWriter = nodeEntryUtils.isWriter(pretenderNodeEntry);
        const isNodeIndexer = nodeEntryUtils.isIndexer(pretenderNodeEntry);
        if (!isNodeWriter || isNodeIndexer) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Node must be a writer, and cannot already be an indexer.", node.from.key)
            return;
        };

        //update node entry to indexer
        const updatedNodeEntry = nodeEntryUtils.setRole(pretenderNodeEntry, nodeRoleUtils.NodeRole.INDEXER)
        if (updatedNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Failed to update node role.", node.from.key)
            return;
        };

        // ensure that the node wk does not exist in the indexer list
        const indexerListHasWk = await this.#isWriterKeyInIndexerListApply(decodedPretenderNodeEntry.wk, base);
        if (indexerListHasWk) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Writer key already exists in indexer list.", node.from.key)
            return;
        }; // Wk is already in indexer list (Node already indexer)

        // charge fee from the admin (requester)
        const feeAmount = toBalance(transactionUtils.FEE);
        if (feeAmount === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Invalid fee amount.", node.from.key)
            return;
        };

        const adminNodeEntryBuffer = await this.#getEntryApply(requesterAddressString, batch);
        if (adminNodeEntryBuffer === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Invalid requester node entry buffer.", node.from.key)
            return;
        };

        const adminNodeEntry = nodeEntryUtils.decode(adminNodeEntryBuffer);
        if (adminNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Failed to decode requester node entry.", node.from.key)
            return;
        };

        const adminBalance = toBalance(adminNodeEntry.balance);
        if (adminBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Invalid admin balance.", node.from.key)
            return;
        };

        if (!adminBalance.greaterThanOrEquals(feeAmount)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Insufficient requester balance.", node.from.key)
            return;
        };

        // 100% fee charged from admin will be burned
        const newAdminBalance = adminBalance.sub(feeAmount);
        if (newAdminBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Failed to apply fee to requester balance", node.from.key)
            return;
        };

        const updatedAdminNodeEntry = newAdminBalance.update(adminNodeEntryBuffer);
        if (updatedAdminNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.ADD_INDEXER, "Failed to update requester node.", node.from.key)
            return;
        };

        // set indexer role
        await base.removeWriter(decodedPretenderNodeEntry.wk);
        await base.addWriter(decodedPretenderNodeEntry.wk, { isIndexer: true })

        // change node entry to indexer and update admin balance after fee deduction
        await batch.put(pretendingAddressString, updatedNodeEntry);
        await batch.put(requesterAddressString, updatedAdminNodeEntry);

        // store operation hash to avoid replay attack.
        await batch.put(txHashHexString, node.value);

        console.log(`Indexer added addr:wk:tx - ${pretendingAddressString}:${decodedPretenderNodeEntry.wk.toString('hex')}:${txHashHexString}`);
    }

    async #handleApplyRemoveIndexerOperation(op, view, base, node, batch) {
        if (!this.check.validateAdminControlOperation(op)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Contract schema validation failed.", node.from.key)
            return;
        };

        // Extract and validate the requester address (admin)
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer);
        if (requesterAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Requester address is invalid.", node.from.key)
            return;
        };

        // Validate requester public key (admin)
        const requesterPublicKey = PeerWallet.decodeBech32mSafe(requesterAddressString);
        if (requesterPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Error while decoding requester public key.", node.from.key)
            return;
        };

        // Extract and validate pretending indexer address
        const toRemoveAddressBuffer = op.aco.ia;
        const toRemoveAddressString = addressUtils.bufferToAddress(toRemoveAddressBuffer);
        if (toRemoveAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Target indexer address is invalid.", node.from.key)
            return;
        };

        const toRemoveAddressPublicKey = PeerWallet.decodeBech32mSafe(toRemoveAddressString);
        if (toRemoveAddressPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Failed to decode target indexer public key.", node.from.key)
            return;
        };

        // ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Invalid admin entry.", node.from.key)
            return;
        };

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (decodedAdminEntry === null || !this.#isAdminApply(decodedAdminEntry, node)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return;
        };

        const adminPublicKey = PeerWallet.decodeBech32mSafe(decodedAdminEntry.address);
        if (adminPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Failed to decode admin public key.", node.from.key)
            return;
        };

        if (!b4a.equals(requesterPublicKey, adminPublicKey)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "System admin and node public keys do not match.", node.from.key)
            return;
        };

        // verify requester signature
        const message = createMessage(
            op.address,
            op.aco.txv,
            op.aco.ia,
            op.aco.in,
            OperationType.REMOVE_INDEXER
        );

        if (message.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Invalid requester message.", node.from.key)
            return;
        };
        // compare hashes
        const hash = await blake3Hash(message);
        if (!b4a.equals(hash, op.aco.tx)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Message hash does not match the tx_hash.", node.from.key)
            return;
        };

        const isMessageVerifed = this.#wallet.verify(op.aco.is, hash, adminPublicKey);
        const txHashHexString = hash.toString('hex');
        if (!isMessageVerifed) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Failed to verify message signature.", node.from.key)
            return;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Indexer sequence state is invalid.", node.from.key)
            return;
        };

        if (!b4a.equals(op.aco.txv, indexersSequenceState)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Transaction was not executed.", node.from.key)
            return;
        };

        // anti-replay attack
        const opEntry = await this.#getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Operation has already been applied.", node.from.key)
            return;
        };
        await this.#removeIndexer(op, node, batch, base, txHashHexString, toRemoveAddressString, toRemoveAddressBuffer, requesterAddressString);
    }

    async #removeIndexer(op, node, batch, base, txHashHexString, toRemoveAddressString, toRemoveAddressBuffer, requesterAddressString) {
        const toRemoveNodeEntry = await this.#getEntryApply(toRemoveAddressString, batch);
        if (toRemoveNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Failed to verify target indexer entry.", node.from.key)
            return;
        };

        const decodedNodeEntry = nodeEntryUtils.decode(toRemoveNodeEntry);
        if (decodedNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Failed to decode target indexer node entry.", node.from.key)
            return;
        };

        // Check if the node entry is an indexer
        const isNodeIndexer = nodeEntryUtils.isIndexer(toRemoveNodeEntry);
        if (!isNodeIndexer) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Node must be an indexer.", node.from.key)
            return;
        };

        //update node entry to writer
        const updatedNodeEntry = nodeEntryUtils.setRoleAndWriterKey(toRemoveNodeEntry, nodeRoleUtils.NodeRole.WRITER, decodedNodeEntry.wk)
        if (updatedNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Failed to update node role.", node.from.key)
            return;
        };

        // Ensure that the node is an indexer
        const indexerListHasWk = await this.#isWriterKeyInIndexerListApply(decodedNodeEntry.wk, base);
        if (!indexerListHasWk) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Writer key does not exist in indexer list.", node.from.key)
            return;
        }; // Node is not an indexer.

        // Charging fee from the admin (requester)
        const adminNodeEntry = await this.#getEntryApply(requesterAddressString, batch);
        if (adminNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Invalid requester node entry.", node.from.key)
            return;
        };

        const decodedAdminNodeEntry = nodeEntryUtils.decode(adminNodeEntry)
        if (decodedAdminNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Failed to decode requester node entry.", node.from.key)
            return;
        };

        const adminBalance = toBalance(decodedAdminNodeEntry.balance)
        if (adminBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Invalid admin balance.", node.from.key)
            return;
        };

        if (!adminBalance.greaterThanOrEquals(BALANCE_FEE)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Insufficient requester balance.", node.from.key)
            return;
        };

        // 100% fee will be burned
        const newAdminBalance = adminBalance.sub(BALANCE_FEE)
        if (newAdminBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Failed to apply fee to requester balance", node.from.key)
            return;
        };

        const updatedAdminNodeEntry = newAdminBalance.update(adminNodeEntry)
        if (updatedAdminNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.REMOVE_INDEXER, "Failed to update requester node.", node.from.key)
            return;
        };

        // downgrade role to writer
        await base.removeWriter(decodedNodeEntry.wk);
        await base.addWriter(decodedNodeEntry.wk, { isIndexer: false });

        // update writers index and length
        await this.#updateWritersIndex(toRemoveAddressBuffer, batch);

        //update node entry and indexers entry
        await batch.put(toRemoveAddressString, updatedNodeEntry);

        // update requester (admin) entry after fee deduction
        await batch.put(requesterAddressString, updatedAdminNodeEntry);

        // store operation hash to avoid replay attack.
        await batch.put(txHashHexString, node.value);
        console.log(`Indexer has been removed addr:wk:tx - ${toRemoveAddressString}:${decodedNodeEntry.wk.toString('hex')}:${txHashHexString}`);
    }

    async #handleApplyBanValidatorOperation(op, view, base, node, batch) {
        if (!this.check.validateAdminControlOperation(op)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Contract schema validation failed.", node.from.key)
            return;
        };
        // Extract and validate the network prefix from the node's address
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer);
        if (requesterAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Requester address is invalid.", node.from.key)
            return;
        };

        // Validate requester public key
        const requesterPublicKey = PeerWallet.decodeBech32mSafe(requesterAddressString);
        if (requesterPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Error while decoding requester public key.", node.from.key)
            return;
        };

        // ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Invalid admin entry.", node.from.key)
            return;
        };

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (decodedAdminEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Failed to decode admin node entry.", node.from.key)
            return;
        };

        const adminPublicKey = PeerWallet.decodeBech32mSafe(decodedAdminEntry.address);
        if (adminPublicKey === null || !this.#isAdminApply(decodedAdminEntry, node)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return;
        };

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterPublicKey)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "System admin and node public keys do not match.", node.from.key)
            return;
        };

        // recreate requester message
        const message = createMessage(
            op.address,
            op.aco.txv,
            op.aco.ia,
            op.aco.in,
            op.aco.nonce,
            OperationType.BAN_VALIDATOR
        );
        if (message.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Invalid requester message.", node.from.key)
            return;
        };

        // compare hashes
        const regeneratedHash = await blake3Hash(message);
        if (!b4a.equals(regeneratedHash, op.aco.tx)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Message hash does not match the tx_hash.", node.from.key)
            return;
        };

        const isMessageVerifed = this.#wallet.verify(op.aco.is, regeneratedHash, adminPublicKey);
        const txHashHexString = regeneratedHash.toString('hex');
        if (!isMessageVerifed) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Failed to verify message signature.", node.from.key)
            return;
        }

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Indexer sequence state is invalid.", node.from.key)
            return;
        }

        if (!b4a.equals(op.aco.txv, indexersSequenceState)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Transaction was not executed.", node.from.key)
            return;
        };

        // check if the operation has already been applied
        const opEntry = await this.#getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Operation has already been applied.", node.from.key)
            return;
        };

        // Extract and validate the node address to be banned
        const nodeToBeBannedAddressBuffer = op.aco.ia;
        const nodeToBeBannedAddressString = addressUtils.bufferToAddress(nodeToBeBannedAddressBuffer);
        if (nodeToBeBannedAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Failed to verify target node address.", node.from.key)
            return;
        };

        const toBanNodeEntry = await this.#getEntryApply(nodeToBeBannedAddressString, batch);
        if (toBanNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Failed to verify target node entry.", node.from.key)
            return;
        }; // Node entry must exist to ban it.

        // Atleast writer must be whitelisted to ban it.
        const isWhitelisted = nodeEntryUtils.isWhitelisted(toBanNodeEntry);
        const isWriter = nodeEntryUtils.isWriter(toBanNodeEntry);
        const isIndexer = nodeEntryUtils.isIndexer(toBanNodeEntry);

        // only writer/whitelisted node can be banned.
        if ((!isWhitelisted && !isWriter) || isIndexer) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Only writer/whitelisted node can be banned.", node.from.key)
            return;
        };

        const updatedToBanNodeEntry = nodeEntryUtils.setRole(toBanNodeEntry, nodeRoleUtils.NodeRole.READER);
        if (updatedToBanNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Failed to update target node role.", node.from.key)
            return;
        };

        const decodedToBanNodeEntry = nodeEntryUtils.decode(updatedToBanNodeEntry);
        if (decodedToBanNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Failed to decode target node entry.", node.from.key)
            return;
        };

        // charge fee from the admin
        const feeAmount = toBalance(transactionUtils.FEE);
        if (feeAmount === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Invalid fee amount.", node.from.key)
            return;
        };

        const adminNodeEntryBuffer = await this.#getEntryApply(requesterAddressString, batch);
        if (adminNodeEntryBuffer === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Invalid admin node entry buffer.", node.from.key)
            return;
        };

        const adminNodeEntry = nodeEntryUtils.decode(adminNodeEntryBuffer);
        if (adminNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Failed to verify admin node entry.", node.from.key)
            return;
        };

        const adminBalance = toBalance(adminNodeEntry.balance);
        if (adminBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Invalid admin balance", node.from.key)
            return;
        };

        if (!adminBalance.greaterThanOrEquals(feeAmount)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Insufficient admin balance.", node.from.key)
            return;
        };

        // 100% fee charged from admin will be burned
        const newAdminBalance = adminBalance.sub(feeAmount);
        if (newAdminBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Failed to apply fee to admin balance.", node.from.key)
            return;
        };

        const updatedAdminNodeEntry = newAdminBalance.update(adminNodeEntryBuffer);
        if (updatedAdminNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BAN_VALIDATOR, "Failed to update admin node balance.", node.from.key)
            return;
        } null;

        // Remove the writer role and update the state
        if (isWriter) {
            await base.removeWriter(decodedToBanNodeEntry.wk);
        }

        await batch.put(nodeToBeBannedAddressString, updatedToBanNodeEntry);
        await batch.put(requesterAddressString, updatedAdminNodeEntry);
        await batch.put(txHashHexString, node.value);
        console.log(`Node has been banned: addr:wk:tx - ${nodeToBeBannedAddressString}:${decodedToBanNodeEntry.wk.toString('hex')}:${txHashHexString}`);
    }

    async #handleApplyBootstrapDeploymentOperation(op, view, base, node, batch) {
        if (!this.check.validateBootstrapDeploymentOperation(op)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Contract schema validation failed.", node.from.key)
            return;
        };
        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.bdo, "vs") || !Object.hasOwn(op.bdo, "va") || !Object.hasOwn(op.bdo, "vn")) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Tx is not complete.", node.from.key)
            return;
        };
        // do not allow to deploy bootstrap deployment on the same bootstrap.
        if (b4a.equals(op.bdo.bs, this.bootstrap)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Cannot deploy bootstrap on existing same bootstrap.", node.from.key)
            return;
        };
        // for additional security, nonces should be different.
        if (b4a.equals(op.bdo.in, op.bdo.vn)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Nonces should not be the same.", node.from.key)
            return;
        };
        // addresses should be different.
        if (b4a.equals(op.address, op.bdo.va)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Addresses should be different.", node.from.key)
            return;
        };
        // signatures should be different.
        if (b4a.equals(op.bdo.is, op.bdo.vs)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Signatures should be different.", node.from.key)
            return;
        };


        // validate requester signature
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer);
        if (requesterAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Requester address is invalid.", node.from.key)
            return;
        };

        // validate requester public key
        const requesterPublicKey = PeerWallet.decodeBech32mSafe(requesterAddressString);
        if (requesterPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to decode requester public key.", node.from.key)
            return;
        };

        // recreate requester message
        const requesterMessage = createMessage(
            op.address,
            op.bdo.txv,
            op.bdo.bs,
            op.bdo.in,
            OperationType.BOOTSTRAP_DEPLOYMENT
        );
        if (requesterMessage.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid requester message.", node.from.key)
            return;
        };

        // ensure that tx is valid
        const regeneratedTxHash = await blake3Hash(requesterMessage);
        if (!b4a.equals(regeneratedTxHash, op.bdo.tx)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Message hash does not match the tx_hash.", node.from.key)
            return;
        };

        const isRequesterSignatureValid = this.#wallet.verify(op.bdo.is, regeneratedTxHash, requesterPublicKey);
        if (!isRequesterSignatureValid) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to verify message signature.", node.from.key)
            return;
        };

        const bootstrapDeploymentHexString = op.bdo.bs.toString('hex');

        //validation of validator signature
        const validatorAddressBuffer = op.bdo.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer);
        if (validatorAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator address.", node.from.key)
            return;
        };

        // validate validator public key
        const validatorPublicKey = PeerWallet.decodeBech32mSafe(validatorAddressString);
        if (validatorPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to decode validator public key.", node.from.key)
            return;
        };

        // recreate validator message
        const validatorMessage = createMessage(
            op.bdo.tx,
            op.bdo.va,
            op.bdo.vn,
            OperationType.BOOTSTRAP_DEPLOYMENT
        );

        if (validatorMessage.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator message.", node.from.key)
            return;
        };

        const validatorMessageHash = await blake3Hash(validatorMessage);

        const isValidatorSignatureValid = this.#wallet.verify(op.bdo.vs, validatorMessageHash, validatorPublicKey);
        if (!isValidatorSignatureValid) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to verify validator message signature.", node.from.key)
            return;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Indexer sequence state is invalid.", node.from.key)
            return;
        };

        if (!b4a.equals(op.bdo.txv, indexersSequenceState)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Transaction was not executed.", node.from.key)
            return;
        };

        // anti-replay attack
        const hashHexString = op.bdo.tx.toString('hex');
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (opEntry !== null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Operation has already been applied.", node.from.key)
            return;
        }; // Operation has already been applied.

        // If deployment already exists, do not process it again.
        const alreadyRegisteredBootstrap = await this.#getDeploymentEntryApply(bootstrapDeploymentHexString, batch);
        if (alreadyRegisteredBootstrap !== null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Bootstrap already registered.", node.from.key)
            return;
        };

        const deploymentEntry = deploymentEntryUtils.encode(op.bdo.tx, requesterAddressBuffer);
        if (deploymentEntry.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid deployment entry.", node.from.key)
            return;
        };

        const feeAmount = toBalance(transactionUtils.FEE);
        if (feeAmount === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid fee amount.", node.from.key)
            return;
        };

        // charge fee from the invoker
        const requesterNodeEntryBuffer = await this.#getEntryApply(requesterAddressString, batch);
        if (requesterNodeEntryBuffer === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid requester node entry buffer.", node.from.key)
            return;
        };

        const requesterNodeEntry = nodeEntryUtils.decode(requesterNodeEntryBuffer);
        if (requesterNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid requester node entry.", node.from.key)
            return;
        };

        const requesterBalance = toBalance(requesterNodeEntry.balance);
        if (requesterBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid requester balance.", node.from.key)
            return;
        };

        if (!requesterBalance.greaterThanOrEquals(feeAmount)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Insufficient requester balance.", node.from.key)
            return;
        };

        const newRequesterBalance = requesterBalance.sub(feeAmount);
        if (newRequesterBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to apply fee to requester.", node.from.key)
            return;
        };

        const updatedRequesterNodeEntry = newRequesterBalance.update(requesterNodeEntryBuffer);
        if (updatedRequesterNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to update requester node balance.", node.from.key)
            return;
        };

        // reward validator for processing this transaction.
        const validatorNodeEntryBuffer = await this.#getEntryApply(validatorAddressString, batch);
        if (validatorNodeEntryBuffer === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator node entry buffer..", node.from.key)
            return;
        };

        const validatorNodeEntry = nodeEntryUtils.decode(validatorNodeEntryBuffer);
        if (validatorNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator node entry.", node.from.key)
            return;
        };

        const validatorBalance = toBalance(validatorNodeEntry.balance);
        if (validatorBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Invalid validator balance.", node.from.key)
            return;
        };

        const newValidatorBalance = validatorBalance.add(feeAmount.percentage(PERCENT_75));
        if (newValidatorBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to transfer fee to validator.", node.from.key)
            return;
        };

        const updatedValidatorNodeEntry = newValidatorBalance.update(validatorNodeEntryBuffer);
        if (updatedValidatorNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to update validator node balance.", node.from.key)
            return;
        };

        await batch.put(hashHexString, node.value);
        await batch.put(EntryType.DEPLOYMENT + bootstrapDeploymentHexString, deploymentEntry);
        await batch.put(requesterAddressString, updatedRequesterNodeEntry);
        await batch.put(validatorAddressString, updatedValidatorNodeEntry);

        if (this.#enable_txlogs === true) {
            console.log(`TX: ${hashHexString} and deployment/${bootstrapDeploymentHexString} have been appended. Signed length: `, this.#base.view.core.signedLength);
        }
    }

    async #handleApplyTxOperation(op, view, base, node, batch) {
        // ATTENTION: The sanitization should be done before ANY other check, otherwise we risk crashing
        if (!this.check.validateTransactionOperation(op)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Contract schema validation failed.", node.from.key)
            return;
        };
        // reject transaction which is not complete
        if (!Object.hasOwn(op.txo, "vs") || !Object.hasOwn(op.txo, "va") || !Object.hasOwn(op.txo, "vn")) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Tx is not complete.", node.from.key)
            return;
        };
        // reject if the validator signed their own transaction
        if (b4a.equals(op.address, op.txo.va)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Validator cannot sign its own transaction.", node.from.key)
            return;
        };
        // reject if the nonces are the same
        if (b4a.equals(op.txo.in, op.txo.vn)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Nonces should not be the same.", node.from.key)
            return;
        };
        // reject if the signatures are the same
        if (b4a.equals(op.txo.is, op.txo.vs)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Signatures should not be the same.", node.from.key)
            return;
        };
        // reject if the external bootstrap is the same as the network bootstrap
        if (b4a.equals(op.txo.bs, op.txo.mbs)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Network and external bootstrap cannot be the same.", node.from.key)
            return;
        };

        // validate invoker signature
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer);
        if (null === requesterAddressString) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Invalid requester address.", node.from.key)
            return;
        };

        const requesterPublicKey = PeerWallet.decodeBech32mSafe(requesterAddressString);
        if (null === requesterPublicKey) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Failed to decode requester public key.", node.from.key)
            return;
        };

        const requesterMessage = createMessage(
            op.address,
            op.txo.txv,
            op.txo.iw,
            op.txo.ch,
            op.txo.in,
            op.txo.bs,
            this.#bootstrap,
            OperationType.TX
        );
        if (requesterMessage.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Invalid requester message.", node.from.key)
            return;
        };

        const regeneratedTxHash = await blake3Hash(requesterMessage);
        if (!b4a.equals(regeneratedTxHash, op.txo.tx)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Message hash does not match the tx_hash.", node.from.key)
            return;
        };

        const isRequesterSignatureValid = this.#wallet.verify(op.txo.is, op.txo.tx, requesterPublicKey); // tx contains already a nonce.
        if (!isRequesterSignatureValid) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Failed to verify message signature.", node.from.key)
            return;
        };

        //second signature
        const validatorAddressBuffer = op.txo.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer);
        if (null === validatorAddressString) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Invalid validator address.", node.from.key)
            return;
        };

        const validatorPublicKey = PeerWallet.decodeBech32mSafe(validatorAddressString);
        if (null === validatorPublicKey) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Failed to decode validator public key.", node.from.key)
            return;
        };

        // recreate validator message
        const validatorMessage = createMessage(
            op.txo.tx,
            op.txo.va,
            op.txo.vn,
            OperationType.TX
        );

        if (validatorMessage.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Invalid validator message.", node.from.key)
            return;
        };

        const validatorMessageHash = await blake3Hash(validatorMessage);
        const isValidatorSignatureValid = this.#wallet.verify(op.txo.vs, validatorMessageHash, validatorPublicKey);
        if (!isValidatorSignatureValid) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Failed to verify validator message signature.", node.from.key)
            return;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Indexer sequence state is invalid.", node.from.key)
            return;
        };

        if (!b4a.equals(op.txo.txv, indexersSequenceState)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Transaction was not executed.", node.from.key)
            return;
        };

        // anti-replay attack
        const hashHexString = op.txo.tx.toString('hex');
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (opEntry !== null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Operation has already been applied.", node.from.key)
            return;
        };

        // if user is performing a transaction on non-deployed bootstrap, then we need to reject it.
        // if deployment/<bootstrap> is not null then it means that the bootstrap is already deployed, and it should
        // point to payload, which is pointing to the txHash.
        const bootstrapHasBeenRegistered = await this.#getDeploymentEntryApply(op.txo.bs.toString('hex'), batch);
        if (bootstrapHasBeenRegistered === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Bootstrap already registered.", node.from.key)
            return;
        };

        // check the subnetwork creator address
        const deploymentEntry = deploymentEntryUtils.decode(bootstrapHasBeenRegistered);
        if (deploymentEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Invalid deployment entry.", node.from.key)
            return;
        };

        const subnetworkCreatorAddressString = addressUtils.bufferToAddress(deploymentEntry.address);
        if (subnetworkCreatorAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Invalid subnet creator address.", node.from.key)
            return;
        };

        const feeAmount = toBalance(transactionUtils.FEE);
        if (feeAmount === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Invalid fee amount.", node.from.key)
            return;
        };
        // charge fee from the requester
        const requesterNodeEntryBuffer = await this.#getEntryApply(requesterAddressString, batch);
        if (requesterNodeEntryBuffer === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Invalid requester node entry buffer.", node.from.key)
            return;
        };

        const requesterNodeEntry = nodeEntryUtils.decode(requesterNodeEntryBuffer);
        if (requesterNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Failed to decode requester public key.", node.from.key)
            return;
        };

        const requesterBalance = toBalance(requesterNodeEntry.balance);
        if (requesterBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Invalid requester balance.", node.from.key)
            return;
        };

        if (!requesterBalance.greaterThanOrEquals(feeAmount)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Insufficient requester balance.", node.from.key)
            return;
        };

        const newRequesterBalance = requesterBalance.sub(feeAmount);
        if (newRequesterBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Failed to apply fee to requester.", node.from.key)
            return;
        };

        const updatedRequesterNodeEntry = newRequesterBalance.update(requesterNodeEntryBuffer);
        if (updatedRequesterNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Failed to update requester node balance.", node.from.key)
            return;
        };

        // reward validator for processing this transaction. 50% of the fee goes to the validator
        const validatorNodeEntryBuffer = await this.#getEntryApply(validatorAddressString, batch);
        if (validatorNodeEntryBuffer === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Invalid validator node entry buffer.", node.from.key)
            return;
        };

        const validatorNodeEntry = nodeEntryUtils.decode(validatorNodeEntryBuffer);
        if (validatorNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Failed to decode validator public key.", node.from.key)
            return;
        };

        const validatorBalance = toBalance(validatorNodeEntry.balance);
        if (validatorBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Invalid validator balance.", node.from.key)
            return;
        };

        const newValidatorBalance = validatorBalance.add(feeAmount.percentage(PERCENT_50));
        if (newValidatorBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Failed to transfer fee to validator.", node.from.key)
            return;
        };

        const updatedValidatorNodeEntry = newValidatorBalance.update(validatorNodeEntryBuffer)
        if (updatedValidatorNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Failed to update validator node balance.", node.from.key)
            return;
        };

        // reward subnetwork creator for allowing this transaction to be executed on their bootstrap.
        // 25% of the fee goes to the subnetwork creator.

        const subnetworkCreatorNodeEntryBuffer = await this.#getEntryApply(subnetworkCreatorAddressString, batch);
        if (subnetworkCreatorNodeEntryBuffer === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Invalid subnet creator node entry buffer.", node.from.key)
            return;
        };

        const subnetworkCreatorNodeEntry = nodeEntryUtils.decode(subnetworkCreatorNodeEntryBuffer);
        if (subnetworkCreatorNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Failed to decode subnet creator node entry.", node.from.key)
            return;
        };

        const subnetworkCreatorBalance = toBalance(subnetworkCreatorNodeEntry.balance);
        if (subnetworkCreatorBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Invalid subnet creator balance.", node.from.key)
            return;
        };

        const newSubnetworkCreatorBalance = subnetworkCreatorBalance.add(feeAmount.percentage(PERCENT_25));
        if (newSubnetworkCreatorBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Failed to apply fee to subnet creator balance.", node.from.key)
            return;
        };

        const updatedSubnetworkCreatorNodeEntry = newSubnetworkCreatorBalance.update(subnetworkCreatorNodeEntryBuffer);
        if (updatedSubnetworkCreatorNodeEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TX, "Failed to update subnet creator node balance.", node.from.key)
            return;
        };

        // 25% of the fee is burned.

        // TODO: OBSERVATION - If TX operation will be requested by the subnetwork creator on their own bootstrap, how we should charge the fee? It looks like Bootstrap deployer
        // is paying 0.03, however they are receiving 0.0075 back, so the final fee is 0.0225. I think it's fair enough. It this case we should burn reward for Bootstrap deployer.

        await batch.put(requesterAddressString, updatedRequesterNodeEntry);
        await batch.put(subnetworkCreatorAddressString, updatedSubnetworkCreatorNodeEntry);
        await batch.put(validatorAddressString, updatedValidatorNodeEntry);
        await batch.put(hashHexString, node.value);

        if (this.#enable_txlogs === true) {
            console.log(`TX: ${hashHexString} appended. Signed length: `, this.#base.view.core.signedLength);
        }
    }

    async #handleApplyTransferOperation(op, view, base, node, batch) {
        if (!this.check.validateTransferOperation(op)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Contract schema validation failed.", node.from.key)
            return;
        };
        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.tro, "vs") || !Object.hasOwn(op.tro, "va") || !Object.hasOwn(op.tro, "vn")) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Tx is not complete.", node.from.key)
            return;
        };
        // for additional security, nonces should be different.
        if (b4a.equals(op.tro.in, op.tro.vn)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Nonces should not be the same.", node.from.key)
            return;
        };
        // addresses should be different.
        if (b4a.equals(op.address, op.tro.va)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Addresses should not be the same.", node.from.key)
            return;
        };
        // signatures should be different.
        if (b4a.equals(op.tro.is, op.tro.vs)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Signatures should not be the same.", node.from.key)
            return;
        };

        // validate requester signature
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer);
        if (requesterAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Requester address is invalid.", node.from.key)
            return;
        };

        const requesterPublicKey = PeerWallet.decodeBech32mSafe(requesterAddressString);
        if (requesterPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Error while decoding requester public key.", node.from.key)
            return;
        };

        // recreate requester message
        const requesterMessage = createMessage(
            op.address,
            op.tro.txv,
            op.tro.in,
            op.tro.to,
            op.tro.am,
            OperationType.TRANSFER
        );

        if (requesterMessage.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid requester message.", node.from.key)
            return;
        };

        // ensure that tx is valid
        const regeneratedTxHash = await blake3Hash(requesterMessage);
        if (!b4a.equals(regeneratedTxHash, op.tro.tx)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Message hash does not match the tx_hash.", node.from.key)
            return;
        };

        const isRequesterSignatureValid = this.#wallet.verify(op.tro.is, regeneratedTxHash, requesterPublicKey);
        if (!isRequesterSignatureValid) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Failed to verify message signature.", node.from.key)
            return;
        };

        // signature of the validator
        const validatorAddressBuffer = op.tro.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer);
        if (validatorAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Validator address is invalid.", node.from.key)
            return;
        };

        const validatorPublicKey = PeerWallet.decodeBech32mSafe(validatorAddressString);
        if (validatorPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Failed to decode validator public key.", node.from.key)
            return;
        };

        const validatorMessage = createMessage(
            op.tro.tx,
            op.tro.va,
            op.tro.vn,
            OperationType.TRANSFER
        );

        if (validatorMessage.length === 0) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid validator message.", node.from.key)
            return;
        };

        const validatorMessageHash = await blake3Hash(validatorMessage);
        const isValidatorSignatureValid = this.#wallet.verify(op.tro.vs, validatorMessageHash, validatorPublicKey);
        if (!isValidatorSignatureValid) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Failed to verify message signature.", node.from.key)
            return;
        };

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Indexer sequence state is invalid.", node.from.key)
            return;
        };

        if (!b4a.equals(op.tro.txv, indexersSequenceState)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Transaction was not executed.", node.from.key)
            return;
        };

        // anti-replay attack
        const hashHexString = op.tro.tx.toString('hex');
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (opEntry !== null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Operation has already been applied.", node.from.key)
            return;
        };

        // Check if recipient address is valid.
        const recipientAddressBuffer = op.tro.to;
        const recipientAddressString = addressUtils.bufferToAddress(recipientAddressBuffer);
        if (recipientAddressString === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid recipient address.", node.from.key)
            return;
        };

        const recipientPublicKey = PeerWallet.decodeBech32mSafe(recipientAddressString);
        if (recipientPublicKey === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Failed to decode recipient public key.", node.from.key)
            return;
        };

        const isSelfTransfer = b4a.equals(requesterAddressBuffer, recipientAddressBuffer);
        const isRecipientValidator = b4a.equals(recipientAddressBuffer, validatorAddressBuffer);

        const transferResult = await this.#transfer(
            requesterAddressString,
            recipientAddressString,
            validatorAddressString,
            op.tro.am,
            transactionUtils.FEE,
            isSelfTransfer,
            isRecipientValidator,
            batch
        );

        if (null === transferResult) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid transfer result.", node.from.key)
            return;
        };

        if (null === transferResult.senderEntry) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid sender entry.", node.from.key)
            return;
        };

        if (null === transferResult.validatorEntry) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid validator entry.", node.from.key)
            return;
        };

        if (!isSelfTransfer) {
            if (null === transferResult.recipientEntry) {
                this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid recipient entry.", node.from.key)
                return;
            };

            await batch.put(recipientAddressString, transferResult.recipientEntry);
        }

        await batch.put(requesterAddressString, transferResult.senderEntry);
        await batch.put(validatorAddressString, transferResult.validatorEntry);

        if (!isSelfTransfer && !isRecipientValidator && transferResult.recipientEntry !== null) {
            await batch.put(recipientAddressString, transferResult.recipientEntry);
        }

        await batch.put(hashHexString, node.value);

        if (this.#enable_txlogs === true) {
            console.log(`TRANSFER: ${hashHexString} appended. Signed length: `, this.#base.view.core.signedLength);
        }
    }

    async #transfer(senderAddressString, recipientAddressString, validatorAddressString, transferAmountBuffer, feeAmountBuffer, isSelfTransfer, isRecipientValidator, batch) {
        if (senderAddressString === null ||
            recipientAddressString === null ||
            validatorAddressString === null ||
            transferAmountBuffer === null ||
            feeAmountBuffer === null ||
            isSelfTransfer === null ||
            batch === null
        ) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid transfer payload.", node.from.key)
            return null;
        }

        const transferAmount = toBalance(transferAmountBuffer);
        const feeAmount = toBalance(feeAmountBuffer);
        if (transferAmount === null || feeAmount === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid fee/transfer amount.", node.from.key)
            return null;
        }

        // totalDeductedAmount = transferAmount + fee. When transferamount is 0, then totalDeductedAmount = fee. Because 0 + fee = fee.
        const totalDeductedAmount = isSelfTransfer ? feeAmount : transferAmount.add(feeAmount);
        if (totalDeductedAmount === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid total deducted amount.", node.from.key)
            return null;
        }

        const senderEntryBuffer = await this.#getEntryApply(senderAddressString, batch);
        if (senderEntryBuffer === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid sender node entry buffer.", node.from.key)
            return null;
        }

        const senderEntry = nodeEntryUtils.decode(senderEntryBuffer);
        if (senderEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid sender node entry.", node.from.key)
            return null;
        }

        const senderBalance = toBalance(senderEntry.balance);
        if (senderBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid sender balance.", node.from.key)
            return null;
        }

        if (!senderBalance.greaterThanOrEquals(totalDeductedAmount)) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Insufficient sender balance.", node.from.key)
            return null;
        }

        const newSenderBalance = senderBalance.sub(totalDeductedAmount);
        if (newSenderBalance === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Failed to apply fee to sender node balance.", node.from.key)
            return null;
        }

        const updatedSenderEntry = newSenderBalance.update(senderEntryBuffer);
        if (updatedSenderEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Failed to update sender node balance.", node.from.key)
            return null;
        }

        const result = {
            senderEntry: updatedSenderEntry,
            recipientEntry: null,
            validatorEntry: null,
        };

        if (!isSelfTransfer && !isRecipientValidator) {
            const recipientEntryBuffer = await this.#getEntryApply(recipientAddressString, batch);
            if (recipientEntryBuffer === null) {
                if (transferAmount.value === null) {
                    this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid transfer amount.", node.from.key)
                    return null;
                };
                const newRecipientEntry = nodeEntryUtils.init(
                    ZERO_WK,
                    nodeRoleUtils.NodeRole.READER,
                    transferAmount.value
                );
                if (newRecipientEntry.length === 0) {
                    this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid recipient entry.", node.from.key)
                    return null;
                };
                result.recipientEntry = newRecipientEntry;
            } else {
                const recipientEntry = nodeEntryUtils.decode(recipientEntryBuffer);
                if (recipientEntry === null) {
                    this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid recipient entry.", node.from.key)
                    return null;
                };

                const recipientBalance = toBalance(recipientEntry.balance);
                if (recipientBalance === null) {
                    this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid recipient balance.", node.from.key)
                    return null;
                };

                const newRecipientBalance = recipientBalance.add(transferAmount);
                if (newRecipientBalance === null) {
                    this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Failed to transfer amount to recipient balance.", node.from.key)
                    return null;
                };

                const updatedRecipientEntry = newRecipientBalance.update(recipientEntryBuffer);
                if (updatedRecipientEntry === null) {
                    this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Failed to update recipient node balance.", node.from.key)
                    return null;
                };
                result.recipientEntry = updatedRecipientEntry;
            }
        }

        const validatorEntryBuffer = await this.#getEntryApply(validatorAddressString, batch);
        if (validatorEntryBuffer === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid validator entry buffer.", node.from.key)
            return null;
        }

        const validatorEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (validatorEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Invalid validator entry.", node.from.key)
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
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Failed to transfer fee to validator balance.", node.from.key)
            return null;
        }

        const updatedValidatorEntry = newValidatorBalance.update(validatorEntryBuffer);
        if (updatedValidatorEntry === null) {
            this.#enable_txlogs && this.#safeLogApply(OperationType.TRANSFER, "Failed to update validator node balance.", node.from.key)
            return null;
        }

        result.validatorEntry = updatedValidatorEntry;

        if (isRecipientValidator) {
            result.recipientEntry = updatedValidatorEntry;
        }

        return result;
    }

    #isAdminApply(adminEntry, node) {
        if (!adminEntry || !node) return false;
        return b4a.equals(adminEntry.wk, node.from.key);
    }

    async #getEntryApply(key, batch) {
        const entry = await batch.get(key);
        return deepCopyBuffer(entry?.value)
    }

    async #getDeploymentEntryApply(key, batch) {
        const entry = await batch.get(EntryType.DEPLOYMENT + key);
        return deepCopyBuffer(entry?.value)
    }

    async #getIndexerSequenceStateApply(base) {
        try {
            const buf = [];
            for (const indexer of Object.values(base.system.indexers)) {
                buf.push(indexer.key);
            }
            return await blake3Hash(b4a.concat(buf));
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    async #isWriterKeyInIndexerListApply(wk, base) {
        try {
            return Object.values(base.system.indexers).some(entry => b4a.equals(entry.key, wk));
        } catch (error) {
            console.error(error);
            return null
        }
    }

    /**
     * Retrieves the address assigned to a given writing key from the registry.
     * 
     * @param {Object} batch - The current Hyperbee batch instance used for reading state.
     * @param {string} writingKey - The writing key in hex string format.
     * @returns {Buffer|null} The address buffer assigned to the writing key, or null if not registered.
     */

    async #getRegisteredWriterKeyApply(batch, writingKey) {
        const entry = await batch.get(EntryType.WRITER_ADDRESS + writingKey);
        return deepCopyBuffer(entry?.value)
    }

    async #isApplyInitalizationDisabled(batch) {
        // Retrieve the flag to verify if initialization is allowed
        let initialization = await this.#getEntryApply(EntryType.INITIALIZATION, batch);
        if (null === initialization) {
            return false
        } else {
            return b4a.equals(initialization, safeWriteUInt32BE(0, 0))
        }
    }

    async #updateWritersIndex(validatorAddressBuffer, batch) {
        // Retrieve and increment the writers length entry
        let length = await this.#getEntryApply(EntryType.WRITERS_LENGTH, batch);
        let incrementedLength = null;
        if (null === length) {
            // Initialize the writers length entry if it does not exist
            const bufferedLength = lengthEntryUtils.init(0);
            length = lengthEntryUtils.decodeBE(bufferedLength);
            incrementedLength = lengthEntryUtils.incrementBE(length);
        } else {
            // Decode and increment the existing writers length entry
            length = lengthEntryUtils.decodeBE(length);
            incrementedLength = lengthEntryUtils.incrementBE(length);
        }
        if (null === incrementedLength) return;

        // Update the writers index and length entries
        await batch.put(EntryType.WRITERS_INDEX + length, validatorAddressBuffer);
        await batch.put(EntryType.WRITERS_LENGTH, incrementedLength);
    }

    #safeLogApply(operationType = "Common", errorMessage, writingKey = null) {
        try {
            const date = new Date().toISOString();
            const wk = writingKey ? writingKey.toString('hex') : 'N/A';
            console.error(`[${date}][${operationType}][${errorMessage}][${wk}]`);
        } catch (e) {
            console.error(`[LOG_ERROR][Failed to log error][${e}]`);
        }
    }

    #stakeBalanceApply(nodeEntryBuffer, node) {
        if (!nodeEntryBuffer || nodeEntryBuffer.length === 0 || nodeEntryBuffer.length !== NODE_ENTRY_SIZE) {
            this.#safeLogApply("StakeBalance", "Invalid node entry buffer", node.from.key);
            return null;
        }

        const decodedNodeEntry = nodeEntryUtils.decode(nodeEntryBuffer);
        if (decodedNodeEntry === null) {
            this.#safeLogApply("StakeBalance", "Failed to decode node entry", node.from.key);
            return null;
        }

        const currentNodeBalance = toBalance(decodedNodeEntry.balance);
        if (currentNodeBalance === null) {
            this.#safeLogApply("StakeBalance", "Invalid node balance", node.from.key);
            return null;
        }

        if (!currentNodeBalance.greaterThanOrEquals(BALANCE_TO_STAKE)) {
            this.#safeLogApply("StakeBalance", "Insufficient balance to stake", node.from.key);
            return null;
        }

        const newNodeBalance = currentNodeBalance.sub(BALANCE_TO_STAKE);
        if (newNodeBalance === null) {
            this.#safeLogApply("StakeBalance", "Failed to subtract stake balance", node.from.key);
            return null;
        }

        const updatedNodeEntryWithBalance = newNodeBalance.update(nodeEntryBuffer);
        if (updatedNodeEntryWithBalance === null) {
            this.#safeLogApply("StakeBalance", "Failed to update node entry with new balance", node.from.key);
            return null;
        }

        const updatedNodeEntryWithAllBalances = nodeEntryUtils.setStakedBalance(updatedNodeEntryWithBalance, BALANCE_TO_STAKE.value);
        if (updatedNodeEntryWithAllBalances === null) {
            this.#safeLogApply("StakeBalance", "Failed to set staked balance in node entry", node.from.key);
            return null;
        }

        return updatedNodeEntryWithAllBalances;
    }

    #withdrawStakedBalanceApply(nodeEntryBuffer, node) {
        if (!nodeEntryBuffer || nodeEntryBuffer.length === 0 || nodeEntryBuffer.length !== NODE_ENTRY_SIZE) {
            this.#safeLogApply("withdrawStakedBalanceApply", "Invalid node entry buffer", node.from.key);
            return null;
        }

        const decodedNodeEntry = nodeEntryUtils.decode(nodeEntryBuffer);
        if (decodedNodeEntry === null) {
            this.#safeLogApply("withdrawStakedBalanceApply", "Failed to decode node entry", node.from.key);
            return null;
        }

        const stakedBalance = toBalance(decodedNodeEntry.stakedBalance);
        if (stakedBalance === null) {
            this.#safeLogApply("withdrawStakedBalanceApply", "Invalid staked balance", node.from.key);
            return null;
        }

        if (!stakedBalance.greaterThan(BALANCE_ZERO)) {
            this.#safeLogApply("withdrawStakedBalanceApply", "No staked balance to unstake", node.from.key);
            return null;
        }

        const currentNodeBalance = toBalance(decodedNodeEntry.balance);
        if (currentNodeBalance === null) {
            this.#safeLogApply("withdrawStakedBalanceApply", "Invalid current balance", node.from.key);
            return null;
        }

        const newNodeBalance = currentNodeBalance.add(stakedBalance);
        if (newNodeBalance === null) {
            this.#safeLogApply("withdrawStakedBalanceApply", "Failed to add staked balance to current balance", node.from.key);
            return null;
        }

        const updatedNodeEntryWithBalance = newNodeBalance.update(nodeEntryBuffer);
        if (updatedNodeEntryWithBalance === null) {
            this.#safeLogApply("withdrawStakedBalanceApply", "Failed to update node entry with new balance", node.from.key);
            return null;
        }

        const updatedNodeEntryWithAllBalances = nodeEntryUtils.setStakedBalance(updatedNodeEntryWithBalance, BALANCE_ZERO.value);
        if (updatedNodeEntryWithAllBalances === null) {
            this.#safeLogApply("withdrawStakedBalanceApply", "Failed to set staked balance in node entry", node.from.key);
            return null;
        }

        return updatedNodeEntryWithAllBalances;

    }

    async #validatorPenaltyApply(writingKeyBuffer, batch, base) {
        // In theory, none of the negative cases in the if-statements should occur. They are added only for safety reasons.

        // 1. find validator using writingKey
        const validatorWk = writingKeyBuffer.toString('hex');

        const validatorAddressBuffer = await this.#getRegisteredWriterKeyApply(batch, validatorWk);
        if (validatorAddressBuffer === null) {
            this.#safeLogApply("ValidatorPenalty", `No validator found for writing key: ${validatorWk}`, writingKeyBuffer);
            return;
        }

        // 2. get it's address and convert it to string format, validate everything
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer);
        if (validatorAddressString === null) {
            this.#safeLogApply("ValidatorPenalty", `Invalid validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const validatorPublicKey = PeerWallet.decodeBech32mSafe(validatorAddressString);
        if (validatorPublicKey === null) {
            this.#safeLogApply("ValidatorPenalty", `Failed to decode validator public key: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        // 3. get it's entry using the address
        const validatorNodeEntryBuffer = await this.#getEntryApply(validatorAddressString, batch);
        if (validatorNodeEntryBuffer === null) {
            this.#safeLogApply("ValidatorPenalty", `No node entry found for validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const decodedValidatorNodeEntry = nodeEntryUtils.decode(validatorNodeEntryBuffer);
        if (decodedValidatorNodeEntry === null) {
            this.#safeLogApply("ValidatorPenalty", `Failed to decode validator node entry for address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        // 4. get it's StakedBalance and convert to Balance
        const stakedBalance = toBalance(decodedValidatorNodeEntry.stakedBalance);
        if (stakedBalance === null) {
            this.#safeLogApply("ValidatorPenalty", `Invalid staked balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        if (stakedBalance.greaterThanOrEquals(BALANCE_PENEALTY)) {
            const newStakedBalance = stakedBalance.sub(BALANCE_PENEALTY);
            if (newStakedBalance === null) {
                this.#safeLogApply("ValidatorPenalty", `Failed to subtract penalty from staked balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            const updatedNodeEntryWithBalance = nodeEntryUtils.setStakedBalance(validatorNodeEntryBuffer, newStakedBalance.value);
            if (updatedNodeEntryWithBalance === null) {
                this.#safeLogApply("ValidatorPenalty", `Failed to update staked balance in node entry for validator address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }
            if (newStakedBalance.equals(BALANCE_ZERO)) {

                const downgradedNodeEntry = nodeEntryUtils.setRole(updatedNodeEntryWithBalance, nodeRoleUtils.NodeRole.WHITELISTED);
                if (downgradedNodeEntry === null) {
                    this.#safeLogApply("ValidatorPenalty", `Failed to downgrade validator to whitelisted for address: ${validatorAddressString}`, writingKeyBuffer);
                    return;
                }
                await base.removeWriter(writingKeyBuffer);
                await batch.put(validatorAddressString, downgradedNodeEntry);
                return;
            } else {
                await batch.put(validatorAddressString, updatedNodeEntryWithBalance);
                return;
            }

        } else {
            // should never enter into this scope
            this.#safeLogApply("ValidatorPenalty", `Staked balance too low to penalize for validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

    }
    async #applyGetLicenseCount(batch){
        return await this.#getEntryApply(EntryType.LICENSE_COUNT, batch) 
    }

    async #applyAssignNewLicense(batch, validatorAddressBuffer){
        let licenseCount = await this.#applyGetLicenseCount(batch)
        let newLicenseLength;
        if (null === licenseCount) {
            // Initialize the writers length entry if it does not exist
            const bufferedLength = lengthEntryUtils.init(0);
            licenseCount = lengthEntryUtils.decodeBE(bufferedLength);
            newLicenseLength = lengthEntryUtils.incrementBE(licenseCount);
        } else {
            // Decode and increment the existing writers length entry
            licenseCount = lengthEntryUtils.decodeBE(licenseCount);
            newLicenseLength = lengthEntryUtils.incrementBE(licenseCount);
        }

        if (null === newLicenseLength) return;
        if (null === validatorAddressBuffer) return;

        await batch.put(EntryType.LICENSE_COUNT, newLicenseLength)
        await batch.put(EntryType.LICENSE_INDEX + licenseCount, validatorAddressBuffer)

        return newLicenseLength;
    }
}

export default State;
