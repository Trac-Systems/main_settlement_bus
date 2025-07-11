import ReadyResource from 'ready-resource';
import Autobase from 'autobase';
import Hyperbee from 'hyperbee';
import b4a from 'b4a';
import {
    ACK_INTERVAL,
    EntryType,
    OperationType,
    TRAC_NETWORK_PREFIX,
} from '../../utils/constants.js';
import { sleep } from '../../utils/helpers.js';
import { createHash, generateTx } from '../../utils/crypto.js';
import Check from '../../utils/check.js';
import { safeDecodeApplyOperation } from '../../utils/protobuf/operationHelpers.js';
import { createMessage } from '../../utils/buffer.js';
import ApplyOperationEncodings from './ApplyOperationEncodings.js';
//TODO: describe apply operation +- what is going on to increase readability.
//TODO; Integrate with bench32m
class State extends ReadyResource {

    #base;
    #bee;
    #bootstrap;
    #store;
    #signature_whitelist;
    #wallet;
    #enable_txlogs;
    #writingKey;

    constructor(store, bootstrap, wallet, options = {}) {
        super();

        this.#store = store;
        this.#bootstrap = bootstrap;
        this.#wallet = wallet;
        this.#signature_whitelist = options.signature_whitelist !== undefined && Array.isArray(options.signature_whitelist) ? options.signature_whitelist : [];
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
        const adminEntry = await this.get(EntryType.ADMIN);
        return adminEntry ? ApplyOperationEncodings.decodeAdminEntry(adminEntry) : null;
    }

    async getNodeEntry(address) {
        const nodeEntry = await this.get(address);
        return nodeEntry ? ApplyOperationEncodings.decodeNodeEntry(nodeEntry) : null;
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
        const indexersEntry = await this.get(EntryType.INDEXERS);
        return indexersEntry
    }

    async isAddressInIndexersEntry(address, indexersEntry) {
        if (indexersEntry === null || address === null) return false;
        const indexerListHasAddress = ApplyOperationEncodings.getIndexerIndex(indexersEntry, address) !== -1;
        return indexerListHasAddress;
    }

    async getWriterLength() {
        const writersLength = await this.get(EntryType.WRITERS_LENGTH);
        return writersLength ? ApplyOperationEncodings.decodeLengthEntry(writersLength) : null;
    }

    async getWriterIndex(index) {
        if (index < 0 || index > Number.MAX_SAFE_INTEGER) return null;
        const writerPublicKey = await this.get(EntryType.WRITERS_INDEX + index);
        return writerPublicKey ? writerPublicKey : null;
    }

