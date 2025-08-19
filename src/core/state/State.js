import ReadyResource from 'ready-resource';
import Autobase from 'autobase';
import Hyperbee from 'hyperbee';
import b4a from 'b4a';
import {
    ACK_INTERVAL,
    EntryType,
    OperationType,
} from '../../utils/constants.js';
import {isHexString, sleep} from '../../utils/helpers.js';
import Wallet from 'trac-wallet';
import Check from '../../utils/check.js';
import { safeDecodeApplyOperation } from '../../utils/protobuf/operationHelpers.js';
import { createMessage, ZERO_WK } from '../../utils/buffer.js';
import addressUtils from './utils/address.js';
import adminEntryUtils from './utils/adminEntry.js';
import nodeEntryUtils from './utils/nodeEntry.js';
import nodeRoleUtils from './utils/roles.js';
import indexerEntryUtils from './utils/indexerEntry.js';
import lengthEntryUtils from './utils/lengthEntry.js';
import transactionUtils from './utils/transaction.js';
import {blake3Hash} from '../../utils/crypto.js';
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
            valueEncoding: 'binary',
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
        const indexersEntry = await this.getSigned(EntryType.INDEXERS);
        return indexersEntry
    }

    async isAddressInIndexersEntry(address, indexersEntry) {
        if (indexersEntry === null || address === null) return false;
        const indexerListHasAddress = indexerEntryUtils.getIndex(indexersEntry, addressUtils.addressToBuffer(address)) !== -1;
        return indexerListHasAddress;
    }

    async getWriterLength() {
        const writersLength = await this.getSigned(EntryType.WRITERS_LENGTH);
        return writersLength ? lengthEntryUtils.decode(writersLength) : null;
    }

    async getWriterIndex(index) {
        if (index < 0 || index > Number.MAX_SAFE_INTEGER) return null;
        const writerPublicKey = await this.getSigned(EntryType.WRITERS_INDEX + index);
        return writerPublicKey ? writerPublicKey : null;
    }

    async getRegisteredBootstrapEntry(bootstrap) {
        if(!bootstrap || !isHexString(bootstrap) || bootstrap.length !== 64) return null;
        return await this.getSigned(EntryType.DEPLOYMENT + bootstrap);

    }

    async append(payload) {
        await this.#base.append(payload);
    }

    // this is helpful and we will need it.
    async getInfoFromLinearizer() {
        return this.#base.linearizer.indexers
    }

    #setupHyperbee(store) {
        this.#bee = new Hyperbee(store.get('view'), {
            extension: false,
            keyEncoding: 'ascii',
            valueEncoding: 'binary'
        })
        return this.#bee;
    }
    // ATTENTION: DO NOT USE METHODS ABOVE IN APPLY PART!
    ///////////////////////////////APPLY////////////////////////////////////

    async #apply(nodes, view, base) {
        const batch = view.batch();
        for (const node of nodes) {
            const op = safeDecodeApplyOperation(node.value);
            if (op === null) return;
            const handler = this.#getApplyOperationHandler(op.type);
            if (handler) {
                await handler(op, view, base, node, batch);
            } else {
                console.warn(`Unknown operation type: ${op.type}`);
            }
        }
        await batch.flush();
        await batch.close();
    }

    #getApplyOperationHandler(type) {
        const handlers = {
            [OperationType.TX]: this.#handleApplyTxOperation.bind(this),
            [OperationType.ADD_ADMIN]: this.#handleApplyAddAdminOperation.bind(this),
            [OperationType.APPEND_WHITELIST]: this.#handleApplyAppendWhitelistOperation.bind(this),
            [OperationType.ADD_WRITER]: this.#handleApplyAddWriterOperation.bind(this),
            [OperationType.REMOVE_WRITER]: this.#handleApplyRemoveWriterOperation.bind(this),
            [OperationType.ADD_INDEXER]: this.#handleApplyAddIndexerOperation.bind(this),
            [OperationType.REMOVE_INDEXER]: this.#handleApplyRemoveIndexerOperation.bind(this),
            [OperationType.BAN_VALIDATOR]: this.#handleApplyBanValidatorOperation.bind(this),
            [OperationType.BOOTSTRAP_DEPLOYMENT]: this.#handleApplyBootstrapDeploymentOperation.bind(this),
        };
        return handlers[type] || null;
    }

    async #handleApplyTxOperation(op, view, base, node, batch) {
        //TODO: ADD check to ensure both nonces are different to increase security.
        if (b4a.byteLength(node.value) > 4096) return; // TODO: change this to a constant. Avoid magic numbers.
        if (!this.check.validatePostTx(op)) return; // ATTENTION: The sanitization should be done before ANY other check, otherwise we risk crashing

        const tx = op.txo.tx;
        const validatorAddressBuffer = op.address;

        const regeneratedTxBuffer = await transactionUtils.generateTxBuffer(op.txo.bs, this.#bootstrap, validatorAddressBuffer, op.txo.iw, op.txo.ia, op.txo.ch, op.txo.in);
        if (regeneratedTxBuffer.length === 0 || !b4a.equals(regeneratedTxBuffer, tx)) return;
        // first signature
        const requesterSignature = op.txo.is;
        const incomingAddressBuffer = op.txo.ia;
        const incomingAddress = addressUtils.bufferToAddress(incomingAddressBuffer);
        if (null === incomingAddress) return;
        const incomingPublicKey = Wallet.decodeBech32mSafe(incomingAddress);
        if (null === incomingPublicKey) return;
        const isRequesterSignatureValid = this.#wallet.verify(requesterSignature, tx, incomingPublicKey); // tx contains already a nonce.
        if (!isRequesterSignatureValid) return;

        //second signature
        const validatorSignature = op.txo.vs;
        const validatorNonce = op.txo.vn;
        const validatorMessage = b4a.allocUnsafe(32 + 32); // TODO: use constants. tx + nonce sizes. Avoid magic numbers.
        b4a.copy(tx, validatorMessage, 0);
        b4a.copy(validatorNonce, validatorMessage, 32);
        const validatorMessageHash = await blake3Hash(validatorMessage);
        const validatorAddress = addressUtils.bufferToAddress(validatorAddressBuffer);
        if (null === validatorAddress) return;
        const validatorPublicKey = Wallet.decodeBech32mSafe(validatorAddress);
        if (null === validatorPublicKey) return;
        const isValidatorSignatureValid = this.#wallet.verify(validatorSignature, validatorMessageHash, validatorPublicKey);
        if (!isValidatorSignatureValid) return;

        // if user is performing a transaction on deployed bootstrap, then we need to reject it.
        // if deployment/<bootstrap> is not null then it means that the bootstrap is already deployed, and it should
        // point to payload, which is pointing to the txHash.
        const deploymentEntry = await this.#getDeploymentEntryApply(op.txo.bs.toString('hex'), batch);
        if (deploymentEntry === null) return;

        const hashHexString = tx.toString('hex');
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (null !== opEntry) return;

        await batch.put(hashHexString, node.value);
        if (this.#enable_txlogs === true) {
            console.log(`TX: ${hashHexString} appended. Signed length: `, this.#base.view.core.signedLength);
        }
    }

    async #handleApplyAddAdminOperation(op, view, base, node, batch) {
        if (!this.check.validateExtendedKeyOpSchema(op)) return;
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);

        if (null === adminEntry) {
            await this.#addAdminIfNotSet(op, view, node, batch);
        }
        else {
            await this.#addAdminIfSet(adminEntry, op, view, node, base, batch);
        }
    }

    async #addAdminIfSet(adminEntry, op, view, node, base, batch) {
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (null === decodedAdminEntry) return;
        const publicKeyAdminEntry = Wallet.decodeBech32mSafe(decodedAdminEntry.address);

        // Extract and validate the network prefix from the node's address
        const adminAddressBuffer = op.address;
        const adminAddress = addressUtils.bufferToAddress(adminAddressBuffer);
        if (null === adminAddress) return;
        const adminPublicKey = Wallet.decodeBech32mSafe(adminAddress);
        if (adminPublicKey === null) return;

        if (!b4a.equals(publicKeyAdminEntry, adminPublicKey)) return;

        // verify signature
        const message = createMessage(adminAddressBuffer, op.eko.wk, op.eko.nonce, op.type)
        const hash = await blake3Hash(message);
        const isMessageVerifed = this.#wallet.verify(op.eko.sig, hash, publicKeyAdminEntry)
        const hashHexString = hash.toString('hex');
        // Check if the operation has already been applied
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (!isMessageVerifed || null !== opEntry) return

        // Check if the admin and indexers entry is valid
        const indexersEntry = await this.#getEntryApply(EntryType.INDEXERS, batch);
        if (indexersEntry === null) return;

        const indexerIndex = indexerEntryUtils.getIndex(indexersEntry, adminAddressBuffer);
        if (indexerIndex === -1) return; // Admin address is not in indexers entry

        const newAdminEntry = adminEntryUtils.encode(adminAddressBuffer, op.eko.wk);
        if (newAdminEntry.length === 0) return;

        // Revoke old wk and add new one as an indexer
        await base.removeWriter(decodedAdminEntry.wk);
        await base.addWriter(op.eko.wk, { isIndexer: true });

        // Remove the old admin entry and add the new one
        await batch.put(EntryType.ADMIN, newAdminEntry);
        await batch.put(hashHexString, node.value);
        console.log(`Admin updated: ${decodedAdminEntry.address}:${op.eko.wk.toString('hex')}`);
    }

    async #addAdminIfNotSet(op, view, node, batch) {
        // Extract and validate the network address
        const adminAddressBuffer = op.address;
        const adminAddress = addressUtils.bufferToAddress(adminAddressBuffer);
        if (adminAddress === null) return;
        const adminPublicKey = Wallet.decodeBech32mSafe(adminAddress);
        if (adminPublicKey === null) return;

        // verify signature
        const message = createMessage(adminAddressBuffer, op.eko.wk, op.eko.nonce, op.type)
        const hash = await blake3Hash(message);
        const isMessageVerifed = this.#wallet.verify(op.eko.sig, hash, adminPublicKey)
        const hashHexString = hash.toString('hex');

        // Check if the operation has already been applied
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (
            !b4a.equals(node.from.key, this.#bootstrap) ||
            !b4a.equals(op.eko.wk, this.#bootstrap) ||
            !isMessageVerifed ||
            null !== opEntry
        ) return;

        // Create a new admin entry
        const adminEntry = adminEntryUtils.encode(adminAddressBuffer, op.eko.wk);
        const initIndexers = indexerEntryUtils.append(adminAddressBuffer);

        if (initIndexers.length === 0 || adminEntry.length === 0) return;
        // initialize admin entry and indexers entry
        await batch.put(EntryType.ADMIN, adminEntry);
        await batch.put(EntryType.INDEXERS, initIndexers);
        await batch.put(hashHexString, node.value);

        console.log(`Admin added: ${adminAddress}:${this.#bootstrap.toString('hex')}`);
    }

    async #handleApplyAppendWhitelistOperation(op, view, base, node, batch) {
        if (!this.check.validateBasicKeyOp(op)) return;// TODO change name to validateBasicKeyOp

        // Retrieve and decode the admin entry to verify the operation is initiated by an admin
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        if (null === adminEntry) return;
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (null === decodedAdminEntry || !this.#isAdminApply(decodedAdminEntry, node)) return;

        // Extract admin entry
        const adminAddress = decodedAdminEntry.address;
        const adminPublicKey = Wallet.decodeBech32mSafe(adminAddress);
        if (adminPublicKey === null) return;

        // Extract and validate the network prefix from the node's address
        const nodeAddressBinnary = op.address;

        const nodeAddressString = addressUtils.bufferToAddress(nodeAddressBinnary);
        if (nodeAddressString === null) return;
        const nodePublicKey = Wallet.decodeBech32mSafe(nodeAddressString);
        if (nodePublicKey === null) return;


        // verify signature
        const message = createMessage(op.address, op.bko.nonce, op.type);
        const hash = await blake3Hash(message);
        const isMessageVerifed = this.#wallet.verify(op.bko.sig, hash, adminPublicKey);
        const hashHexString = hash.toString('hex');

        // Check if the operation has already been applied
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (!isMessageVerifed || null !== opEntry) return;

        // Retrieve the node entry to check its current role
        const nodeEntry = await this.#getEntryApply(nodeAddressString, batch);
        if (nodeEntryUtils.isWhitelisted(nodeEntry)) return; // Node is already whitelisted

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
            const initializedNodeEntry = nodeEntryUtils.init(ZERO_WK, nodeRoleUtils.NodeRole.WHITELISTED);
            await batch.put(nodeAddressString, initializedNodeEntry);
            await batch.put(hashHexString, node.value);
        } else {
            // If the node entry exists, update its role to WHITELISTED. Case if account will buy license from market but it existed before - for example it had balance.
            const editedNodeEntry = nodeEntryUtils.setRole(nodeEntry, nodeRoleUtils.NodeRole.WHITELISTED);
            await batch.put(nodeAddressString, editedNodeEntry);
            await batch.put(hashHexString, node.value);
        }
        // Only whitelisted node will be able to become a writer/indexer.

    }

    async #handleApplyAddWriterOperation(op, view, base, node, batch) {
        if (!this.check.validateExtendedKeyOpSchema(op)) return;

        // Extract and validate the network address
        const nodeAddressBuffer = op.address;
        const nodeAddress = addressUtils.bufferToAddress(nodeAddressBuffer);
        if (nodeAddress === null) return;
        const nodePublicKey = Wallet.decodeBech32mSafe(nodeAddress);
        if (nodePublicKey === null) return;

        if (b4a.equals(op.eko.wk, ZERO_WK)) return;

        // Ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (null === decodedAdminEntry || !this.#isAdminApply(decodedAdminEntry, node)) return;

        // verify signature
        const message = createMessage(op.address, op.eko.wk, op.eko.nonce, op.type)
        const hash = await blake3Hash(message);
        const isMessageVerifed = this.#wallet.verify(op.eko.sig, hash, nodePublicKey);
        const hashHexString = hash.toString('hex');

        // Check if the operation has already been applied
        const opEntry = await this.#getEntryApply(hashHexString, batch);

        if (!isMessageVerifed || null !== opEntry) return;
        await this.#addWriter(op, base, node, batch, hashHexString, nodeAddress);
    }

    async #addWriter(op, base, node, batch, hashHexString, nodeAddress) {
        // Retrieve the node entry for the given key
        const nodeEntry = await this.#getEntryApply(nodeAddress, batch);
        if (nodeEntry === null) return;

        const isWhitelisted = nodeEntryUtils.isWhitelisted(nodeEntry);
        const isWriter = nodeEntryUtils.isWriter(nodeEntry);
        const isIndexer = nodeEntryUtils.isIndexer(nodeEntry);

        // To become a writer the node must be whitelisted and not already a writer or indexer
        if (isIndexer || isWriter || !isWhitelisted) return;

        // Retrieve and increment the writers length entry
        let length = await this.#getEntryApply(EntryType.WRITERS_LENGTH, batch);
        let incrementedLength = null;
        if (null === length) {
            // Initialize the writers length entry if it does not exist
            const bufferedLength = lengthEntryUtils.init(0);
            length = lengthEntryUtils.decode(bufferedLength);
            incrementedLength = lengthEntryUtils.increment(length);
        } else {
            // Decode and increment the existing writers length entry
            length = lengthEntryUtils.decode(length);
            incrementedLength = lengthEntryUtils.increment(length);
        }
        if (null === incrementedLength) return;

        // Update the node entry to assign the writer role
        const updatedNodeEntry = nodeEntryUtils.setRoleAndWriterKey(nodeEntry, nodeRoleUtils.NodeRole.WRITER, op.eko.wk);
        if (updatedNodeEntry === null) return;

        // Add the writer role to the base and update the batch
        await base.addWriter(op.eko.wk, { isIndexer: false });
        await batch.put(nodeAddress, updatedNodeEntry);

        // Update the writers index and length entries
        await batch.put(EntryType.WRITERS_INDEX + length, op.address);
        await batch.put(EntryType.WRITERS_LENGTH, incrementedLength);
        await batch.put(hashHexString, node.value);

        console.log(`Writer added: ${nodeAddress}:${op.eko.wk.toString('hex')}`);
    }

    async #handleApplyRemoveWriterOperation(op, view, base, node, batch) {
        if (!this.check.validateExtendedKeyOpSchema(op)) return;

        // Extract and validate the network address
        const nodeAddressBuffer = op.address;
        const nodeAddress = addressUtils.bufferToAddress(nodeAddressBuffer);
        if (nodeAddress === null) return;
        const nodePublicKey = Wallet.decodeBech32mSafe(nodeAddress);
        if (nodePublicKey === null) return;

        // Ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (null === decodedAdminEntry || !this.#isAdminApply(decodedAdminEntry, node)) return;

        // verify signature
        const message = createMessage(op.address, op.eko.wk, op.eko.nonce, op.type);
        const hash = await blake3Hash(message);
        const isMessageVerifed = this.#wallet.verify(op.eko.sig, hash, nodePublicKey);
        const hashHexString = hash.toString('hex');

        // Check if the operation has already been applied
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (!isMessageVerifed || null !== opEntry) return;

        // Proceed to remove the writer role from the node
        await this.#removeWriter(op, base, node, batch, hashHexString, nodeAddress);
    }

    async #removeWriter(op, base, node, batch, hashHexString, nodeAddress) {
        // Retrieve the node entry for the given key
        const nodeEntry = await this.#getEntryApply(nodeAddress, batch);
        if (null === nodeEntry) return;

        // what if we will compre current wk with op.eko.wk?

        // Check if the node is a writer or an indexer
        const isNodeWriter = nodeEntryUtils.isWriter(nodeEntry);
        const isNodeIndexer = nodeEntryUtils.isIndexer(nodeEntry);

        if (isNodeWriter && !isNodeIndexer) {
            // Decode the node entry and downgrade its role to WHITELISTED reader.
            const decodedNodeEntry = nodeEntryUtils.decode(nodeEntry);
            if (decodedNodeEntry === null) return;

            const updatedNodeEntry = nodeEntryUtils.setRole(nodeEntry, nodeRoleUtils.NodeRole.WHITELISTED);
            if (updatedNodeEntry === null) return;

            // Remove the writer role and update the state
            await base.removeWriter(decodedNodeEntry.wk);
            await batch.put(nodeAddress, updatedNodeEntry);
            await batch.put(hashHexString, node.value);
            console.log(`Writer removed: ${nodeAddress}:${decodedNodeEntry.wk.toString('hex')}`);

        } else if (isNodeIndexer) {
            // Decode the node entry and update its role to WHITELISTED
            const decodedNodeEntry = nodeEntryUtils.decode(nodeEntry);
            if (decodedNodeEntry === null) return;

            const updatedNodeEntry = nodeEntryUtils.setRole(nodeEntry, nodeRoleUtils.NodeRole.WHITELISTED);
            if (updatedNodeEntry === null) return;

            // Retrieve the indexers entry and remove the indexer
            const indexersEntry = await this.#getEntryApply(EntryType.INDEXERS, batch);
            if (null === indexersEntry) return;
            const updatedIndexerEntry = indexerEntryUtils.remove(op.address, indexersEntry);
            if (updatedIndexerEntry.length === 0) return;

            // Remove the writer role and update the state
            await base.removeWriter(decodedNodeEntry.wk);
            await batch.put(nodeAddress, updatedNodeEntry);
            await batch.put(EntryType.INDEXERS, updatedIndexerEntry);
            await batch.put(hashHexString, node.value);
            console.log(`Indexer removed thought removeWriter: ${nodeAddress}:${decodedNodeEntry.wk.toString('hex')}`);
        }
    }

    async #handleApplyAddIndexerOperation(op, view, base, node, batch) {
        if (!this.check.validateBasicKeyOp(op)) {
            return;
        }
        // Extract and validate the network address
        const nodeAddressBuffer = op.address;
        const nodeAddress = addressUtils.bufferToAddress(nodeAddressBuffer);
        if (nodeAddress === null) return;
        const nodePublicKey = Wallet.decodeBech32mSafe(nodeAddress);
        if (nodePublicKey === null) return;

        // ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        if (null === adminEntry) return;
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (null === decodedAdminEntry) return;
        const adminPublicKey = Wallet.decodeBech32mSafe(decodedAdminEntry.address);
        if (adminPublicKey === null) return;
        if (b4a.equals(nodePublicKey, adminPublicKey) || !this.#isAdminApply(decodedAdminEntry, node)) return;

        // verify signature
        const message = createMessage(op.address, op.bko.nonce, op.type);
        const hash = await blake3Hash(message);
        const isMessageVerifed = this.#wallet.verify(op.bko.sig, hash, adminPublicKey);
        const hashHexString = hash.toString('hex');
        // check if the operation has been already applied
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (!isMessageVerifed || null !== opEntry) return;
        await this.#addIndexer(op, batch, base, hashHexString, nodeAddress);
    }

    async #addIndexer(op, batch, base, hashHexString, nodeAddress) {
        const nodeEntry = await this.#getEntryApply(nodeAddress, batch);
        if (null === nodeEntry) return;
        const decodedNodeEntry = nodeEntryUtils.decode(nodeEntry);
        if (null === decodedNodeEntry) return;

        //check if node is allowed to become an indexer
        const isNodeWriter = nodeEntryUtils.isWriter(nodeEntry);
        const isNodeIndexer = nodeEntryUtils.isIndexer(nodeEntry);
        if (!isNodeWriter || isNodeIndexer) return;
        //update node entry to indexer
        const updatedNodeEntry = nodeEntryUtils.setRole(nodeEntry, nodeRoleUtils.NodeRole.INDEXER)
        if (null === updatedNodeEntry) return;
        // ensure that indexers entry exists and that it does not contain the address already
        const indexersEntry = await this.#getEntryApply(EntryType.INDEXERS, batch);
        if (null === indexersEntry) return;
        const indexerListHasAddress = indexerEntryUtils.getIndex(indexersEntry, op.address) !== -1;
        if (indexerListHasAddress) return;
        // append indexer to indexers entry
        const updatedIndexerEntry = indexerEntryUtils.append(op.address, indexersEntry);
        if (updatedIndexerEntry.length === 0) return;
        // set indexer role
        await base.removeWriter(decodedNodeEntry.wk);
        await base.addWriter(decodedNodeEntry.wk, { isIndexer: true })
        // update node entry and indexers entry
        await batch.put(EntryType.INDEXERS, updatedIndexerEntry);
        await batch.put(nodeAddress, updatedNodeEntry);
        // store operation hash to avoid replay attack.
        await batch.put(hashHexString, op.value);

        console.log(`Indexer added: ${nodeAddress}:${decodedNodeEntry.wk.toString('hex')}`);
    }

    async #handleApplyRemoveIndexerOperation(op, view, base, node, batch) {
        if (!this.check.validateBasicKeyOp(op)) return;

        // Extract and validate the network address
        const nodeAddressBuffer = op.address;
        const nodeAddress = addressUtils.bufferToAddress(nodeAddressBuffer);
        if (nodeAddress === null) return;
        const nodePublicKey = Wallet.decodeBech32mSafe(nodeAddress);
        if (nodePublicKey === null) return;

        // ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        if (null === adminEntry) return;
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (null === decodedAdminEntry) return;
        const adminPublicKey = Wallet.decodeBech32mSafe(decodedAdminEntry.address);
        if (adminPublicKey === null) return;
        if (b4a.equals(nodePublicKey, adminPublicKey) || !this.#isAdminApply(decodedAdminEntry, node)) return;

        // verify signature
        const message = createMessage(op.address, op.bko.nonce, op.type);
        const hash = await blake3Hash(message);
        const isMessageVerifed = this.#wallet.verify(op.bko.sig, hash, adminPublicKey);
        const hashHexString = hash.toString('hex');
        // check if the operation has already been applied
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (!isMessageVerifed || null !== opEntry) return;

        await this.#removeIndexer(op, batch, base, hashHexString, nodeAddress);
    }

    async #removeIndexer(op, batch, base, hashHexString, nodeAddress) {
        const nodeEntry = await this.#getEntryApply(nodeAddress, batch);
        if (null === nodeEntry) return;
        const decodedNodeEntry = nodeEntryUtils.decode(nodeEntry);
        if (null === decodedNodeEntry) return;

        //check if node is an indexer
        const isNodeIndexer = nodeEntryUtils.isIndexer(nodeEntry);
        if (!isNodeIndexer) return;

        //update node entry to writer
        const updatedNodeEntry = nodeEntryUtils.setRoleAndWriterKey(nodeEntry, nodeRoleUtils.NodeRole.WRITER, decodedNodeEntry.wk)
        if (null === updatedNodeEntry) return;

        // ensure that indexers entry exists and that it does contain the address already
        const indexersEntry = await this.#getEntryApply(EntryType.INDEXERS, batch);
        if (null === indexersEntry) return;

        const indexerListHasAddress = indexerEntryUtils.getIndex(indexersEntry, op.address) !== -1;
        if (!indexerListHasAddress) return;

        // remove indexer from indexers entry
        const updatedIndexerEntry = indexerEntryUtils.remove(op.address, indexersEntry);
        if (updatedIndexerEntry.length === 0) return;

        // get writers length and increment it
        let length = await this.#getEntryApply(EntryType.WRITERS_LENGTH, batch);
        let incrementedLength = null;
        if (null === length) {
            const bufferedLength = lengthEntryUtils.init(0);
            length = lengthEntryUtils.decode(bufferedLength);
            incrementedLength = lengthEntryUtils.increment(length);
        } else {
            length = lengthEntryUtils.decode(length);
            incrementedLength = lengthEntryUtils.increment(length);
        }
        if (null === incrementedLength) return;

        // downgrade role to writer
        await base.removeWriter(decodedNodeEntry.wk);
        await base.addWriter(decodedNodeEntry.wk, { isIndexer: false });
        // update writers index and length
        await batch.put(EntryType.WRITERS_INDEX + length, op.address);
        await batch.put(EntryType.WRITERS_LENGTH, incrementedLength);
        //update node entry and indexers entry
        await batch.put(EntryType.INDEXERS, updatedIndexerEntry);
        await batch.put(nodeAddress, updatedNodeEntry);
        // store operation hash to avoid replay attack.
        await batch.put(hashHexString, op.value);
        console.log(`Indexer has been removed: ${nodeAddress}:${decodedNodeEntry.wk.toString('hex')}`);

    }

    async #handleApplyBanValidatorOperation(op, view, base, node, batch) {
        if (!this.check.validateBasicKeyOp(op)) return;

        // Extract and validate the network prefix from the node's address
        const nodeAddressBuffer = op.address;
        const nodeAddress = addressUtils.bufferToAddress(nodeAddressBuffer);
        if (nodeAddress === null) return;
        const nodePublicKey = Wallet.decodeBech32mSafe(nodeAddress);
        if (nodePublicKey === null) return;

        // ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        if (null === adminEntry) return;
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (null === decodedAdminEntry) return;
        const adminPublicKey = Wallet.decodeBech32mSafe(decodedAdminEntry.address);
        if (null === adminPublicKey || b4a.equals(nodePublicKey, adminPublicKey) || !this.#isAdminApply(decodedAdminEntry, node)) return;

        // verify signature
        const message = createMessage(op.address, op.bko.nonce, op.type);
        const hash = await blake3Hash(message);
        const isMessageVerifed = this.#wallet.verify(op.bko.sig, hash, adminPublicKey);
        const hashHexString = hash.toString('hex');
        // check if the operation has already been applied
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (!isMessageVerifed || null !== opEntry) return;

        const nodeEntry = await this.#getEntryApply(nodeAddress, batch);
        if (null === nodeEntry) return; // Node entry must exist to ban it.

        // Atleast writer must be whitelisted to ban it.
        const isWhitelisted = nodeEntryUtils.isWhitelisted(nodeEntry);
        const isWriter = nodeEntryUtils.isWriter(nodeEntry);
        const isIndexer = nodeEntryUtils.isIndexer(nodeEntry);
        // only writer/whitelisted node can be banned.
        if ((!isWhitelisted && !isWriter) || isIndexer) return;


        const updatedNodeEntry = nodeEntryUtils.setRole(nodeEntry, nodeRoleUtils.NodeRole.READER);
        if (null === updatedNodeEntry) return;
        const decodedNodeEntry = nodeEntryUtils.decode(updatedNodeEntry);
        if (null === decodedNodeEntry) return;

        // Remove the writer role and update the state
        await base.removeWriter(decodedNodeEntry.wk);
        await batch.put(nodeAddress, updatedNodeEntry);
        await batch.put(hashHexString, op.value);
        console.log(`Node has been banned: ${nodeAddress}:${decodedNodeEntry.wk.toString('hex')}`);
    }

    async #handleApplyBootstrapDeploymentOperation(op, view, base, node, batch) {
        if (b4a.byteLength(node.value) > 4096) return;
        if (!this.check.validateBootstrapDeployment(op)) return;

        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.bdo,"vs") || !Object.hasOwn(op.bdo,"va")|| !Object.hasOwn(op.bdo,"vn")) return;
        const tx =  op.bdo.tx
        // ensure that tx is valid
        const regeneratedTxBuffer = await transactionUtils.generateBootstrapDeploymentTxBuffer(op.bdo.bs, op.bdo.in, OperationType.BOOTSTRAP_DEPLOYMENT)
        if (regeneratedTxBuffer.length === 0 || !b4a.equals(regeneratedTxBuffer, tx)) return;

        // for additional security, nonces should be different.
        if (b4a.equals(op.bdo.in, op.bdo.vn)) return;

        // do not allow to deploy bootstrap deployment on the same bootstrap.
        if (b4a.equals(op.bdo.bs, this.bootstrap)) return;

        // first signature
        const incomingAddressBuffer = op.address;
        const incomingAddress = addressUtils.bufferToAddress(incomingAddressBuffer);
        if (null === incomingAddress) return;

        const incomingPublicKey = Wallet.decodeBech32mSafe(incomingAddress);
        if (null === incomingPublicKey) return;

        const isRequesterSignatureValid = this.#wallet.verify(op.bdo.is, tx, incomingPublicKey); // tx contains already a nonce.
        if (!isRequesterSignatureValid) return;

        //second signature
        const validatorAddressBuffer = op.bdo.va;

        const validatorAddress = addressUtils.bufferToAddress(validatorAddressBuffer);
        if (null === validatorAddress) return;

        const validatorPublicKey = Wallet.decodeBech32mSafe(validatorAddress);
        if (null === validatorPublicKey) return;

        const validatorMessage = b4a.allocUnsafe(32 + 32); // TODO: use constants. tx + nonce sizes. Avoid magic numbers.
        b4a.copy(tx, validatorMessage, 0);
        b4a.copy(op.bdo.vn, validatorMessage, 32);
        const validatorMessageHash = await blake3Hash(validatorMessage);

        const isValidatorSignatureValid = this.#wallet.verify(op.bdo.vs, validatorMessageHash, validatorPublicKey);
        if (!isValidatorSignatureValid) return;

        const deploymentEntry = await this.#getDeploymentEntryApply(op.bdo.bs.toString('hex'), batch);
        if (deploymentEntry !== null) return; // Deployment already exists, do not apply it again.

        const hashHexString = tx.toString('hex');
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (null !== opEntry) return; // Operation has already been applied.

        await batch.put(hashHexString, node.value);
        await batch.put(EntryType.DEPLOYMENT + op.bdo.bs.toString('hex'), tx);
        if (this.#enable_txlogs === true) {
            console.log(`TX: ${hashHexString} and deployment/${op.bdo.bs.toString('hex')} have been appended. Signed length: `, this.#base.view.core.signedLength);
        }
    }

    #isAdminApply(adminEntry, node) {
        if (!adminEntry || !node) return false;
        return b4a.equals(adminEntry.wk, node.from.key);
    }

    async #getEntryApply(key, batch) {
        const entry = await batch.get(key);
        return entry !== null ? entry.value : null
    }

    async #getDeploymentEntryApply(key, batch) {
        const entry = await batch.get(EntryType.DEPLOYMENT + key);
        return entry !== null ? entry.value : null
    }
}

export default State;
