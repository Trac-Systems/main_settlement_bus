import ReadyResource from 'ready-resource';
import Autobase from 'autobase';
import Hyperbee from 'hyperbee';
import b4a from 'b4a';
import {
    WHITELIST_PREFIX,
    ACK_INTERVAL,
    EntryType,
    OperationType,
    MAX_INDEXERS,
} from './utils/constants.js';
import { sleep, createHash, generateTx } from './utils/functions.js';
import MsgUtils from './utils/msgUtils.js';
import Check from './utils/check.js';

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
            valueEncoding: 'json',
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
        this.#writingKey = b4a.toString(this.#base.local.key, 'hex');
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

    async getWhitelistEntry(key) {
        const entry = await this.get(WHITELIST_PREFIX + key);
        return entry
    }

    async append(payload) {
        await this.#base.append(payload);
    }

    #setupHyperbee(store) {
        this.#bee = new Hyperbee(store.get('view'), {
            extension: false,
            keyEncoding: 'utf-8',
            valueEncoding: 'json'
        })
        return this.#bee;
    }

    ///////////////////////////////APPLY////////////////////////////////////

    async #apply(nodes, view, base) {
        const batch = view.batch();
        for (const node of nodes) {
            const op = node.value;
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
        const adminEntry = await batch.get(EntryType.ADMIN);
        if (null === adminEntry) {
            await this.#addAdminIfNotSet(op, view, node, batch);
        }
        else if (adminEntry.value.tracPublicKey === op.key) {
            await this.#addAdminIfSet(adminEntry.value, op, view, base, batch);
        }
    }

    async #addAdminIfSet(adminEntry, op, view, base, batch) {
        const message = MsgUtils.createMessage(adminEntry.tracPublicKey, op.value.wk, op.value.nonce, op.type)
        const isMessageVerifed = await this.#verifyMessageApply(op.value.sig, adminEntry.tracPublicKey, message);
        const hash = await createHash('sha256', message);
        if (isMessageVerifed &&
            null === await batch.get(hash)
        ) {
            const indexersEntry = await batch.get(EntryType.INDEXERS);
            if (null !== indexersEntry && indexersEntry.value.includes(adminEntry.tracPublicKey)) {
                await base.removeWriter(b4a.from(adminEntry.wk, 'hex'));
                await base.addWriter(b4a.from(op.value.wk, 'hex'), { isIndexer: true });
                await batch.put(EntryType.ADMIN, {
                    tracPublicKey: adminEntry.tracPublicKey,
                    wk: op.value.wk
                })
                await batch.put(hash, op);
                console.log(`Admin updated: ${adminEntry.tracPublicKey}:${op.value.wk}`);
            }
        }
    }

    async #addAdminIfNotSet(op, view, node, batch) {
        const message = MsgUtils.createMessage(op.key, op.value.wk, op.value.nonce, op.type)
        const isMessageVerifed = await this.#verifyMessageApply(op.value.sig, op.key, message);
        const hash = await createHash('sha256', message);
        if (node.from.key.toString('hex') === this.#bootstrap &&
            op.value.wk === this.#bootstrap &&
            isMessageVerifed &&
            null === await batch.get(hash)
        ) {
            await batch.put(EntryType.ADMIN, {
                tracPublicKey: op.key,
                wk: this.#bootstrap
            })
            const initIndexers = [op.key];
            await batch.put(EntryType.INDEXERS, initIndexers);
            await batch.put(hash, op);
            console.log(`Admin added: ${op.key}:${this.#bootstrap}`);
        }
    }

    async #handleApplyAppendWhitelistOperation(op, view, base, node, batch) {
        const adminEntry = await batch.get(EntryType.ADMIN);
        if (null === adminEntry || !this.check.sanitizeBasicKeyOp(op) || !this.#isAdminApply(adminEntry.value, node)) return;

        const message = MsgUtils.createMessage(op.key, op.value.nonce, op.type)
        const isMessageVerifed = await this.#verifyMessageApply(op.value.sig, adminEntry.value.tracPublicKey, message);
        const hash = await createHash('sha256', message);

        if (!isMessageVerifed || null !== await batch.get(hash)) return;
        const isWhitelisted = await this.#isWhitelistedApply(op.key, batch);
        if (isWhitelisted) return;
        await this.#createWhitelistEntry(batch, op.key);
        await batch.put(hash, op);
    }

    async #createWhitelistEntry(batch, pubKey) {
        const whitelistKey = WHITELIST_PREFIX + pubKey;
        await batch.put(whitelistKey, true);
    }

    async #deleteWhitelistEntry(batch, pubKey) {
        const whitelistKey = WHITELIST_PREFIX + pubKey;
        await batch.del(whitelistKey);
    }

    async #handleApplyAddWriterOperation(op, view, base, node, batch) {
        const adminEntry = await batch.get(EntryType.ADMIN);
        if (null === adminEntry || !this.check.sanitizeExtendedKeyOpSchema(op) || !this.#isAdminApply(adminEntry.value, node)) return;

        const isWhitelisted = await this.#isWhitelistedApply(op.key, batch);
        if (!isWhitelisted || op.key !== op.value.pub) return;
        const message = MsgUtils.createMessage(op.key, op.value.wk, op.value.nonce, op.type)
        const isMessageVerifed = await this.#verifyMessageApply(op.value.sig, op.key, message);
        const hash = await createHash('sha256', message);
        if (isMessageVerifed &&
            null === await batch.get(hash)
        ) {
            await this.#addWriter(op, batch, base, hash);
        }
    }

    async #addWriter(op, batch, base, hash) {
        const nodeEntry = await batch.get(op.key);
        if (nodeEntry === null || !nodeEntry.value.isWriter) {
            await base.addWriter(b4a.from(op.value.wk, 'hex'), { isIndexer: false })
            await batch.put(op.key, {
                pub: op.value.pub,
                wk: op.value.wk,
                isWriter: true,
                isIndexer: false
            });
            let length = await batch.get('wrl');
            if (null === length) {
                length = 0;
            } else {
                length = length.value;
            }
            await batch.put('wri/' + length, op.value.pub);
            await batch.put('wrl', length + 1);
            await batch.put(hash, op);
            console.log(`Writer added: ${op.key}:${op.value.wk}`);
        }
    }

    async #handleApplyRemoveWriterOperation(op, view, base, node, batch) {
        const adminEntry = await batch.get(EntryType.ADMIN);
        if (null === adminEntry || !this.check.sanitizeExtendedKeyOpSchema(op) || !this.#isAdminApply(adminEntry.value, node)) return;
        const message = MsgUtils.createMessage(op.key, op.value.wk, op.value.nonce, op.type);
        const isMessageVerifed = await this.#verifyMessageApply(op.value.sig, op.key, message);
        const hash = await createHash('sha256', message);
        if (isMessageVerifed &&
            null === await batch.get(hash)
        ) {
            await this.#removeWriter(op, batch, base, hash);
        }
    }

    async #removeWriter(op, batch, base, hash) {
        let nodeEntry = await batch.get(op.key)
        if (nodeEntry !== null) {
            nodeEntry = nodeEntry.value;
            await base.removeWriter(b4a.from(nodeEntry.wk, 'hex'));
            nodeEntry.isWriter = false;
            if (nodeEntry.isIndexer) {
                nodeEntry.isIndexer = false;
                const indexersEntry = await batch.get(EntryType.INDEXERS);
                if (null !== indexersEntry && indexersEntry.value.includes(op.key)) {
                    const idx = indexersEntry.value.indexOf(op.key);
                    if (idx !== -1) {
                        indexersEntry.value.splice(idx, 1);
                        await batch.put(EntryType.INDEXERS, indexersEntry.value);
                    }
                }
            }

            await batch.put(op.key, nodeEntry);
            await batch.put(hash, op);
            console.log(`Writer removed: ${op.key}${op.value.wk ? `:${op.value.wk}` : ''}`);

        }
    }

    async #handleApplyAddIndexerOperation(op, view, base, node, batch) {
        if (!this.check.sanitizeBasicKeyOp(op)) {
            return;
        }

        const adminEntry = await batch.get(EntryType.ADMIN);
        if (null === adminEntry || !this.#isAdminApply(adminEntry.value, node)) return;

        if (!this.#isWhitelistedApply(op.key, batch)) return;

        const indexersEntry = await batch.get(EntryType.INDEXERS);
        if (null === indexersEntry || Array.from(indexersEntry.value).includes(op.key) ||
            Array.from(indexersEntry.value).length >= MAX_INDEXERS) {
            return;
        }
        const message = MsgUtils.createMessage(op.key, op.value.nonce, op.type);
        const isMessageVerifed = await this.#verifyMessageApply(op.value.sig, adminEntry.value.tracPublicKey, message)
        const hash = await createHash('sha256', message);
        if (isMessageVerifed &&
            null === await batch.get(hash)) {
            await this.#addIndexer(indexersEntry.value, op, batch, base, hash);
        }
    }

    async #addIndexer(indexersEntry, op, batch, base, hash) {
        let nodeEntry = await batch.get(op.key);

        if (nodeEntry !== null && nodeEntry.value.isWriter && !nodeEntry.value.isIndexer) {
            nodeEntry = nodeEntry.value;
            await base.removeWriter(b4a.from(nodeEntry.wk, 'hex'));
            await base.addWriter(b4a.from(nodeEntry.wk, 'hex'), { isIndexer: true })
            nodeEntry.isIndexer = true;
            await batch.put(op.key, nodeEntry);
            indexersEntry.push(op.key);
            await batch.put(EntryType.INDEXERS, indexersEntry);
            await batch.put(hash, op);
            console.log(`Indexer added: ${op.key}:${nodeEntry.wk}`);
        }
    }

    async #handleApplyRemoveIndexerOperation(op, view, base, node, batch) {
        if (!this.check.sanitizeBasicKeyOp(op)) return;
        const adminEntry = await batch.get(EntryType.ADMIN);
        let indexersEntry = await batch.get(EntryType.INDEXERS);
        if (null === adminEntry || !this.#isAdminApply(adminEntry.value, node) || null === indexersEntry || !Array.from(indexersEntry.value).includes(op.key) || Array.from(indexersEntry.value).length <= 1) return;
        const message = MsgUtils.createMessage(op.key, op.value.nonce, op.type);
        const isMessageVerifed = await this.#verifyMessageApply(op.value.sig, adminEntry.value.tracPublicKey, message)
        const hash = await createHash('sha256', message);
        if (isMessageVerifed &&
            null === await batch.get(hash)) {
            let nodeEntry = await batch.get(op.key);
            if (nodeEntry !== null && nodeEntry.value.isWriter && nodeEntry.value.isIndexer) {
                indexersEntry = indexersEntry.value;
                nodeEntry = nodeEntry.value;
                await base.removeWriter(b4a.from(nodeEntry.wk, 'hex'));

                nodeEntry.isWriter = false;
                nodeEntry.isIndexer = false;
                await batch.put(op.key, nodeEntry);

                const idx = indexersEntry.indexOf(op.key);
                if (idx !== -1) {
                    indexersEntry.splice(idx, 1);
                    await batch.put(EntryType.INDEXERS, indexersEntry);
                }
                await batch.put(hash, op);
                console.log(`Indexer removed: ${op.key}:${nodeEntry.wk}`);
            }
        }
    }

    async #handleApplyBanValidatorOperation(op, view, base, node, batch) {
        const adminEntry = await batch.get(EntryType.ADMIN);
        if (null === adminEntry || !this.#isAdminApply(adminEntry.value, node)) return;
        if (!this.check.sanitizeBasicKeyOp(op)) return;
        const isWhitelisted = await this.#isWhitelistedApply(op.key, batch);
        if (!isWhitelisted) return;

        const nodeEntry = await batch.get(op.key)
        if (null === nodeEntry || nodeEntry.value.isIndexer === true) return; // even if node is not writable atm it should be possible to ban it.
        const message = MsgUtils.createMessage(op.key, op.value.nonce, op.type);
        const isMessageVerifed = await this.#verifyMessageApply(op.value.sig, adminEntry.value.tracPublicKey, message);
        const hash = await createHash('sha256', message);
        if (!isMessageVerifed || null !== await batch.get(hash)) return;
        await this.#deleteWhitelistEntry(batch, op.key);
        await this.#removeWriter(op, batch, base, hash);

    }

    async #verifyMessageApply(signature, publicKey, bufferMessage) {
        const bufferPublicKey = b4a.from(publicKey, 'hex');
        const hash = await createHash('sha256', bufferMessage);
        return this.#wallet.verify(signature, hash, bufferPublicKey);
    }

    #isAdminApply(adminEntry, node) {
        if (!adminEntry || !node) return false;
        return adminEntry.wk === b4a.from(node.from.key).toString('hex');
    }

    async #isWhitelistedApply(key, batch) {
        const whitelistEntry = await this.#getWhitelistEntryApply(key, batch)
        return !!whitelistEntry;
    }

    async #getWhitelistEntryApply(key, batch) {
        const entry = await batch.get(WHITELIST_PREFIX + key);
        return entry !== null ? entry.value : null
    }

}

export default State;