    async append(payload) {
        await this.#base.append(payload);
    }
    // this is helpful
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
            [OperationType.POST_TX]: this.#handleApplyTxOperation.bind(this),
            [OperationType.ADD_ADMIN]: this.#handleApplyAddAdminOperation.bind(this),
            [OperationType.APPEND_WHITELIST]: this.#handleApplyAppendWhitelistOperation.bind(this),
            [OperationType.ADD_WRITER]: this.#handleApplyAddWriterOperation.bind(this),
            [OperationType.REMOVE_WRITER]: this.#handleApplyRemoveWriterOperation.bind(this),
            [OperationType.ADD_INDEXER]: this.#handleApplyAddIndexerOperation.bind(this),
            [OperationType.REMOVE_INDEXER]: this.#handleApplyRemoveIndexerOperation.bind(this),
            [OperationType.BAN_VALIDATOR]: this.#handleApplyBanValidatorOperation.bind(this),
        };
        return handlers[type] || null;
    }

    async #handleApplyTxOperation(op, view, base, node, batch) {
        const postTx = op.value;
        if (this.check.sanitizePostTx(op) && // ATTENTION: The sanitization should be done before ANY other check, otherwise we risk crashing
            postTx.op === OperationType.POST_TX &&
            (this.#signature_whitelist.length === 0 || this.#signature_whitelist.includes(postTx.bs)) &&
            null === await batch.get(op.key) &&
            op.key === postTx.tx &&
            this.#wallet.verify(b4a.from(postTx.is, 'hex'), b4a.from(postTx.tx + postTx.in), b4a.from(postTx.ipk, 'hex')) &&
            this.#wallet.verify(b4a.from(postTx.ws, 'hex'), b4a.from(postTx.tx + postTx.wn), b4a.from(postTx.wp, 'hex')) &&
            postTx.tx === await generateTx(postTx.bs, this.#bootstrap, postTx.wp, postTx.i, postTx.ipk, postTx.ch, postTx.in) &&
            b4a.byteLength(JSON.stringify(postTx)) <= 4096
        ) {
            await batch.put(op.key, op.value);
            if (this.#enable_txlogs === true) {
                console.log(`TX: ${op.key} appended. Signed length: `, this.#base.view.core.signedLength);
            }
        }
    }

    async #handleApplyAddAdminOperation(op, view, base, node, batch) {
        if (!this.check.sanitizeExtendedKeyOpSchema(op)) return;
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = ApplyOperationEncodings.decodeAdminEntry(adminEntry);
        if (null === decodedAdminEntry) {
            await this.#addAdminIfNotSet(op, view, node, batch);
        }
        else if (b4a.equals(decodedAdminEntry.tracAddr, op.key)) {
            await this.#addAdminIfSet(decodedAdminEntry, op, view, node, base, batch);
        }
    }

    async #addAdminIfSet(adminEntry, op, view, node, base, batch) {
        // Extract and validate the network prefix from the node's address
        const tracAddr = adminEntry.tracAddr
        const networkPrefix = tracAddr.slice(0, 1);
        if (networkPrefix.readUInt8(0) !== TRAC_NETWORK_PREFIX) return;
        const tracPublicKey = tracAddr.slice(1, 33);

        // verify signature
        const message = createMessage(tracAddr, op.eko.wk, op.eko.nonce, op.type)
        const hash = await createHash('sha256', message);
        const isMessageVerifed = this.#wallet.verify(op.eko.sig, hash, tracPublicKey)
        const hashHexString = hash.toString('hex');
        // Check if the operation has already been applied
        const opEntry = await batch.get(hashHexString);

        if (!isMessageVerifed || null !== opEntry) return
        // Check if the admin and indexers entry is valid
        const indexersEntry = await this.#getEntryApply(EntryType.INDEXERS, batch);
        const indexerIndex = ApplyOperationEncodings.getIndexerIndex(indexersEntry, adminEntry.tracAddr);
        const newAdminEntry = ApplyOperationEncodings.encodeAdminEntry(adminEntry.tracAddr, op.eko.wk);

        if (indexersEntry === null || indexerIndex === -1 || adminEntry.length === 0) return;
        // Revoke old wk and add new one as an indexer
        await base.removeWriter(adminEntry.wk);
        await base.addWriter(op.eko.wk, { isIndexer: true });
        // Remove the old admin entry and add the new one
        await batch.put(EntryType.ADMIN, newAdminEntry);
        await batch.put(hashHexString, node.value);
        console.log(`Admin updated: ${adminEntry.tracAddr.toString('hex')}:${op.eko.wk.toString('hex')}`);


    }

    async #addAdminIfNotSet(op, view, node, batch) {
        // Extract and validate the network prefix from the node's address
        const tracAddr = op.key;
        const networkPrefix = tracAddr.slice(0, 1);
        if (networkPrefix.readUInt8(0) !== TRAC_NETWORK_PREFIX) return;
        const tracPublicKey = tracAddr.slice(1, 33);

        // verify signature
        const message = createMessage(op.key, op.eko.wk, op.eko.nonce, op.type)
        const hash = await createHash('sha256', message);
        const isMessageVerifed = this.#wallet.verify(op.eko.sig, hash, tracPublicKey)
        const hashHexString = hash.toString('hex');
        // Check if the operation has already been applied
        const opEntry = await batch.get(hashHexString);

        if (
            !b4a.equals(node.from.key, this.#bootstrap) ||
            !b4a.equals(op.eko.wk, this.#bootstrap) ||
            !isMessageVerifed ||
            null !== opEntry
        ) return;
        // Create a new admin entry
        const adminEntry = ApplyOperationEncodings.encodeAdminEntry(tracAddr, op.eko.wk);
        const initIndexers = ApplyOperationEncodings.appendIndexer(tracAddr);

        if (initIndexers.length === 0 || adminEntry.length === 0) return;
        // initialize admin entry and indexers entry
        await batch.put(EntryType.ADMIN, adminEntry);
        await batch.put(EntryType.INDEXERS, initIndexers);
        await batch.put(hashHexString, node.value);
        
        console.log(`Admin added: ${tracPublicKey.toString('hex')}:${this.#bootstrap.toString('hex')}`);
    }

    async #handleApplyAppendWhitelistOperation(op, view, base, node, batch) {
        if (!this.check.sanitizeBasicKeyOp(op)) return;// TODO change name to validateBasicKeyOp

        // Retrieve and decode the admin entry to verify the operation is initiated by an admin
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = ApplyOperationEncodings.decodeAdminEntry(adminEntry);
        if (null === decodedAdminEntry || !this.#isAdminApply(decodedAdminEntry, node)) return;

        // Extract and validate the network prefix from the admin's address
        const adminTracAddr = decodedAdminEntry.tracAddr;
        const networkPrefix = adminTracAddr.slice(0, 1);
        if (networkPrefix.readUInt8(0) !== TRAC_NETWORK_PREFIX) return;
        const adminTracPublicKey = adminTracAddr.slice(1, 33);

        // Extract and validate the network prefix from the node's address
        const nodeTracAddr = op.key;
        const nodeNetworkPrefix = nodeTracAddr.slice(0, 1);
        if (nodeNetworkPrefix.readUInt8(0) !== TRAC_NETWORK_PREFIX) return;

        // verify signature
        const message = createMessage(op.key, op.bko.nonce, op.type);
        const hash = await createHash('sha256', message);
        const isMessageVerifed = this.#wallet.verify(op.bko.sig, hash, adminTracPublicKey);
        const hashHexString = hash.toString('hex');

        // Check if the operation has already been applied
        const opEntry = await batch.get(hashHexString);
        if (!isMessageVerifed || null !== opEntry) return;

        // Retrieve the node entry to check its current role
        const nodeEntry = await this.#getEntryApply(op.key.toString('hex'), batch);
        if (ApplyOperationEncodings.isWhitelisted(nodeEntry)) return; // Node is already whitelisted

        if (!nodeEntry) {
            // If the node entry does not exist, create a new whitelisted node entry
            /*
                Dear reader,
                wk = 00000000000000000000000000000000 on ed25519 is point P.
                P = (19681161376707505956807079304988542015446066515923890162744021073123829784752,0).
                This point lies on the curve but is not a valid point.
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
            const createdNodeEntry = ApplyOperationEncodings.encodeNodeEntry(b4a.alloc(32, 0), ApplyOperationEncodings.NodeRole.WHITELISTED);
            await batch.put(op.key.toString('hex'), createdNodeEntry);
            await batch.put(hashHexString, node.value);

        } else {
            // If the node entry exists, update its role to WHITELISTED. Case if wallet out of network will buy license from market but it existed before.
            const editedNodeEntry = ApplyOperationEncodings.setNodeEntryRole(nodeEntry, ApplyOperationEncodings.NodeRole.WHITELISTED);
            await batch.put(op.key.toString('hex'), editedNodeEntry);
            await batch.put(hashHexString, node.value);
        }

    }

    async #handleApplyAddWriterOperation(op, view, base, node, batch) {
        if (!this.check.sanitizeExtendedKeyOpSchema(op)) return;

        // Extract and validate the network prefix from the node's address
        const nodeTracAddr = op.key;
        const nodeNetworkPrefix = nodeTracAddr.slice(0, 1);
        if (nodeNetworkPrefix.readUInt8(0) !== TRAC_NETWORK_PREFIX) return;

        // Ensure that an admin invoked this operation
        const tracPublicKey = nodeTracAddr.slice(1, 33);
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = ApplyOperationEncodings.decodeAdminEntry(adminEntry);
        if (null === decodedAdminEntry || !this.#isAdminApply(decodedAdminEntry, node)) return;
        // verify signature
        const message = createMessage(op.key, op.eko.wk, op.eko.nonce, op.type)
        const hash = await createHash('sha256', message);
        const isMessageVerifed = this.#wallet.verify(op.eko.sig, hash, tracPublicKey);
        const hashHexString = hash.toString('hex');

        // Check if the operation has already been applied
        const opEntry = await batch.get(hashHexString);

        if (!isMessageVerifed || null !== opEntry) return;
        await this.#addWriter(op, base, node, batch, hashHexString);
    }

    async #addWriter(op, base, node, batch, hashHexString) {
        // Retrieve the node entry for the given key
        const nodeEntry = await this.#getEntryApply(op.key.toString('hex'), batch);
        if (nodeEntry === null) return;

        const isWhitelisted = ApplyOperationEncodings.isWhitelisted(nodeEntry);
        const isWriter = ApplyOperationEncodings.isWriter(nodeEntry);
        const isIndexer = ApplyOperationEncodings.isIndexer(nodeEntry);

        // To become a writer the node must be whitelisted and not already a writer or indexer
        if (isIndexer || isWriter || !isWhitelisted) return;

        // Retrieve and increment the writers length entry
        let length = await this.#getEntryApply(EntryType.WRITERS_LENGTH, batch);
        let incrementedLength = null;
        if (null === length) {
            // Initialize the writers length entry if it does not exist
            const bufferedLength = ApplyOperationEncodings.setUpLengthEntry(0);
            length = ApplyOperationEncodings.decodeLengthEntry(bufferedLength);
            incrementedLength = ApplyOperationEncodings.incrementLengthEntry(length);
        } else {
            // Decode and increment the existing writers length entry
            length = ApplyOperationEncodings.decodeLengthEntry(length);
            incrementedLength = ApplyOperationEncodings.incrementLengthEntry(length);
        }
        if (null === incrementedLength) return;

        // Update the node entry to assign the writer role
        const editedNodeEntry = ApplyOperationEncodings.encodeNodeEntry(op.eko.wk, ApplyOperationEncodings.NodeRole.WRITER);
        if (editedNodeEntry.length === 0) return;

        // Add the writer role to the base and update the batch
        await base.addWriter(op.eko.wk, { isIndexer: false });
        await batch.put(op.key.toString('hex'), editedNodeEntry);

        // Update the writers index and length entries
        await batch.put(EntryType.WRITERS_INDEX + length, op.key);
        await batch.put(EntryType.WRITERS_LENGTH, incrementedLength);
        await batch.put(hashHexString, node.value);

        console.log(`Writer added: ${op.key.toString('hex')}:${op.eko.wk.toString('hex')}`);
    }

    async #handleApplyRemoveWriterOperation(op, view, base, node, batch) {
        if (!this.check.sanitizeExtendedKeyOpSchema(op)) return;

        // Extract and validate the network prefix from the node's address
        const nodeTracAddr = op.key;
        const nodeNetworkPrefix = nodeTracAddr.slice(0, 1);
        if (nodeNetworkPrefix.readUInt8(0) !== TRAC_NETWORK_PREFIX) return;
        const tracPublicKey = nodeTracAddr.slice(1, 33);

        // Ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = ApplyOperationEncodings.decodeAdminEntry(adminEntry);
        if (null === decodedAdminEntry || !this.#isAdminApply(decodedAdminEntry, node)) return;

        // verify signature
        const message = createMessage(op.key, op.eko.wk, op.eko.nonce, op.type);
        const hash = await createHash('sha256', message);
        const isMessageVerifed = this.#wallet.verify(op.eko.sig, hash, tracPublicKey);
        const hashHexString = hash.toString('hex');

        // Check if the operation has already been applied
        const opEntry = await batch.get(hashHexString);
        if (!isMessageVerifed || null !== opEntry) return;

        // Proceed to remove the writer role from the node
        await this.#removeWriter(op, base, node, batch, hashHexString);
    }

    async #removeWriter(op, base, node, batch, hashHexString) {
        // Retrieve the node entry for the given key
        const nodeEntry = await this.#getEntryApply(op.key.toString('hex'), batch);
        if (null === nodeEntry) return;

        // Check if the node is a writer or an indexer
        const isNodeWriter = ApplyOperationEncodings.isWriter(nodeEntry);
        const isNodeIndexer = ApplyOperationEncodings.isIndexer(nodeEntry);

        if (isNodeWriter && !isNodeIndexer) {
            // Decode the node entry and update its role to WHITELISTED
            const decodedNodeEntry = ApplyOperationEncodings.decodeNodeEntry(nodeEntry);
            if (decodedNodeEntry === null) return;
            const updatedNodeEntry = ApplyOperationEncodings.encodeNodeEntry(decodedNodeEntry.wk, ApplyOperationEncodings.NodeRole.WHITELISTED);
            if (updatedNodeEntry.length === 0) return;

            // Remove the writer role and update the state
            await base.removeWriter(decodedNodeEntry.wk);
            await batch.put(op.key.toString('hex'), updatedNodeEntry);
            await batch.put(hashHexString, node.value);
            console.log(`Writer removed: ${op.key.toString('hex')}:${decodedNodeEntry.wk.toString('hex')}`);
        } else if (isNodeIndexer) {
            // Decode the node entry and update its role to WHITELISTED
            const decodedNodeEntry = ApplyOperationEncodings.decodeNodeEntry(nodeEntry);
            if (decodedNodeEntry === null) return;
            const updatedNodeEntry = ApplyOperationEncodings.encodeNodeEntry(decodedNodeEntry.wk, ApplyOperationEncodings.NodeRole.WHITELISTED);
            if (updatedNodeEntry.length === 0) return;

            // Retrieve the indexers entry and remove the indexer
            const indexersEntry = await this.#getEntryApply(EntryType.INDEXERS, batch);
            if (null === indexersEntry) return;
            const updatedIndexerEntry = ApplyOperationEncodings.removeIndexer(op.key, indexersEntry);
            if (updatedIndexerEntry.length === 0) return;

            // Remove the writer role and update the state
            await base.removeWriter(decodedNodeEntry.wk);
            await batch.put(op.key.toString('hex'), updatedNodeEntry);
            await batch.put(EntryType.INDEXERS, updatedIndexerEntry);
            console.log(`Indexer removed trought removeWriter: ${op.key.toString('hex')}:${decodedNodeEntry.wk.toString('hex')}`);
        }
    }

    async #handleApplyAddIndexerOperation(op, view, base, node, batch) {
        if (!this.check.sanitizeBasicKeyOp(op)) {
            return;
        }
        // Extract and validate the network prefix from the node's address
        const nodeTracAddr = op.key;
        const nodeNetworkPrefix = nodeTracAddr.slice(0, 1);
        if (nodeNetworkPrefix.readUInt8(0) !== TRAC_NETWORK_PREFIX) return;
        const tracPublicKey = nodeTracAddr.slice(1, 33);

        // ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = ApplyOperationEncodings.decodeAdminEntry(adminEntry);
        if (null === decodedAdminEntry || b4a.equals(tracPublicKey, decodedAdminEntry.tracAddr) || !this.#isAdminApply(decodedAdminEntry, node)) return;
        const adminTracPublicKey = decodedAdminEntry.tracAddr.slice(1, 33);
        // verify signature
        const message = createMessage(op.key, op.bko.nonce, op.type);
        const hash = await createHash('sha256', message);
        const isMessageVerifed = this.#wallet.verify(op.bko.sig, hash, adminTracPublicKey);
        // check if the operation has already been applied
        const opEntry = await batch.get(hash.toString('hex'));
        const hashHexString = hash.toString('hex');
        if (!isMessageVerifed || null !== opEntry) return;
        await this.#addIndexer(op, batch, base, hashHexString);
    }

    async #addIndexer(op, batch, base, hashHexString) {
        const nodeEntry = await this.#getEntryApply(op.key.toString('hex'), batch);
        const decodedNodeEntry = ApplyOperationEncodings.decodeNodeEntry(nodeEntry);
        if (null === nodeEntry || null === decodedNodeEntry) return;

        //check if node is allowed to be indexer
        const isNodeWriter = ApplyOperationEncodings.isWriter(nodeEntry);
        const isNodeIndexer = ApplyOperationEncodings.isIndexer(nodeEntry);
        if (!isNodeWriter || isNodeIndexer) return;

        //update node entry to indexer
        const updatedNodeEntry = ApplyOperationEncodings.encodeNodeEntry(decodedNodeEntry.wk, ApplyOperationEncodings.NodeRole.INDEXER)
        if (updatedNodeEntry.length === 0) return;

        // ensure that indexers entry exists and that it does not contain the address already
        const indexersEntry = await this.#getEntryApply(EntryType.INDEXERS, batch);
        if (null === indexersEntry) return;
        const indexerListHasAddress = ApplyOperationEncodings.getIndexerIndex(indexersEntry, op.key) !== -1;

        if (indexerListHasAddress) return;

        const updatedIndexerEntry = ApplyOperationEncodings.appendIndexer(op.key, indexersEntry);
        if (updatedIndexerEntry.length === 0) return;

        // set indexer role
        await base.removeWriter(decodedNodeEntry.wk);
        await base.addWriter(decodedNodeEntry.wk, { isIndexer: true })
        // update node entry and indexers entry
        await batch.put(EntryType.INDEXERS, updatedIndexerEntry);
        await batch.put(op.key.toString('hex'), updatedNodeEntry);
        // store operation hash to avoid replay attack. 
        await batch.put(hashHexString, op.value);

        console.log(`Indexer added: ${op.key.toString('hex')}:${decodedNodeEntry.wk.toString('hex')}`);
    }
    //TODO: Adjust for binary data
    async #handleApplyRemoveIndexerOperation(op, view, base, node, batch) {
        if (!this.check.sanitizeBasicKeyOp(op)) return;

        // Extract and validate the network prefix from the node's address
        const nodeTracAddr = op.key;
        const nodeNetworkPrefix = nodeTracAddr.slice(0, 1);
        if (nodeNetworkPrefix.readUInt8(0) !== TRAC_NETWORK_PREFIX) return;
        const tracPublicKey = nodeTracAddr.slice(1, 33);

        // ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = ApplyOperationEncodings.decodeAdminEntry(adminEntry);
        if (null === decodedAdminEntry || b4a.equals(tracPublicKey, decodedAdminEntry.tracAddr) || !this.#isAdminApply(decodedAdminEntry, node)) return;
        const adminTracPublicKey = decodedAdminEntry.tracAddr.slice(1, 33);

        // verify signature
        const message = createMessage(op.key, op.bko.nonce, op.type);
        const hash = await createHash('sha256', message);
        const isMessageVerifed = this.#wallet.verify(op.bko.sig, hash, adminTracPublicKey);
        const hashHexString = hash.toString('hex');
        // check if the operation has already been applied
        const opEntry = await batch.get(hashHexString);
        if (!isMessageVerifed || null !== opEntry) return;

        await this.#removeIndexer(op, batch, base, hashHexString);
    }

    async #removeIndexer(op, batch, base, hashHexString) {
        const nodeEntry = await this.#getEntryApply(op.key.toString('hex'), batch);
        const decodedNodeEntry = ApplyOperationEncodings.decodeNodeEntry(nodeEntry);
        if (null === nodeEntry || null === decodedNodeEntry) return;

        //check if node is allowed to be indexer
        const isNodeIndexer = ApplyOperationEncodings.isIndexer(nodeEntry);
        if (!isNodeIndexer) return;

        //update node entry to writer/whitelisted
        const updatedNodeEntry = ApplyOperationEncodings.encodeNodeEntry(decodedNodeEntry.wk, ApplyOperationEncodings.NodeRole.WRITER)
        if (updatedNodeEntry.length === 0) return;

        // ensure that indexers entry exists and that it does contain the address already
        const indexersEntry = await this.#getEntryApply(EntryType.INDEXERS, batch);
        if (null === indexersEntry) return;

        const indexerListHasAddress = ApplyOperationEncodings.getIndexerIndex(indexersEntry, op.key) !== -1;
        if (!indexerListHasAddress) return;
        // remove indexer from indexers entry
        const updatedIndexerEntry = ApplyOperationEncodings.removeIndexer(op.key, indexersEntry);
        if (updatedIndexerEntry.length === 0) return;

        // get writers length and increment it
        let length = await this.#getEntryApply(EntryType.WRITERS_LENGTH, batch);
        let incrementedLength = null;
        if (null === length) {
            const bufferedLength = ApplyOperationEncodings.setUpLengthEntry(0);
            length = ApplyOperationEncodings.decodeLengthEntry(bufferedLength);
            incrementedLength = ApplyOperationEncodings.incrementLengthEntry(length);
        } else {
            length = ApplyOperationEncodings.decodeLengthEntry(length);
            incrementedLength = ApplyOperationEncodings.incrementLengthEntry(length);
        }
        if (null === incrementedLength) return;

        // downgrade role to writer
        await base.removeWriter(decodedNodeEntry.wk);
        await base.addWriter(decodedNodeEntry.wk, { isIndexer: false });
        // update writers index and length
        await batch.put(EntryType.WRITERS_INDEX + length, op.key);
        await batch.put(EntryType.WRITERS_LENGTH, incrementedLength);
        //update node entry and indexers entry
        await batch.put(EntryType.INDEXERS, updatedIndexerEntry);
        await batch.put(op.key.toString('hex'), updatedNodeEntry);
        // store operation hash to avoid replay attack. 
        await batch.put(hashHexString, op.value);
        console.log(`Indexer has been removed: ${op.key.toString('hex')}:${decodedNodeEntry.wk.toString('hex')}`);

    }

    //TODO: Adjust for binary data
    async #handleApplyBanValidatorOperation(op, view, base, node, batch) {
        if (!this.check.sanitizeBasicKeyOp(op)) return;
        // Extract and validate the network prefix from the node's address
        const nodeTracAddr = op.key;
        const nodeNetworkPrefix = nodeTracAddr.slice(0, 1);
        if (nodeNetworkPrefix.readUInt8(0) !== TRAC_NETWORK_PREFIX) return;
        const tracPublicKey = nodeTracAddr.slice(1, 33);
        // ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = ApplyOperationEncodings.decodeAdminEntry(adminEntry);
        if (null === decodedAdminEntry || b4a.equals(tracPublicKey, decodedAdminEntry.tracAddr) || !this.#isAdminApply(decodedAdminEntry, node)) return;
        const adminTracPublicKey = decodedAdminEntry.tracAddr.slice(1, 33);
        // verify signature
        const message = createMessage(op.key, op.bko.nonce, op.type);
        const hash = await createHash('sha256', message);
        const isMessageVerifed = this.#wallet.verify(op.bko.sig, hash, adminTracPublicKey);
        const hashHexString = hash.toString('hex');
        // check if the operation has already been applied
        const opEntry = await batch.get(hashHexString);
        if (!isMessageVerifed || null !== opEntry) return;

        const nodeEntry = await this.#getEntryApply(op.key.toString('hex'), batch);
        if (null === nodeEntry) return; // Node entry must exist to ban it.
        // Atleast writer must be whitelisted to ban it.
        const isWhitelisted = ApplyOperationEncodings.isWhitelisted(nodeEntry);
        const isWriter = ApplyOperationEncodings.isWriter(nodeEntry);
        const isIndexer = ApplyOperationEncodings.isIndexer(nodeEntry);
        // only writer/whitelisted node can be banned.
        if ((!isWhitelisted && !isWriter) || isIndexer) return;


        const updatedNodeEtrny = ApplyOperationEncodings.setNodeEntryRole(nodeEntry, ApplyOperationEncodings.NodeRole.READER);
        if (updatedNodeEtrny.length === 0) return;
        const decodedNodeEntry = ApplyOperationEncodings.decodeNodeEntry(updatedNodeEtrny);
        if (null === decodedNodeEntry) return;

        // Remove the writer role and update the state
        await base.removeWriter(decodedNodeEntry.wk);
        await batch.put(op.key.toString('hex'), updatedNodeEtrny);
        await batch.put(hashHexString, op.value);
        console.log(`Node has been banned: ${op.key.toString('hex')}:${decodedNodeEntry.wk.toString('hex')}`);
    }

    #isAdminApply(adminEntry, node) {
        if (!adminEntry || !node) return false;
        return b4a.equals(adminEntry.wk, node.from.key);
    }

    async #getEntryApply(key, batch) {
        const entry = await batch.get(key);
        return entry !== null ? entry.value : null
    }
}

export default State;