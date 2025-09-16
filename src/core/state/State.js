import ReadyResource from 'ready-resource';
import Autobase from 'autobase';
import Hyperbee from 'hyperbee';
import b4a from 'b4a';
import {
    ACK_INTERVAL,
    ADMIN_INITIAL_BALANCE,
    EntryType,
    OperationType
} from '../../utils/constants.js';
import { isHexString, sleep } from '../../utils/helpers.js';
import PeerWallet from 'trac-wallet';
import Check from '../../utils/check.js';
import { safeDecodeApplyOperation } from '../../utils/protobuf/operationHelpers.js';
import { createMessage, ZERO_WK, isBufferValid } from '../../utils/buffer.js';
import addressUtils from './utils/address.js';
import adminEntryUtils from './utils/adminEntry.js';
import nodeEntryUtils, { setWritingKey, ZERO_BALANCE, NODE_ENTRY_SIZE } from './utils/nodeEntry.js';
import nodeRoleUtils from './utils/roles.js';
import lengthEntryUtils from './utils/lengthEntry.js';
import transactionUtils from './utils/transaction.js';
import {blake3Hash} from '../../utils/crypto.js';
import { BALANCE_FEE, toBalance, PERCENT_75 } from './utils/balance.js';
import { safeWriteUInt32BE } from '../../utils/buffer.js';

class State extends ReadyResource {
    //TODO: AFTER createMessage(..args) check if this function did not return NULL
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

    // PLACEHOLDER
    async getUnsignedNodeEntry(address) {
        const nodeEntry = await this.get(address);
        return nodeEntry ? nodeEntryUtils.decode(nodeEntry) : null;
    }

    // PLACEHOLDER
    // WARNING: DO NOT USE IN APPLY FUNCTION!!!
    async incrementBalance(address, toIncrement) {
        if (isBufferValid(toIncrement, NODE_ENTRY_SIZE) || b4a.equals(toIncrement, ZERO_BALANCE)) return null
        const nodeEntry = await this.getNodeEntry(address);
        if (nodeEntry === null) return null;
        const balance = toBalance(nodeEntry.balance)
        const result = balance.add(toBalance(toIncrement))
        return result.update(nodeEntryUtils.encode(nodeEntry))
    }

    // PLACEHOLDER
    // WARNING: DO NOT USE IN APPLY FUNCTION!!!
    async decrementBalance(address, toDecrement) {
        if (isBufferValid(toDecrement, NODE_ENTRY_SIZE) || b4a.equals(toDecrement, ZERO_BALANCE)) return null
        const nodeEntry = await this.getNodeEntry(address);
        if (nodeEntry === null) return null;
        if (toBalance(nodeEntry.balance).lowerThan(toBalance(toDecrement))) return null;
        const balance = toBalance(nodeEntry.balance)
        const result = balance.sub(toBalance(toDecrement))
        return result.update(nodeEntryUtils.encode(nodeEntry))
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
        return writersLength ? lengthEntryUtils.decode(writersLength) : null;
    }

    async getWriterIndex(index) {
        if (index < 0 || index > Number.MAX_SAFE_INTEGER) return null;
        const writerPublicKey = await this.getSigned(EntryType.WRITERS_INDEX + index);
        return writerPublicKey ? writerPublicKey : null;
    }

    async getRegisteredBootstrapEntry(bootstrap) {
        if (!bootstrap || !isHexString(bootstrap) || bootstrap.length !== 64) return null;
        return await this.getSigned(EntryType.DEPLOYMENT + bootstrap);

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
            if (b4a.byteLength(node.value) > transactionUtils.MAXIMUM_OPERATION_PAYLOAD_SIZE) return;

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
        if (!this.check.validateBalanceInitialization(op)) return;

        // Extract and validate the network address
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer);
        if (adminAddressString === null) return;

        // Verify requester admin public key
        const requesterAdminPublicKey = PeerWallet.decodeBech32mSafe(adminAddressString);
        if (requesterAdminPublicKey === null) return;

        // Verify that the amount is not zero
        const amount = toBalance(op.bio.am);
        if (amount == null) return;
        const recipientAddress = op.bio.ia;
        const recipientAddressString = addressUtils.bufferToAddress(recipientAddress);

        // Validate recipient public key
        const recipientPublicKey = PeerWallet.decodeBech32mSafe(recipientAddressString);
        if (recipientPublicKey === null) return;

        // Entry has been disabled so there is nothing to do
        if (await this.#isApplyInitalizationDisabled(batch)) return;

        // Ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (null === decodedAdminEntry || !this.#isAdminApply(decodedAdminEntry, node)) return;
        const adminPublicKey = PeerWallet.decodeBech32mSafe(decodedAdminEntry.address);
        if (adminPublicKey === null) return;

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterAdminPublicKey)) return

        // Recreate requester message
        const message = createMessage(op.address, op.bio.txv, op.bio.in, op.bio.ia, amount.value, OperationType.BALANCE_INITIALIZATION);
        if (message.length === 0) return;

        const hash = await blake3Hash(message);
        const txHashHexString = op.bio.tx.toString('hex');
        if (!b4a.equals(hash, op.bio.tx)) return;

        // Verify signature
        const isMessageVerifed = this.#wallet.verify(op.bio.is, hash, adminPublicKey);
        if (!isMessageVerifed) return;

        // Verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) return;
        if (!b4a.equals(op.bio.txv, indexersSequenceState)) return;

        // Check if the operation has already been applied
        const opEntry = await this.#getEntryApply(txHashHexString, batch);
        if (null !== opEntry) return;

        const initializedNodeEntry = nodeEntryUtils.init(ZERO_WK, nodeRoleUtils.NodeRole.READER, amount.value)
        await batch.put(recipientAddressString, initializedNodeEntry);
        await batch.put(txHashHexString, node.value);
    }

    async #handleApplyDisableBalanceInitializationOperation(op, view, base, node, batch) {
        if (!this.check.validateCoreAdminOperation(op)) return;

        // Entry has been disabled so there is nothing to do
        if (await this.#isApplyInitalizationDisabled(batch)) return;

        // Extract and validate the network address
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer);
        if (adminAddressString === null) return;

        // Validate requester admin public key
        const requesterAdminPublicKey = PeerWallet.decodeBech32mSafe(adminAddressString);
        if (requesterAdminPublicKey === null) return;

        // Ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (null === decodedAdminEntry || !this.#isAdminApply(decodedAdminEntry, node)) return;
        const adminPublicKey = PeerWallet.decodeBech32mSafe(decodedAdminEntry.address);
        if (adminPublicKey === null) return;

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterAdminPublicKey)) return

        // Recreate requester message
        const message = createMessage(op.address, op.cao.txv, op.cao.iw, op.cao.in, OperationType.DISABLE_INITIALIZATION);
        if (message.length === 0) return;

        const hash = await blake3Hash(message);
        const txHashHexString = op.cao.tx.toString('hex');
        if (!b4a.equals(hash, op.cao.tx)) return;

        // Verify signature
        const isMessageVerifed = this.#wallet.verify(op.cao.is, hash, adminPublicKey);
        if (!isMessageVerifed) return;

        // Verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) return;
        if (!b4a.equals(op.cao.txv, indexersSequenceState)) return;

        // Check if the operation has already been applied
        const opEntry = await this.#getEntryApply(txHashHexString, batch);
        if (null !== opEntry) return;

        await batch.put(EntryType.INITIALIZATION, safeWriteUInt32BE(0, 0));
        await batch.put(txHashHexString, node.value);
    }

    async #handleApplyAddAdminOperation(op, view, base, node, batch) {
        /*
            ADD ADMIN OPERATION INITIALIZES THE NETWORK. THIS OPERATION CAN BE PERFORMED ONLY ONCE, AND THE NETWORK CREATOR
            DOES NOT HAVE TO PAY A FEE IN THIS CASE. ATTENTION: IF ANY VALIDATOR ATTEMPTS THIS OPERATION AFTER THE NETWORK
            INITIALIZATION, THEIR STAKED BALANCE WILL BE REDUCED (PUNISHMENT).
        */

        if (!this.check.validateCoreAdminOperation(op)) return;

        // Extract and validate the network address
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer);
        if (adminAddressString === null) return;
        const adminPublicKey = PeerWallet.decodeBech32mSafe(adminAddressString);
        if (adminPublicKey === null) return;

        // Check if the operation is being performed by the bootstrap node - the original deployer of the Trac Network
        if (!b4a.equals(node.from.key, this.#bootstrap) || !b4a.equals(op.cao.iw, this.#bootstrap)) return;

        // recreate requester message
        const requesterMessage = createMessage(
            adminAddressBuffer,
            op.cao.txv,
            op.cao.iw,
            op.cao.in,
            OperationType.ADD_ADMIN
        );
        if (requesterMessage.length === 0) return;

        const hash = await blake3Hash(requesterMessage);
        if (!b4a.equals(hash, op.cao.tx)) return;

        // verify signature
        const isMessageVerifed = this.#wallet.verify(op.cao.is, op.cao.tx, adminPublicKey)
        const txHashHexString = op.cao.tx.toString('hex');
        if (!isMessageVerifed) return;
        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) return;
        if (!b4a.equals(op.cao.txv, indexersSequenceState)) return;

        const writerKeyIsRegistered = await this.#getRegisteredWriterKeyApply(batch, op.cao.iw.toString('hex'))
        if (!!writerKeyIsRegistered) return; // writer key should NOT exists for a brand new admin

        const adminEntryExists = await this.#getEntryApply(EntryType.ADMIN, batch);
        // if admin entry already exists, cannot perform this operation
        if (null !== adminEntryExists) return;

        // Check if the operation has already been applied
        const opEntry = await this.#getEntryApply(txHashHexString, batch);
        if (null !== opEntry) return;

        const initializedNodeEntry = nodeEntryUtils.init(op.cao.iw, nodeRoleUtils.NodeRole.INDEXER, ADMIN_INITIAL_BALANCE);
        //const updatedNodeEntry = nodeEntryUtils.setRole(initializedNodeEntry, nodeRoleUtils.NodeRole.INDEXER);
        await batch.put(adminAddressString, initializedNodeEntry);
        await batch.put(EntryType.WRITER_ADDRESS + op.cao.iw.toString('hex'), op.address);
        await this.#updateWritersIndex(adminAddressBuffer, batch);

        // Create a new admin entry
        const newAdminEntry = adminEntryUtils.encode(adminAddressBuffer, op.cao.iw);
        if (newAdminEntry.length === 0) return;

        // initialize admin entry and indexers entry
        await batch.put(EntryType.ADMIN, newAdminEntry);
        await batch.put(txHashHexString, node.value);
        await batch.put(EntryType.INITIALIZATION, safeWriteUInt32BE(1, 0));

        console.log(`Admin added addr:wk:tx - ${adminAddressString}:${op.cao.iw.toString('hex')}:${txHashHexString}`);
    }

    async #handleApplyAdminRecoveryOperation(op, view, base, node, batch) {
        if (!this.check.validateRoleAccessOperation(op)) return;

        // Extract and validate the requester address and pubkey
        const requesterAdminAddressBuffer = op.address;
        const requesterAdminAddressString = addressUtils.bufferToAddress(requesterAdminAddressBuffer);
        if (requesterAdminAddressString === null) return;
        const requesterAdminPublicKey = PeerWallet.decodeBech32mSafe(requesterAdminAddressString);
        if (requesterAdminPublicKey === null) return;

        // recreate requester message
        const requesterMessage = createMessage(
            op.address,
            op.rao.txv,
            op.rao.iw,
            op.rao.in,
            OperationType.ADMIN_RECOVERY
        );
        if (requesterMessage.length === 0) return;


        const hash = await blake3Hash(requesterMessage);
        if (!b4a.equals(hash, op.rao.tx)) return;

        // verify requester signature
        const isRequesterMessageVerifed = this.#wallet.verify(op.rao.is, op.rao.tx, requesterAdminPublicKey);
        const txHashHexString = op.rao.tx.toString('hex');
        if (!isRequesterMessageVerifed) return;

        // Extract and validate the validator address and pubkey
        const validatorAddress = op.rao.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddress);
        if (validatorAddressString === null) return;
        const validatorPublicKey = PeerWallet.decodeBech32mSafe(validatorAddressString);
        if (validatorPublicKey === null) return;

        // recreate validator message
        const validatorMessage = createMessage(
            op.rao.tx,
            op.rao.va,
            op.rao.vn,
            OperationType.ADMIN_RECOVERY
        );
        if (validatorMessage.length === 0) return;

        // verify validator signature
        const validatorHash = await blake3Hash(validatorMessage);
        const isValidatorMessageVerifed = this.#wallet.verify(op.rao.vs, validatorHash, validatorPublicKey);
        if (!isValidatorMessageVerifed) return;

        const writerKeyIsRegistered = await this.#getRegisteredWriterKeyApply(batch, op.rao.iw.toString('hex'))
        if (!!writerKeyIsRegistered) return; // writer key should NOT have been associated with any address because this is a recovery operation
        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) return;
        if (!b4a.equals(op.rao.txv, indexersSequenceState)) return;

        // Check if the operation has already been applied
        const opEntry = await this.#getEntryApply(txHashHexString, batch);

        // anti-replay attack
        if (null !== opEntry) return;
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);

        if (null === decodedAdminEntry) return;
        const publicKeyAdminEntry = PeerWallet.decodeBech32mSafe(decodedAdminEntry.address);
        if (!b4a.equals(requesterAdminPublicKey, publicKeyAdminEntry)) return;

        const isOldWkInIndexerList = await this.#isWriterKeyInIndexerListApply(decodedAdminEntry.wk, base);
        if (!isOldWkInIndexerList) return; // Old admin wk is not in indexers entry

        // Update admin entry with new writing key
        const newAdminEntry = adminEntryUtils.encode(requesterAdminAddressBuffer, op.rao.iw);
        if (newAdminEntry.length === 0) return;

        // Update node entry of the admin with new writing key
        const adminNodeEntry = await this.#getEntryApply(requesterAdminAddressString, batch);
        const newAdminNodeEntry = setWritingKey(adminNodeEntry, op.rao.iw)

        const isNewWkInIndexerList = await this.#isWriterKeyInIndexerListApply(op.rao.iw, base);
        if (isNewWkInIndexerList) return; // New admin wk is already in indexers entry

        // Fee
        const decodedAdminNodeEntry = nodeEntryUtils.decode(newAdminNodeEntry)
        if (decodedAdminNodeEntry === null) return
        const adminBalance = toBalance(decodedAdminNodeEntry.balance)
        if (adminBalance === null) return
        if (!adminBalance.greaterThanOrEquals(BALANCE_FEE)) return;
        const updatedFee = adminBalance.sub(BALANCE_FEE)
        if (updatedFee === null) return
        const chargedAdminEntry = updatedFee.update(newAdminNodeEntry)

        // Reward logic
        const validatorNodeEntryBuffer = await this.#getEntryApply(validatorAddressString, batch);
        if (validatorNodeEntryBuffer === null) return;
        const validatorNodeEntry = nodeEntryUtils.decode(validatorNodeEntryBuffer);
        if (validatorNodeEntry === null) return;
        const validatorBalance = toBalance(validatorNodeEntry.balance);
        if (validatorBalance === null) return;
        const newValidatorBalance = validatorBalance.add(feeAmount.percentage(PERCENT_75));
        if (newValidatorBalance === null) return;
        const updatedValidatorNodeEntry = newValidatorBalance.update(validatorNodeEntry)
        if (updatedValidatorNodeEntry === null) return;

        // Revoke old wk and add new one as an indexer
        await base.removeWriter(decodedAdminEntry.wk);
        await base.addWriter(op.rao.iw, { isIndexer: true });
        await batch.put(EntryType.WRITER_ADDRESS + op.rao.iw.toString('hex'), op.address);

        // Remove the old admin entry and add the new one
        await batch.put(EntryType.ADMIN, newAdminEntry);
        // This updates the admin node entry with the new writer key
        await batch.put(requesterAdminAddressString, chargedAdminEntry);
        await batch.put(txHashHexString, node.value);

        // Actually pay the fee
        await batch.put(validatorAddressString, updatedValidatorNodeEntry);

        console.log(`Admin has been recovered addr:wk:tx - ${requesterAdminAddressString}:${op.rao.iw.toString('hex')}:${txHashHexString}`);
    }

    async #handleApplyAppendWhitelistOperation(op, view, base, node, batch) {
        if (!this.check.validateAdminControlOperation(op)) return;

        // Retrieve and decode the admin entry to verify the operation is initiated by an admin
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        if (null === adminEntry) return;
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (null === decodedAdminEntry || !this.#isAdminApply(decodedAdminEntry, node)) return;

        // Extract admin entry
        const adminAddress = decodedAdminEntry.address;
        const adminPublicKey = PeerWallet.decodeBech32mSafe(adminAddress);
        if (adminPublicKey === null) return;
        // Extract and validate the network prefix from the node's address
        const nodeAddressBinnary = op.aco.ia;

        const nodeAddressString = addressUtils.bufferToAddress(nodeAddressBinnary);
        if (nodeAddressString === null) return;
        const nodePublicKey = PeerWallet.decodeBech32mSafe(nodeAddressString);
        if (nodePublicKey === null) return;


        // verify signature createMessage(this.#address, this.#txValidity, this.#incomingAddress, nonce, this.#operationType);
        const message = createMessage(op.address, op.aco.txv, op.aco.ia, op.aco.in, OperationType.APPEND_WHITELIST);
        const hash = await blake3Hash(message);
        if (!b4a.equals(hash, op.aco.tx)) return;
        const isMessageVerifed = this.#wallet.verify(op.aco.is, op.aco.tx, adminPublicKey);
        //txHashHexString
        const hashHexString = op.aco.tx.toString('hex');

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) return;
        if (!b4a.equals(op.aco.txv, indexersSequenceState)) return;

        // Check if the operation has already been applied
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (!isMessageVerifed || null !== opEntry) return;
        // Retrieve the node entry to check its current role
        const nodeEntry = await this.#getEntryApply(nodeAddressString, batch);
        if (nodeEntryUtils.isWhitelisted(nodeEntry)) return; // Node is already whitelisted

        if (await this.#isApplyInitalizationDisabled(batch)) {            
            // Fee
            const adminNodeEntry = await this.#getEntryApply(adminAddressString, batch);
            if (null === adminNodeEntry) return;
            const decodedNodeEntry = nodeEntryUtils.decode(adminNodeEntry)
            if (null === decodedNodeEntry) return;
            const adminBalance = toBalance(decodedNodeEntry.balance)
            if (null === adminBalance) return;
            if (!adminBalance.greaterThanOrEquals(BALANCE_FEE)) return;
            const newAdminBalance = adminBalance.sub(BALANCE_FEE) // we burn
            if (null === newAdminBalance) return;
            const updatedAdminEntry = newAdminBalance.update(adminNodeEntry)
            if (null === updatedRequesterEntry) return;
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
        if (!this.check.validateRoleAccessOperation(op)) return;

        // Extract and validate the requester address
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer);
        if (requesterAddressString === null) return;
        const requesterPublicKey = PeerWallet.decodeBech32mSafe(requesterAddressString);
        if (requesterPublicKey === null) return;

        if (b4a.equals(op.rao.iw, ZERO_WK)) return;

        // verify requester signature
        const requesterMessage = createMessage(op.address, op.rao.txv, op.rao.iw, op.rao.in, OperationType.ADD_WRITER)
        const hash = await blake3Hash(requesterMessage);

        if (!b4a.equals(hash, op.rao.tx)) return;

        const isRequesterMessageVerifed = this.#wallet.verify(op.rao.is, op.rao.tx, requesterPublicKey);
        const txHashHexString = op.rao.tx.toString('hex');
        if (!isRequesterMessageVerifed) return;

        // verify validator signature
        const validatorAddress = op.rao.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddress);
        if (validatorAddressString === null) return;
        const validatorPublicKey = PeerWallet.decodeBech32mSafe(validatorAddressString);
        if (validatorPublicKey === null) return;

        const validatorMessage = createMessage(op.rao.tx, op.rao.va, op.rao.vn, OperationType.ADD_WRITER);
        const validatorHash = await blake3Hash(validatorMessage);
        const isValidatorMessageVerifed = this.#wallet.verify(op.rao.vs, validatorHash, validatorPublicKey);
        if (!isValidatorMessageVerifed) return;

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) return;
        if (!b4a.equals(op.rao.txv, indexersSequenceState)) return;

        // Check if the operation has already been applied
        const opEntry = await this.#getEntryApply(txHashHexString, batch);

        // anti-replay attack
        if (null !== opEntry) return;
        const writerKeyIsRegistered = await this.#getRegisteredWriterKeyApply(batch, op.rao.iw.toString('hex'))
        if (!!writerKeyIsRegistered) return;
        await this.#addWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddressBuffer, validatorAddressString);
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
            length = lengthEntryUtils.decode(bufferedLength);
            incrementedLength = lengthEntryUtils.increment(length);
        } else {
            // Decode and increment the existing writers length entry
            length = lengthEntryUtils.decode(length);
            incrementedLength = lengthEntryUtils.increment(length);
        }
        if (null === incrementedLength) return;

        // Update the writers index and length entries
        await batch.put(EntryType.WRITERS_INDEX + length, validatorAddressBuffer);
        await batch.put(EntryType.WRITERS_LENGTH, incrementedLength);
    }

    async #addWriter(op, base, node, batch, txHashHexString, requesterAddressString, requesterAddressBuffer, validatorAddressString) {
        // Retrieve the node entry for the given address, if null then do not process...
        const nodeEntry = await this.#getEntryApply(requesterAddressString, batch);
        if (nodeEntry === null) return;

        const isWhitelisted = nodeEntryUtils.isWhitelisted(nodeEntry);
        const isWriter = nodeEntryUtils.isWriter(nodeEntry);
        const isIndexer = nodeEntryUtils.isIndexer(nodeEntry);

        // To become a writer the node must be whitelisted and not already a writer or indexer
        if (isIndexer || isWriter || !isWhitelisted) return;

        // Fee
        const decodedNodeEntry = nodeEntryUtils.decode(nodeEntry)
        if (decodedNodeEntry === null) return;
        const requesterBalance = toBalance(decodedNodeEntry.balance)
        if (requesterBalance === null) return;
        if (!requesterBalance.greaterThanOrEquals(BALANCE_FEE)) return;
        const updatedBalance = requesterBalance.sub(BALANCE_FEE) // Remove the fee
        if (updatedBalance === null) return;
        const validatorEntry = await this.#getEntryApply(validatorAddressString, batch);
        if (validatorEntry === null) return;
        const decodedValidatorEntry = nodeEntryUtils.decode(validatorEntry)
        if (decodedValidatorEntry === null) return;
        const validatorBalance = toBalance(decodedValidatorEntry.balance)
        if (validatorBalance === null) return;
        const updatedValidatorBalance = validatorBalance.add(BALANCE_FEE.percentage(PERCENT_75)) // Credit a percentage to validator
        if (updatedValidatorBalance === null) return;
        const updatedValidatorEntry = updatedValidatorBalance.update(validatorEntry)
        if (updatedValidatorEntry === null) return;

        // Update the node entry to assign the writer role
        const updatedNodeEntry = nodeEntryUtils.setRoleAndWriterKey(nodeEntry, nodeRoleUtils.NodeRole.WRITER, op.rao.iw);
        if (updatedNodeEntry === null) return;
        const chargedUpdatedNodeEntry = updatedBalance.update(updatedNodeEntry)
        if (chargedUpdatedNodeEntry === null) return;

        // Pay the fee
        await batch.put(validatorAddressString, updatedValidatorEntry);

        // Add the writer role to the base and update the batch
        await base.addWriter(op.rao.iw, { isIndexer: false });
        await batch.put(requesterAddressString, chargedUpdatedNodeEntry);
        await batch.put(EntryType.WRITER_ADDRESS + op.rao.iw.toString('hex'), op.address);
        await this.#updateWritersIndex(requesterAddressBuffer, batch);

        await batch.put(txHashHexString, node.value);
        console.log(`Writer added addr:wk:tx - ${requesterAddressString}:${op.rao.iw.toString('hex')}:${txHashHexString}`);
    }

    async #handleApplyRemoveWriterOperation(op, view, base, node, batch) {
        if (!this.check.validateRoleAccessOperation(op)) return;

        // Extract and validate the network address
        const requesterAddress = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddress);
        if (requesterAddressString === null) return;
        const requesterPublicKey = PeerWallet.decodeBech32mSafe(requesterAddressString);
        if (requesterPublicKey === null) return;

        // verify requester signature
        const requesterMessage = createMessage(op.address, op.rao.txv, op.rao.iw, op.rao.in, OperationType.REMOVE_WRITER)
        const hash = await blake3Hash(requesterMessage);

        if (!b4a.equals(hash, op.rao.tx)) return;

        const isRequesterMessageVerifed = this.#wallet.verify(op.rao.is, op.rao.tx, requesterPublicKey);
        const txHashHexString = op.rao.tx.toString('hex');
        if (!isRequesterMessageVerifed) return;

        // verify validator signature
        const validatorAddress = op.rao.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddress);
        if (validatorAddressString === null) return;
        const validatorPublicKey = PeerWallet.decodeBech32mSafe(validatorAddressString);
        if (validatorPublicKey === null) return;

        const validatorMessage = createMessage(op.rao.tx, op.rao.va, op.rao.vn, OperationType.REMOVE_WRITER);
        const validatorHash = await blake3Hash(validatorMessage);
        const isValidatorMessageVerifed = this.#wallet.verify(op.rao.vs, validatorHash, validatorPublicKey);
        if (!isValidatorMessageVerifed) return;

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) return;
        if (!b4a.equals(op.rao.txv, indexersSequenceState)) return;

        // anti-replay attack
        const opEntry = await this.#getEntryApply(txHashHexString, batch);
        if (null !== opEntry) return;

        // Proceed to remove the writer role from the node
        await this.#removeWriter(op, base, node, batch, txHashHexString, requesterAddressString, validatorAddressString);
    }

    async #removeWriter(op, base, node, batch, txHashHexString, requesterAddressString, validatorAddressString) {
        // Retrieve the node entry for the given key
        const nodeEntry = await this.#getEntryApply(requesterAddressString, batch);
        if (null === nodeEntry) return;
        // Retrieve the validator to receive the fee
        const validatorNodeEntry = await this.#getEntryApply(validatorAddressString, batch);
        if (null === validatorNodeEntry) return;

        // TODO: SHOULD WE somehow compare current wk FROM STATE with op.rao.iw? YES, we can ensure that linked wk to the address is the same as the one provided in the operation.

        // Check if the node is a writer or an indexer
        const isNodeWriter = nodeEntryUtils.isWriter(nodeEntry);
        const isNodeIndexer = nodeEntryUtils.isIndexer(nodeEntry);

        if (isNodeIndexer) return;

        if (isNodeWriter) {
            // Decode the node entry and downgrade its role to WHITELISTED reader.
            const decodedValidatorEntry = nodeEntryUtils.decode(validatorEntry);
            if (decodedValidatorEntry === null) return;
            const validatorBalance = toBalance(decodedNodeEntry.balance)
            if (validatorBalance === null) return;
            const paidBalance = requesterBalance.add(BALANCE_FEE.percentage(PERCENT_75))
            if (paidBalance === null) return;
            const updateValidatorEntry = paidBalance.update(validatorEntry)
            if (updateValidatorEntry === null) return;

            const decodedNodeEntry = nodeEntryUtils.decode(nodeEntry);
            if (decodedNodeEntry === null) return;

            // Fee
            const requesterBalance = toBalance(decodedNodeEntry.balance)
            if (requesterBalance === null) return;
            if (!requesterBalance.greaterThanOrEquals(BALANCE_FEE)) return;
            const updatedBalance = requesterBalance.sub(BALANCE_FEE) // Remove the fee
            if (updatedBalance === null) return;

            // Downgrade role from WRITER to WHITELISTED
            const updatedNodeEntry = nodeEntryUtils.setRole(nodeEntry, nodeRoleUtils.NodeRole.WHITELISTED);
            if (updatedNodeEntry === null) return;
            const chargedNodeEntry = updatedBalance.update(updatedNodeEntry)
            if (chargedNodeEntry === null) return;

            // Actually pay the fee
            await batch.put(validatorAddressString, updateValidatorEntry);
            // Remove the writer role and update the state
            await base.removeWriter(decodedNodeEntry.wk);
            await batch.put(requesterAddressString, chargedNodeEntry);
            await batch.put(txHashHexString, node.value);
            console.log(`Writer removed: addr:wk:tx - ${requesterAddressString}:${op.rao.iw.toString('hex')}:${txHashHexString}`);
        }
    }

    async #handleApplyAddIndexerOperation(op, view, base, node, batch) {
        if (!this.check.validateAdminControlOperation(op)) {
            return;
        }

        // Extract and validate the requester address (admin)
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer);
        if (requesterAddressString === null) return;
        const requesterPublicKey = PeerWallet.decodeBech32mSafe(requesterAddressString);
        if (requesterPublicKey === null) return;

        // Extract and validate pretending indexer address
        const pretendingAddressBuffer = op.aco.ia;
        const pretendingAddressString = addressUtils.bufferToAddress(pretendingAddressBuffer);
        if (pretendingAddressString === null) return;
        const pretentingPublicKey = PeerWallet.decodeBech32mSafe(pretendingAddressString);
        if (pretentingPublicKey === null) return;

        // ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        if (null === adminEntry) return;
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (null === decodedAdminEntry) return;
        const adminPublicKey = PeerWallet.decodeBech32mSafe(decodedAdminEntry.address);
        if (adminPublicKey === null) return;
        if (!b4a.equals(requesterPublicKey, adminPublicKey) || !this.#isAdminApply(decodedAdminEntry, node)) return;

        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterPublicKey)) return;

        // verify requester signature
        const message = createMessage(op.address, op.aco.txv, op.aco.ia, op.aco.in, OperationType.ADD_INDEXER);
        const hash = await blake3Hash(message);
        if (!b4a.equals(hash, op.aco.tx)) return;

        const isMessageVerifed = this.#wallet.verify(op.aco.is, hash, adminPublicKey);
        const txHashHexString = hash.toString('hex');
        if (!isMessageVerifed) return;

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) return;

        if (!b4a.equals(op.aco.txv, indexersSequenceState)) return;

        // anti-replay attack
        const opEntry = await this.#getEntryApply(txHashHexString, batch);
        if (null !== opEntry) return;

        await this.#addIndexer(op, node, batch, base, txHashHexString, pretendingAddressString);
    }

    async #addIndexer(op, node, batch, base, txHashHexString, nodeAddressString) {
        const nodeEntry = await this.#getEntryApply(nodeAddressString, batch);
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

        // ensure that the node wk does not exist in the indexer list
        const indexerListHasWk = await this.#isWriterKeyInIndexerListApply(decodedNodeEntry.wk, base);
        if (indexerListHasWk) return; // Wk is already in indexer list (Node already indexer)

        // set indexer role
        await base.removeWriter(decodedNodeEntry.wk);
        await base.addWriter(decodedNodeEntry.wk, { isIndexer: true })

        await batch.put(nodeAddressString, updatedNodeEntry);

        // store operation hash to avoid replay attack.
        await batch.put(txHashHexString, node.value);

        console.log(`Indexer added addr:wk:tx - ${nodeAddressString}:${decodedNodeEntry.wk.toString('hex')}:${txHashHexString}`);
    }

    async #handleApplyRemoveIndexerOperation(op, view, base, node, batch) {
        if (!this.check.validateAdminControlOperation(op)) return;

        // Extract and validate the requester address
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer);
        if (requesterAddressString === null) return;
        const requesterPublicKey = PeerWallet.decodeBech32mSafe(requesterAddressString);
        if (requesterPublicKey === null) return;

        // Extract and validate pretending indexer address
        const toRemoveAddressBuffer = op.aco.ia;
        const toRemoveAddressString = addressUtils.bufferToAddress(toRemoveAddressBuffer);
        if (toRemoveAddressString === null) return;
        const toRemoveAddressPublicKey = PeerWallet.decodeBech32mSafe(toRemoveAddressString);
        if (toRemoveAddressPublicKey === null) return;

        // ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        if (null === adminEntry) return;
        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (null === decodedAdminEntry) return;
        const adminPublicKey = PeerWallet.decodeBech32mSafe(decodedAdminEntry.address);
        if (adminPublicKey === null) return;
        if (!b4a.equals(requesterPublicKey, adminPublicKey) || !this.#isAdminApply(decodedAdminEntry, node)) return;

        // verify requester signature
        const message = createMessage(op.address, op.aco.txv, op.aco.ia, op.aco.in, OperationType.REMOVE_INDEXER);
        const hash = await blake3Hash(message);
        if (!b4a.equals(hash, op.aco.tx)) return;

        const isMessageVerifed = this.#wallet.verify(op.aco.is, hash, adminPublicKey);
        const txHashHexString = hash.toString('hex');
        if (!isMessageVerifed) return;

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) return;
        if (!b4a.equals(op.aco.txv, indexersSequenceState)) return;

        // anti-replay attack
        const opEntry = await this.#getEntryApply(txHashHexString, batch);
        if (null !== opEntry) return;
        await this.#removeIndexer(op, node, batch, base, txHashHexString, toRemoveAddressString, toRemoveAddressBuffer, requesterAddressString);
    }

    async #removeIndexer(op, node, batch, base, txHashHexString, toRemoveAddressString, toRemoveAddressBuffer, requesterAddressString) {
        const nodeEntry = await this.#getEntryApply(toRemoveAddressString, batch);
        if (null === nodeEntry) return;
        const decodedNodeEntry = nodeEntryUtils.decode(nodeEntry);
        if (null === decodedNodeEntry) return;

        // Fee
        const requesterEntry = await this.#getEntryApply(requesterAddressString, batch);
        if (null === requesterEntry) return;
        const decodedRequesterEntry = nodeEntryUtils.decode(requesterEntry)
        if (null === decodedRequesterEntry) return;
        const requesterBalance = toBalance(decodedRequesterEntry.balance)
        if (null === requesterBalance) return;
        if (!requesterBalance.greaterThanOrEquals(BALANCE_FEE)) return;
        const newRequesterBalance = requesterBalance.sub(BALANCE_FEE) // we burn
        if (null === newRequesterBalance) return;
        const updatedRequesterEntry = newRequesterBalance.update(requesterEntry)
        if (null === updatedRequesterEntry) return;

        // Check if the node entry is an indexer
        const isNodeIndexer = nodeEntryUtils.isIndexer(nodeEntry);
        if (!isNodeIndexer) return;

        //update node entry to writer
        const updatedNodeEntry = nodeEntryUtils.setRoleAndWriterKey(nodeEntry, nodeRoleUtils.NodeRole.WRITER, decodedNodeEntry.wk)
        if (null === updatedNodeEntry) return;

        // Ensure that the node is an indexer
        const indexerListHasWk = await this.#isWriterKeyInIndexerListApply(decodedNodeEntry.wk, base);
        if (!indexerListHasWk) return; // Node is not an indexer.

        // downgrade role to writer
        await base.removeWriter(decodedNodeEntry.wk);
        await base.addWriter(decodedNodeEntry.wk, { isIndexer: false });

        // update writers index and length
        await this.#updateWritersIndex(toRemoveAddressBuffer, batch);

        //update node entry and indexers entry
        await batch.put(toRemoveAddressString, updatedNodeEntry);

        // update node entry with the fee
        await batch.put(requesterAddressString, updatedRequesterEntry);

        // store operation hash to avoid replay attack.
        await batch.put(txHashHexString, node.value);
        console.log(`Indexer has been removed addr:wk:tx - ${toRemoveAddressString}:${decodedNodeEntry.wk.toString('hex')}:${txHashHexString}`);
    }

    async #handleApplyBanValidatorOperation(op, view, base, node, batch) {
        if (!this.check.validateAdminControlOperation(op)) return;
        // Extract and validate the network prefix from the node's address
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer);
        if (requesterAddressString === null) return;
        const requesterPublicKey = PeerWallet.decodeBech32mSafe(requesterAddressString);
        if (requesterPublicKey === null) return;

        // ensure that an admin invoked this operation
        const adminEntry = await this.#getEntryApply(EntryType.ADMIN, batch);
        if (null === adminEntry) return;

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry);
        if (null === decodedAdminEntry) return;

        const adminPublicKey = PeerWallet.decodeBech32mSafe(decodedAdminEntry.address);
        if (adminPublicKey === null || !b4a.equals(requesterPublicKey, adminPublicKey) || !this.#isAdminApply(decodedAdminEntry, node)) return;

        // recreate requester message
        const message = createMessage(
            op.address,
            op.aco.txv,
            op.aco.ia,
            op.aco.in,
            op.aco.nonce,
            OperationType.BAN_VALIDATOR
        );
        if (message.length === 0) return;

        const regeneratedHash = await blake3Hash(message);
        if (!b4a.equals(regeneratedHash, op.aco.tx)) return;

        const isMessageVerifed = this.#wallet.verify(op.aco.is, regeneratedHash, adminPublicKey);
        const txHashHexString = regeneratedHash.toString('hex');
        if (!isMessageVerifed) return

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) return
        if (!b4a.equals(op.aco.txv, indexersSequenceState)) return;

        // check if the operation has already been applied
        const opEntry = await this.#getEntryApply(txHashHexString, batch);
        if (null !== opEntry) return;

        // Extract and validate the node address to be banned
        const nodeToBeBannedAddressBuffer = op.aco.ia;
        const nodeToBeBannedAddressString = addressUtils.bufferToAddress(nodeToBeBannedAddressBuffer);
        if (nodeToBeBannedAddressString === null) return;

        const nodeEntry = await this.#getEntryApply(nodeToBeBannedAddressString, batch);
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
        if (isWriter) {
            await base.removeWriter(decodedNodeEntry.wk);
        }
        await batch.put(nodeToBeBannedAddressString, updatedNodeEntry);
        await batch.put(txHashHexString, node.value);
        console.log(`Node has been banned: addr:wk:tx - ${nodeToBeBannedAddressString}:${decodedNodeEntry.wk.toString('hex')}:${txHashHexString}`);
    }

    async #handleApplyBootstrapDeploymentOperation(op, view, base, node, batch) {
        if (!this.check.validateBootstrapDeploymentOperation(op)) return;
        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.bdo, "vs") || !Object.hasOwn(op.bdo, "va") || !Object.hasOwn(op.bdo, "vn")) return;
        // do not allow to deploy bootstrap deployment on the same bootstrap.
        if (b4a.equals(op.bdo.bs, this.bootstrap)) return;
        // for additional security, nonces should be different.
        if (b4a.equals(op.bdo.in, op.bdo.vn)) return;
        // addresses should be different.
        if (b4a.equals(op.address, op.bdo.va)) return;
        // signatures should be different.
        if (b4a.equals(op.bdo.is, op.bdo.vs)) return;


        // validate requester signature
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer);
        if (null === requesterAddressString) return;
        const requesterPublicKey = PeerWallet.decodeBech32mSafe(requesterAddressString);
        if (null === requesterPublicKey) return;

        // recreate requester message
        const requesterMessage = createMessage(
            op.address,
            op.bdo.txv,
            op.bdo.bs,
            op.bdo.in,
            OperationType.BOOTSTRAP_DEPLOYMENT
        );
        if (requesterMessage.length === 0) return;

        // ensure that tx is valid
        const regeneratedTxHash = await blake3Hash(requesterMessage);
        if (!b4a.equals(regeneratedTxHash, op.bdo.tx)) return;

        const isRequesterSignatureValid = this.#wallet.verify(op.bdo.is, regeneratedTxHash, requesterPublicKey);
        if (!isRequesterSignatureValid) return;

        const bootstrapDeploymentHexString = op.bdo.bs.toString('hex');

        //second signature
        const validatorAddressBuffer = op.bdo.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer);
        if (null === validatorAddressString) return;
        const validatorPublicKey = PeerWallet.decodeBech32mSafe(validatorAddressString);
        if (null === validatorPublicKey) return;

        // recreate validator message
        const validatorMessage = createMessage(
            op.bdo.tx,
            op.bdo.va,
            op.bdo.vn,
            OperationType.BOOTSTRAP_DEPLOYMENT
        );
        if (validatorMessage.length === 0) return;
        const validatorMessageHash = await blake3Hash(validatorMessage);

        const isValidatorSignatureValid = this.#wallet.verify(op.bdo.vs, validatorMessageHash, validatorPublicKey);
        if (!isValidatorSignatureValid) return;

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) return;
        if (!b4a.equals(op.bdo.txv, indexersSequenceState)) return;

        // anti-replay attack
        const hashHexString = op.bdo.tx.toString('hex');
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (null !== opEntry) return; // Operation has already been applied.

        // If deployment already exists, do not process it again.
        const deploymentEntry = await this.#getDeploymentEntryApply(bootstrapDeploymentHexString, batch);
        if (deploymentEntry !== null) return;

        await batch.put(hashHexString, node.value);
        await batch.put(EntryType.DEPLOYMENT + bootstrapDeploymentHexString, op.bdo.tx);
        if (this.#enable_txlogs === true) {
            console.log(`TX: ${hashHexString} and deployment/${bootstrapDeploymentHexString} have been appended. Signed length: `, this.#base.view.core.signedLength);
        }
    }

    async #handleApplyTxOperation(op, view, base, node, batch) {
        // ATTENTION: The sanitization should be done before ANY other check, otherwise we risk crashing
        if (!this.check.validateTransactionOperation(op)) return;
        // reject transaction which is not complete
        if (!Object.hasOwn(op.txo, "vs") || !Object.hasOwn(op.txo, "va") || !Object.hasOwn(op.txo, "vn")) return;
        // reject if the validator signed their own transaction
        if (b4a.equals(op.address, op.txo.va)) return;
        // reject if the nonces are the same
        if (b4a.equals(op.txo.in, op.txo.vn)) return;
        // reject if the signatures are the same
        if (b4a.equals(op.txo.is, op.txo.vs)) return;
        // reject if the external bootstrap is the same as the network bootstrap
        if (b4a.equals(op.txo.bs, op.txo.mbs)) return;

        // validate invoker signature
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer);
        if (null === requesterAddressString) return;
        const requesterPublicKey = PeerWallet.decodeBech32mSafe(requesterAddressString);
        if (null === requesterPublicKey) return;
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
        if (requesterMessage.length === 0) return;

        const regeneratedTxHash = await blake3Hash(requesterMessage);
        if (!b4a.equals(regeneratedTxHash, op.txo.tx)) return;

        const isRequesterSignatureValid = this.#wallet.verify(op.txo.is, op.txo.tx, requesterPublicKey); // tx contains already a nonce.
        if (!isRequesterSignatureValid) return;

        //second signature
        const validatorAddressBuffer = op.txo.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer);
        if (null === validatorAddressString) return;

        const validatorPublicKey = PeerWallet.decodeBech32mSafe(validatorAddressString);
        if (null === validatorPublicKey) return;

        // recreate validator message
        const validatorMessage = createMessage(
            op.txo.tx,
            op.txo.va,
            op.txo.vn,
            OperationType.TX
        );
        if (validatorMessage.length === 0) return;

        const validatorMessageHash = await blake3Hash(validatorMessage);
        const isValidatorSignatureValid = this.#wallet.verify(op.txo.vs, validatorMessageHash, validatorPublicKey);
        if (!isValidatorSignatureValid) return;

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) return;
        if (!b4a.equals(op.txo.txv, indexersSequenceState)) return;

        // if user is performing a transaction on non-deployed bootstrap, then we need to reject it.
        // if deployment/<bootstrap> is not null then it means that the bootstrap is already deployed, and it should
        // point to payload, which is pointing to the txHash.
        const deploymentEntry = await this.#getDeploymentEntryApply(op.txo.bs.toString('hex'), batch);
        if (deploymentEntry === null) return;

        const hashHexString = op.txo.tx.toString('hex');
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (null !== opEntry) return;

        await batch.put(hashHexString, node.value);
        if (this.#enable_txlogs === true) {
            console.log(`TX: ${hashHexString} appended. Signed length: `, this.#base.view.core.signedLength);
        }
    }

    async #handleApplyTransferOperation(op, view, base, node, batch) {
        if (!this.check.validateTransferOperation(op)) return;
        // if transaction is not complete, do not process it.
        if (!Object.hasOwn(op.tro, "vs") || !Object.hasOwn(op.tro, "va") || !Object.hasOwn(op.tro, "vn")) return;
        // for additional security, nonces should be different.
        if (b4a.equals(op.tro.in, op.tro.vn)) return;
        // addresses should be different.
        if (b4a.equals(op.address, op.tro.va)) return;
        // signatures should be different.
        if (b4a.equals(op.tro.is, op.tro.vs)) return;

        // validate requester signature
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer);
        if (requesterAddressString === null) return;
        const requesterPublicKey = PeerWallet.decodeBech32mSafe(requesterAddressString);
        if (requesterPublicKey === null) return;

        // recreate requester message
        const requesterMessage = createMessage(
            op.address,
            op.tro.txv,
            op.tro.in,
            op.tro.to,
            op.tro.am,
            OperationType.TRANSFER
        );
        if (requesterMessage.length === 0) return;

        // ensure that tx is valid
        const regeneratedTxHash = await blake3Hash(requesterMessage);
        if (!b4a.equals(regeneratedTxHash, op.tro.tx)) return;

        const isRequesterSignatureValid = this.#wallet.verify(op.tro.is, regeneratedTxHash, requesterPublicKey);
        if (!isRequesterSignatureValid) return;

        // signature of the validator
        const validatorAddressBuffer = op.tro.va;
        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer);
        if (validatorAddressString === null) return;
        const validatorPublicKey = PeerWallet.decodeBech32mSafe(validatorAddressString);
        if (validatorPublicKey === null) return;

        const validatorMessage = createMessage(
            op.tro.tx,
            op.tro.va,
            op.tro.vn,
            OperationType.TRANSFER
        );

        if (validatorMessage.length === 0) return;
        const validatorMessageHash = await blake3Hash(validatorMessage);
        const isValidatorSignatureValid = this.#wallet.verify(op.tro.vs, validatorMessageHash, validatorPublicKey);
        if (!isValidatorSignatureValid) return;

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) return;
        if (!b4a.equals(op.tro.txv, indexersSequenceState)) return;

        // anti-replay attack
        const hashHexString = op.tro.tx.toString('hex');
        const opEntry = await this.#getEntryApply(hashHexString, batch);
        if (opEntry !== null) return;

        // Check if recipient address is valid.
        const recipientAddressBuffer = op.tro.to;
        const recipientAddressString = addressUtils.bufferToAddress(recipientAddressBuffer);
        if (recipientAddressString === null) return;
        const recipientPublicKey = PeerWallet.decodeBech32mSafe(recipientAddressString);
        if (recipientPublicKey === null) return;

        const isSelfTransfer = b4a.equals(requesterAddressBuffer, recipientAddressBuffer);

        const transferResult = await this.#transfer(
            requesterAddressString,
            recipientAddressString,
            validatorAddressString,
            op.tro.am,
            transactionUtils.FEE,
            isSelfTransfer,
            batch
        );

        if (null === transferResult) return;
        await batch.put(requesterAddressString, transferResult.senderEntry);
        await batch.put(validatorAddressString, transferResult.validatorEntry);

        if (!isSelfTransfer) {
            await batch.put(recipientAddressString, transferResult.recipientEntry);
        }

        await batch.put(hashHexString, node.value);

        if (this.#enable_txlogs === true) {
            console.log(`TRANSFER: ${hashHexString} appended. Signed length: `, this.#base.view.core.signedLength);
        }

    }

    async #transfer(senderAddressString, recipientAddressString, validatorAddressString, transferAmountBuffer, feeAmountBuffer, isSelfTransfer, batch) {
        if (senderAddressString === null ||
            recipientAddressString === null ||
            validatorAddressString === null ||
            transferAmountBuffer === null ||
            feeAmountBuffer === null ||
            isSelfTransfer === null ||
            batch === null
        ) {
            return null;
        }
        const transferAmount = toBalance(transferAmountBuffer);
        const feeAmount = toBalance(feeAmountBuffer);
        if (transferAmount === null || feeAmount === null) return null;

        // totalDeductedAmount = transferAmount + fee. When transferamount is 0, then totalDeductedAmount = fee. Because 0 + fee = fee.
        const totalDeductedAmount = isSelfTransfer ? feeAmount : transferAmount.add(feeAmount);
        if (totalDeductedAmount === null) return null;
        const senderEntryBuffer = await this.#getEntryApply(senderAddressString, batch);
        if (senderEntryBuffer === null) return null;
        const validatorEntryBuffer = await this.#getEntryApply(validatorAddressString, batch);
        if (validatorEntryBuffer === null) return null;
        const validatorEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (validatorEntry === null) return null;
        const senderEntry = nodeEntryUtils.decode(senderEntryBuffer);
        if (senderEntry === null) return null;
        const senderBalance = toBalance(senderEntry.balance);
        if (senderBalance === null) return null;
        if (!senderBalance.greaterThanOrEquals(totalDeductedAmount)) return null;
        const validatorBalance = toBalance(senderEntry.balance);
        if (validatorBalance === null) return null;


        const newValidatorBalance = senderBalance.add(feeAmount.percentage(PERCENT_75));
        if (newValidatorBalance === null) return null;
        const updatedValidatorEntry = newValidatorBalance.update(validatorEntryBuffer)

        const newSenderBalance = senderBalance.sub(totalDeductedAmount);
        if (newSenderBalance === null) return null;

        const updatedSenderEntry = newSenderBalance.update(senderEntryBuffer);
        if (updatedSenderEntry === null) return null;
        const result = {
            senderEntry: updatedSenderEntry,
            recipientEntry: null,
            validatorEntry: updatedValidatorEntry,
        };

        if (!isSelfTransfer) {
            const recipientEntryBuffer = await this.#getEntryApply(recipientAddressString, batch);
            if (recipientEntryBuffer === null) {
                if (transferAmount.value === null) return null;
                const newRecipientEntry = nodeEntryUtils.init(
                    ZERO_WK,
                    nodeRoleUtils.NodeRole.READER,
                    transferAmount.value
                );
                if (newRecipientEntry.length === 0) return null;
                result.recipientEntry = newRecipientEntry;
            } else {
                const recipientEntry = nodeEntryUtils.decode(recipientEntryBuffer);
                if (recipientEntry === null) return null;

                const recipientBalance = toBalance(recipientEntry.balance);
                if (recipientBalance === null) return null;

                const newRecipientBalance = recipientBalance.add(transferAmount);
                if (newRecipientBalance === null) return null;

                const updatedRecipientEntry = nodeEntryUtils.setBalance(recipientEntryBuffer, newRecipientBalance.value);
                if (updatedRecipientEntry === null) return null;
                result.recipientEntry = updatedRecipientEntry;
            }
        }

        // TODO: implement validator reward distribution in this place, and assign NEW balance to result.validatorEntry

        return result;

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
            console.log(error);
            return null
        }
    }

    async #getRegisteredWriterKeyApply(batch, writingKey) {
        return await batch.get(EntryType.WRITER_ADDRESS + writingKey);
    }

    // PLACEHOLDER
    // TODO: Check if this is used anywhere
    async #incrementBalanceApply(address, batch, toIncrement) {
        if (isBufferValid(toIncrement, NODE_ENTRY_SIZE) || b4a.equals(toIncrement, ZERO_BALANCE)) return null
        const nodeEntry = await this.#getEntryApply(address, batch);
        if (nodeEntry === null) return null;
        const decodedNodeEntry = nodeEntryUtils.decode(nodeEntry);
        const balance = toBalance(decodedNodeEntry.balance)
        const result = balance.add(toBalance(toIncrement))
        return result.update(nodeEntryUtils.encode(decodedNodeEntry))
    }

    // PLACEHOLDER
    // TODO: Check if this is used anywhere
    async #decrementBalanceApply(address, batch, toDecrement) {
        if (isBufferValid(toDecrement, NODE_ENTRY_SIZE) || b4a.equals(toDecrement, ZERO_BALANCE)) return null
        const nodeEntry = await this.#getEntryApply(address, batch);
        if (nodeEntry === null) return null;
        const decodedNodeEntry = nodeEntryUtils.decode(nodeEntry);
        if (toBalance(decodedNodeEntry.balance).lowerThan(toBalance(toDecrement))) return null;
        const balance = toBalance(decodedNodeEntry.balance)
        const result = balance.sub(toBalance(toDecrement))
        return result.update(nodeEntryUtils.encode(decodedNodeEntry))
    }
}

export default State;
