/** @typedef {import('pear-interface')} */ /* global Pear */
import Autobase from 'autobase';
import ReadyResource from 'ready-resource';
import b4a from 'b4a';
import Hyperbee from 'hyperbee';
import readline from 'readline';
import { verifyDag, sleep, createHash } from './utils/functions.js';
import PeerWallet from "trac-wallet"
import tty from 'tty';
import Corestore from 'corestore';
import MsgUtils from './utils/msgUtils.js';
import {
    LISTENER_TIMEOUT,
    EntryType,
    OperationType,
    EventType,
    WHITELIST_SLEEP_INTERVAL,
    MAX_INDEXERS,
    MIN_INDEXERS,
    WHITELIST_PREFIX,
} from './utils/constants.js';
import Network from './network.js';
import Check from './utils/check.js';
import Protomux from 'protomux'
import c from 'compact-encoding'
import Hypercore from 'hypercore'

export class MainSettlementBus extends ReadyResource {
    // Internal flags
    #shouldListenToAdminEvents = false;
    #shouldListenToWriterEvents = false;
    #isStreaming = false;

    // internal attributes
    #STORES_DIRECTORY;
    #KEY_PAIR_PATH;
    #bootstrap;
    #channel;
    #store;
    #bee;
    #swarm;
    #dht_node;
    #dht_bootstrap;
    #base;
    #writingKey;
    #enable_txchannel;
    #is_indexer;
    #enable_wallet;
    #wallet;
    #replicate;
    #network;
    #opts;
    #signature_whitelist;
    #readline_instance;
    #enable_txlogs;
    #disable_rate_limit;
    #enableValidatorObserver;
    #enableRoleRequester;

    constructor(options = {}) {
        super();
        this.check = new Check();
        this.#initInternalAttributes(options);
        this.msbListener();
        this.#boot();
        this.#setupInternalListeners();
        this.#network = new Network(this.#base);
        this.#enableValidatorObserver = options.enableValidatorObserver !== undefined ? options.enableValidatorObserver : true;
        this.#enableRoleRequester = options.enableRoleRequester !== undefined ? options.enableRoleRequester : true;
    }

    #initInternalAttributes(options) {
        this.#STORES_DIRECTORY = options.stores_directory;
        this.#KEY_PAIR_PATH = `${this.STORES_DIRECTORY}${options.store_name}/db/keypair.json`
        this.#bootstrap = options.bootstrap || null;
        this.#channel = b4a.alloc(32).fill(options.channel) || null;
        this.#store = new Corestore(this.STORES_DIRECTORY + options.store_name);
        this.#bee = null;
        this.#swarm = null;
        this.#dht_bootstrap = ['116.202.214.149:10001', '157.180.12.214:10001', 'node1.hyperdht.org:49737', 'node2.hyperdht.org:49737', 'node3.hyperdht.org:49737'];
        this.#dht_node = null;
        this.#base = null;
        this.#writingKey = null;
        this.#enable_txchannel = options.enable_txchannel !== false;
        this.#enable_txlogs = options.enable_txlogs === true;
        this.#is_indexer = false;
        this.#enable_wallet = options.enable_wallet !== false;
        this.#disable_rate_limit = options.disable_rate_limit === true;
        this.#wallet = new PeerWallet(options);
        this.#replicate = options.replicate !== false;
        this.#signature_whitelist = options.signature_whitelist !== undefined && Array.isArray(options.signature_whitelist) ? options.signature_whitelist : [];
        this.#opts = options;
        this.#readline_instance = null;
        this.enable_interactive_mode = options.enable_interactive_mode !== false;
        if (this.enable_interactive_mode !== false) {
            try {
                this.#readline_instance = readline.createInterface({
                    input: new tty.ReadStream(0),
                    output: new tty.WriteStream(1)
                });
            } catch (e) { }
        }
    }

    get STORES_DIRECTORY() {
        return this.#STORES_DIRECTORY;
    }

    get KEY_PAIR_PATH() {
        return this.#KEY_PAIR_PATH;
    }

    get base() {
        return this.#base;
    }

    get bootstrap() {
        return this.#bootstrap;
    }

    getChannel() {
        return this.#channel;
    }

    getSwarm() {
        return this.#swarm;
    }

    getNetwork() {
        return this.#network;
    }

    #boot() {
        const _this = this;
        this.#base = new Autobase(this.#store, this.#bootstrap, {
            ackInterval : 1000,
            valueEncoding: 'json',
            open: this.#setupHyperbee.bind(this),
            apply: this.#apply.bind(this),
        })
        this.#base.on(EventType.WARNING, (e) => console.log(e))
    }

    #setupHyperbee(store) {
        this.#bee = new Hyperbee(store.get('view'), {
            extension: false,
            keyEncoding: 'utf-8',
            valueEncoding: 'json'
        })
        return this.#bee;
    }

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
        if (postTx.op === OperationType.POST_TX &&
            (this.#signature_whitelist.length === 0 || this.#signature_whitelist.includes(postTx.bs)) &&
            null === await batch.get(op.key) &&
            this.check.sanitizePostTx(op) &&
            op.key === postTx.tx &&
            this.#wallet.verify(b4a.from(postTx.is, 'hex'), b4a.from(postTx.tx + postTx.in), b4a.from(postTx.ipk, 'hex')) &&
            this.#wallet.verify(b4a.from(postTx.ws, 'hex'), b4a.from(postTx.tx + postTx.wn), b4a.from(postTx.wp, 'hex')) &&
            postTx.tx === await this.generateTx(postTx.bs, this.bootstrap, postTx.wp, postTx.i, postTx.ipk, postTx.ch, postTx.in) &&
            b4a.byteLength(JSON.stringify(postTx)) <= 4096
        ) {
            await batch.put(op.key, op.value);
            if (this.#enable_txlogs === true) {
                console.log(`TX: ${op.key} appended. Signed length: `, this.#base.view.core.signedLength);
            }
        }
    }

    async #handleApplyAddAdminOperation(op, view, base, node, batch) {
        if (!this.check.sanitizeAdminAndWritersOperations(op)) return;
        const adminEntry = await batch.get(EntryType.ADMIN);
        if (null === adminEntry) {
            await this.#addAdminIfNotSet(op, view, node, batch);
        }
        else if (adminEntry.value.tracPublicKey === op.key) {
            await this.#addAdminIfSet(adminEntry.value, op, view, base, batch);
        }
    }

    async #addAdminIfSet(adminEntry, op, view, base, batch) {
        const isMessageVerifed = await this.#verifyMessage(op.value.sig, adminEntry.tracPublicKey, MsgUtils.createMessage(adminEntry.tracPublicKey, op.value.wk, op.value.nonce, op.type));
        if (isMessageVerifed) {
            const indexersEntry = await batch.get(EntryType.INDEXERS);
            if (null !== indexersEntry && indexersEntry.value.includes(adminEntry.tracPublicKey)) {
                await base.removeWriter(b4a.from(adminEntry.wk, 'hex'));
                await base.addWriter(b4a.from(op.value.wk, 'hex'), { isIndexer: true })
                await batch.put(EntryType.ADMIN, {
                    tracPublicKey: adminEntry.tracPublicKey,
                    wk: op.value.wk
                })
                console.log(`Admin updated: ${adminEntry.tracPublicKey}:${op.value.wk}`);
            }
        }
    }

    async #addAdminIfNotSet(op, view, node, batch) {
        const isMessageVerifed = await this.#verifyMessage(op.value.sig, op.key, MsgUtils.createMessage(op.key, op.value.wk, op.value.nonce, op.type));

        if (node.from.key.toString('hex') === this.#bootstrap &&
            op.value.wk === this.#bootstrap &&
            isMessageVerifed
        ) {
            await batch.put(EntryType.ADMIN, {
                tracPublicKey: op.key,
                wk: this.#bootstrap
            })
            const initIndexers = [op.key];
            await batch.put(EntryType.INDEXERS, initIndexers);
            console.log(`Admin added: ${op.key}:${this.#bootstrap}`);
        }
    }

    async #handleApplyAppendWhitelistOperation(op, view, base, node, batch) {
        const adminEntry = await batch.get(EntryType.ADMIN);
        if (null === adminEntry || !this.check.sanitizeIndexerOrWhitelistOperations(op) || !this.#isAdmin(adminEntry.value, node)) return;
        // TODO: is the below an admin signature? - yes
        const isMessageVerifed = await this.#verifyMessage(op.value.sig, adminEntry.value.tracPublicKey, MsgUtils.createMessage(op.key, op.value.nonce, op.type));
        if (!isMessageVerifed) return;
        const isWhitelisted = await this.#isWhitelisted2(op.key, batch);
        if (isWhitelisted) return;
        await this.#createWhitelistEntry(batch, op.key);
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
        if (null === adminEntry || !this.check.sanitizeAdminAndWritersOperations(op) || !this.#isAdmin(adminEntry.value, node)) return;

        const isWhitelisted = await this.#isWhitelisted2(op.key, batch);
        if (!isWhitelisted || op.key !== op.value.pub) return;
        // TODO: if the below is not a message signed by admin BUT this handler is supposed to be executed by the admin, then use admin signatures in apply!
        const isMessageVerifed = await this.#verifyMessage(op.value.sig, op.key, MsgUtils.createMessage(op.key, op.value.wk, op.value.nonce, op.type));
        if (isMessageVerifed) {
            await this.#addWriter(op, batch, base);
        }
    }

    async #addWriter(op, batch, base) {
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
            console.log(`Writer added: ${op.key}:${op.value.wk}`);
        }
    }

    async #handleApplyRemoveWriterOperation(op, view, base, node, batch) {
        const adminEntry = await batch.get(EntryType.ADMIN);
        if (null === adminEntry || !this.check.sanitizeAdminAndWritersOperations(op) || !this.#isAdmin(adminEntry.value, node)) return;
        // TODO: if the below is not a message signed by admin BUT this handler is supposed to be executed by the admin, then use admin signatures in apply!
        const isMessageVerifed = await this.#verifyMessage(op.value.sig, op.key, MsgUtils.createMessage(op.key, op.value.wk, op.value.nonce, op.type));
        if (isMessageVerifed) {
            await this.#removeWriter(op, batch, base);
        }
    }

    async #removeWriter(op, batch, base) {
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
            console.log(`Writer removed: ${op.key}${op.value.wk ? `:${op.value.wk}` : ''}`);

        }
    }

    async #handleApplyAddIndexerOperation(op, view, base, node, batch) {
        if (!this.check.sanitizeIndexerOrWhitelistOperations(op)) {
            return;
        }

        const adminEntry = await batch.get(EntryType.ADMIN);
        if (null === adminEntry || !this.#isAdmin(adminEntry.value, node)) return;

        if (!this.#isWhitelisted2(op.key, batch)) return;

        const indexersEntry = await batch.get(EntryType.INDEXERS);
        if (null === indexersEntry || Array.from(indexersEntry.value).includes(op.key) ||
            Array.from(indexersEntry.value).length >= MAX_INDEXERS) {
            return;
        }
        // TODO: is the below an admin signature? -yes
        const isMessageVerifed = await this.#verifyMessage(op.value.sig, adminEntry.value.tracPublicKey, MsgUtils.createMessage(op.key, op.value.nonce, op.type))
        if (isMessageVerifed) {
            await this.#addIndexer(indexersEntry.value, op, batch, base);
        }
    }

    async #addIndexer(indexersEntry, op, batch, base) {
        let nodeEntry = await batch.get(op.key);

        if (nodeEntry !== null && nodeEntry.value.isWriter && !nodeEntry.value.isIndexer) {
            nodeEntry = nodeEntry.value;
            await base.removeWriter(b4a.from(nodeEntry.wk, 'hex'));
            await base.addWriter(b4a.from(nodeEntry.wk, 'hex'), { isIndexer: true })
            nodeEntry.isIndexer = true;
            await batch.put(op.key, nodeEntry);
            indexersEntry.push(op.key);
            await batch.put(EntryType.INDEXERS, indexersEntry);
            console.log(`Indexer added: ${op.key}:${nodeEntry.wk}`);
        }
    }

    async #handleApplyRemoveIndexerOperation(op, view, base, node, batch) {
        if (!this.check.sanitizeIndexerOrWhitelistOperations(op)) return;
        const adminEntry = await batch.get(EntryType.ADMIN);
        let indexersEntry = await batch.get(EntryType.INDEXERS);
        if (null === adminEntry || !this.#isAdmin(adminEntry.value, node) || null === indexersEntry || !Array.from(indexersEntry.value).includes(op.key) || Array.from(indexersEntry.value).length <= 1) return;
        const isMessageVerifed = await this.#verifyMessage(op.value.sig, adminEntry.value.tracPublicKey, MsgUtils.createMessage(op.key, op.value.nonce, op.type))
        if (isMessageVerifed) {
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

                console.log(`Indexer removed: ${op.key}:${nodeEntry.wk}`);
            }
        }
    }

    async #handleApplyBanValidatorOperation(op, view, base, node, batch) {
        const adminEntry = await batch.get(EntryType.ADMIN);
        if (null === adminEntry || !this.#isAdmin(adminEntry.value, node)) return;
        if (!this.check.sanitizeIndexerOrWhitelistOperations(op)) return;
        const isWhitelisted = await this.#isWhitelisted2(op.key, batch);
        if (!isWhitelisted) return;

        const nodeEntry = await batch.get(op.key)
        if (null === nodeEntry || nodeEntry.value.isIndexer === true) return; // even if node is not writable atm it should be possible to ban it.
        const isMessageVerifed = await this.#verifyMessage(op.value.sig, adminEntry.value.tracPublicKey, MsgUtils.createMessage(op.key, op.value.nonce, op.type))
        if (!isMessageVerifed) return;
        await this.#deleteWhitelistEntry(batch, op.key);
        await this.#removeWriter(op, batch, base);

    }

    async _open() {
        await this.#base.ready();
        if (this.#enable_wallet) {
            await this.#wallet.initKeyPair(this.KEY_PAIR_PATH, this.#readline_instance);
        }

        if (this.#enable_wallet) {
            console.log('');
            console.log('#####################################################################################');
            console.log('# MSB Address:    ', this.#wallet.publicKey, '#');
            this.#writingKey = b4a.toString(this.#base.local.key, 'hex');
            console.log('# MSB Writer:     ', this.#writingKey, '#');
            console.log('#####################################################################################');
        }

        console.log('');
        if (this.#replicate) {
            this.#swarm = await Network.replicate(this.#disable_rate_limit, this, this.#network, this.#enable_txchannel, this.#base, this.#writingKey, this.#dht_bootstrap, this.#swarm, this.#enable_wallet, this.#store, this.#wallet, this.#channel, this.#isStreaming, this.#handleIncomingEvent.bind(this), this.emit.bind(this));
            this.#dht_node = this.#swarm.dht;
        }

        const adminEntry = await this.get(EntryType.ADMIN);

        if (this.#isAdmin(adminEntry)) {
            this.#shouldListenToAdminEvents = true;
            this.#adminEventListener(); // only for admin
        } else if (!this.#isAdmin(adminEntry) && this.#base.writable && !this.#base.isIndexer) {
            this.#shouldListenToWriterEvents = true;
            this.#writerEventListener(); // only for writers
        }

        await this.#setUpRoleAutomatically(adminEntry);

        console.log(`isIndexer: ${this.#base.isIndexer}`);
        console.log(`isWriter: ${this.#base.writable}`);
        console.log('MSB Unsigned Length:', this.#base.view.core.length);
        console.log('MSB Signed Length:', this.#base.view.core.signedLength);
        console.log('');

        this.validatorObserver();
    }

    async _close() {
        console.log('Closing everything gracefully... This may take a moment.');

        if (this.#network !== null) {
            this.#network.stopPool();
        }
        await sleep(100);

        if (this.#enableValidatorObserver) {
            this.stopValidatorObserver();
        }

        await sleep(5_000); // stopValidatorObserver is using findValidator which is reading from the base, so we need to wait fot it to finish.. Temporary workaround?
        if (this.#swarm !== null) {
            await this.#swarm.destroy();
        }
        await sleep(100);

        if (this.#base !== null) {
            await this.#base.close();
        }
        await sleep(100);
        if (this.#bee !== null) {
            await this.#bee.close();
        }
        await sleep(100);
        if (this.#readline_instance) {
            
            const inputClosed = new Promise(resolve => this.#readline_instance.input.once('close', resolve));
            const outputClosed = new Promise(resolve => this.#readline_instance.output.once('close', resolve));

            this.#readline_instance.close();
            this.#readline_instance.input.destroy();
            this.#readline_instance.output.destroy();

            // Do not remove this. Without it, readline may close too quickly and still hang.
            await Promise.all([inputClosed, outputClosed]).catch(e => console.log("Error during closing readline stream:", e));
        }
        await sleep(100);

        if (this.#store !== null) {
            await this.#store.close();
        }
        await sleep(100);
    }

    async #setUpRoleAutomatically() {
        if (!this.#base.writable && this.#enableRoleRequester) {
            console.log('Requesting writer role... This may take a moment.');
            await this.#requestWriterRole(false)
            setTimeout(async () => {
                await this.#requestWriterRole(true)
            }, 5_000);
            await sleep(5_000);
        }
    }

    async #sendMessageToAdmin(adminEntry, message) {
        try {
            if (!adminEntry || !message) {
                return;
            }
            await this.tryConnection(adminEntry.tracPublicKey, 'admin');
            await this.spinLock(() => this.#network.admin_stream === null);
            if (this.#network.admin_stream !== null) {
                await this.#network.admin_stream.messenger.send(message);
            }
        } catch (e) {
            console.log(e)
        }
    }
    async #sendMessageToNode(address, message) {
        try {
            if (!address || !message) {
             return;
            }
            await this.tryConnection(address, 'node');

            await this.spinLock(() => 
                this.#network.custom_stream === null || this.#network.custom_node !== address
            );

            if (this.#network.custom_stream !== null) {
                await this.#network.custom_stream.messenger.send(message);
            }

        } catch (e) {
            console.log(e)
        }

    }

    async #verifyMessage(signature, publicKey, bufferMessage) {
        const bufferPublicKey = b4a.from(publicKey, 'hex');
        const hash = await createHash('sha256', bufferMessage);
        return this.#wallet.verify(signature, hash, bufferPublicKey);
    }

    #isAdmin(adminEntry, node = null) {
        //on-chain
        if (!adminEntry) return false;
        if (node) return adminEntry.wk === b4a.from(node.from.key).toString('hex');
        //off-chain
        if (this.#enable_wallet === false) return false;
        return !!(this.#wallet.publicKey === adminEntry.tracPublicKey && adminEntry.wk === this.#writingKey);
    }

    async #isAllowedToRequestRole(key, adminEntry) {
        const isWhitelisted = await this.#isWhitelisted(key);
        return !!(isWhitelisted && !this.#isAdmin(adminEntry));
    }

    async _isAllowedToRequestRole(key, adminEntry) {
        const isWhitelisted = await this.#isWhitelisted(key);
        return isWhitelisted && this.#isAdmin(adminEntry);
    }

    async #isWhitelisted(key) {
        const whitelistEntry = await this.getWhitelistEntry(key)
        return !!whitelistEntry;
    }

    async #isWhitelisted2(key, batch) {
        const whitelistEntry = await this.getWhitelistEntry2(key, batch)
        return !!whitelistEntry;
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

    async getWhitelistEntry2(key, batch) {
        const entry = await batch.get(WHITELIST_PREFIX + key);
        return entry !== null ? entry.value : null
    }

    async #handleIncomingEvent(parsedRequest) {
        try {
            if (parsedRequest && parsedRequest.type && parsedRequest.key && parsedRequest.value) {
                if (parsedRequest.type === OperationType.ADD_WRITER || parsedRequest.type === OperationType.REMOVE_WRITER) {
                    //This request must be hanlded by ADMIN
                    this.emit(EventType.ADMIN_EVENT, parsedRequest);
                } else if (parsedRequest.type === OperationType.ADD_ADMIN) {
                    //This request must be handled by WRITER
                    this.emit(EventType.WRITER_EVENT, parsedRequest);
                }
                else if (parsedRequest.type === OperationType.WHITELISTED) {
                    const adminEntry = await this.get(EntryType.ADMIN);
                    const reconstructedMessage = MsgUtils.createMessage(parsedRequest.key, parsedRequest.value.nonce, OperationType.WHITELISTED);
                    const hash = await createHash('sha256', reconstructedMessage);
                    if (this.#wallet.verify(b4a.from(parsedRequest.value.sig, 'hex'), b4a.from(hash), b4a.from(adminEntry.tracPublicKey, 'hex')) && !this.#base.writable &&parsedRequest.key === this.#wallet.publicKey) {
                        await this.#handleAddWriterOperation(true)
                    }
                }
            }
        } catch (error) {
            // for now ignore the error
        }
    }

    #setupInternalListeners() {
        this.#base.on(EventType.IS_INDEXER, () => {
            if (this.listenerCount(EventType.WRITER_EVENT) > 0) {
                this.removeAllListeners(EventType.WRITER_EVENT);
                this.#shouldListenToWriterEvents = false;
            }
            this.#is_indexer = true;
            console.log('Current node is an indexer');
        });

        this.#base.on(EventType.IS_NON_INDEXER, () => {
            this.#is_indexer = false;
            console.log('Current node is not an indexer anymore');
        });

        this.#base.on(EventType.WRITABLE, async () => {
            const updatedNodeEntry = await this.get(this.#wallet.publicKey);
            const canEnableWriterEvents = updatedNodeEntry &&
                updatedNodeEntry.wk === this.#writingKey &&
                !this.#shouldListenToWriterEvents;

            if (canEnableWriterEvents) {
                this.#shouldListenToWriterEvents = true;
                this.#writerEventListener();
                console.log('Current node is writable');
            }
        });

        this.#base.on(EventType.UNWRITABLE, async () => {
            if (this.#enable_wallet === false) {
                console.log('Current node is unwritable');
                return;
            }
            const updatedNodeEntry = await this.get(this.#wallet.publicKey);
            const canDisableWriterEvents = updatedNodeEntry &&
                !updatedNodeEntry.isWriter &&
                this.#shouldListenToWriterEvents;

            if (canDisableWriterEvents) {
                this.removeAllListeners(EventType.WRITER_EVENT);
                this.#shouldListenToWriterEvents = false;
                console.log('Current node is unwritable');
            }
        });
    }

    async #adminEventListener() {
        this.on(EventType.ADMIN_EVENT, async (parsedRequest) => {
            if (this.#enable_wallet === false) return;
            const isWhitelisted = await this.#isWhitelisted(parsedRequest.key);
            const isEventMessageVerifed = await MsgUtils.verifyEventMessage(parsedRequest, this.#wallet, this.check)
            if (isWhitelisted && isEventMessageVerifed) {
                await this.#base.append(parsedRequest);
            }
        });
    }

    async #writerEventListener() {
        this.on(EventType.WRITER_EVENT, async (parsedRequest) => {
            if (this.#enable_wallet === false) return;
            const adminEntry = await this.get(EntryType.ADMIN);
            const isEventMessageVerifed = await MsgUtils.verifyEventMessage(parsedRequest, this.#wallet, this.check)
            if (adminEntry && adminEntry.tracPublicKey === parsedRequest.key && isEventMessageVerifed) {
                await this.#base.append(parsedRequest);
            }
        });
    }

    msbListener() {
        this.on(EventType.READY_MSB, async () => {
            if (!this.#isStreaming) {
                this.#isStreaming = true;
            }
        });
    }

    async #handleAdminOperations() {
        try {
            const adminEntry = await this.get(EntryType.ADMIN);
            const addAdminMessage = await MsgUtils.assembleAdminMessage(adminEntry, this.#writingKey, this.#wallet, this.#bootstrap);
            if (!adminEntry && this.#wallet && this.#writingKey && this.#writingKey === this.#bootstrap) {
                await this.#base.append(addAdminMessage);
            } else if (adminEntry && this.#wallet && adminEntry.tracPublicKey === this.#wallet.publicKey && this.#writingKey && this.#writingKey !== adminEntry.wk) {
                if (null === this.#network.validator_stream) return;
                await this.#network.validator_stream.messenger.send(addAdminMessage);
            }

            setTimeout(async () => {
                const updatedAdminEntry = await this.get(EntryType.ADMIN);
                if (this.#isAdmin(updatedAdminEntry) && !this.#shouldListenToAdminEvents) {
                    this.#shouldListenToAdminEvents = true;
                    this.#adminEventListener();
                }
            }, LISTENER_TIMEOUT);

        } catch (e) {
            console.log(e);
        }
    }

    async #handleWhitelistOperations() {
        if (this.#enable_wallet === false) return;
        const adminEntry = await this.get(EntryType.ADMIN);
        if (!this.#isAdmin(adminEntry)) return;

        const assembledWhitelistMessages = await MsgUtils.assembleWhitelistMessages(adminEntry, this.#wallet);

        if (!assembledWhitelistMessages) {
            console.log('Whitelist message not sent.');
            return;
        }

        const totelElements = assembledWhitelistMessages.length;

        for (let i = 0; i < totelElements; i++) {
            const isWhitelisted = await this.#isWhitelisted(assembledWhitelistMessages[i].key);
            if (!isWhitelisted) {
                await this.#base.append(assembledWhitelistMessages[i]);
                const whitelistedMessage = await MsgUtils.assembleWhitelistedMessage(this.#wallet, assembledWhitelistMessages[i].key);
                this.#sendMessageToNode(assembledWhitelistMessages[i].key, whitelistedMessage);
                await sleep(WHITELIST_SLEEP_INTERVAL);
                console.log(`Whitelist message sent (public key ${(i + 1)}/${totelElements})`);
            }
        }
    }

    async generateTx(bootstrap, msb_bootstrap, validator_writer_key, local_writer_key, local_public_key, content_hash, nonce) {
        let tx = bootstrap + '-' +
            msb_bootstrap + '-' +
            validator_writer_key + '-' +
            local_writer_key + '-' +
            local_public_key + '-' +
            content_hash + '-' +
            nonce;
        return await createHash('sha256', await createHash('sha256', tx));
    }

    async #requestWriterRole(toAdd) {
        if (this.#enable_wallet === false) return;
        const adminEntry = await this.get(EntryType.ADMIN);
        const nodeEntry = await this.get(this.#wallet.publicKey);
        const isAlreadyWriter = !!(nodeEntry && nodeEntry.isWriter)
        let assembledMessage = null;
        if (toAdd) {
            const isAllowedToRequestRole = await this.#isAllowedToRequestRole(this.#wallet.publicKey, adminEntry);
            const canAddWriter = !!(!this.#base.writable && !isAlreadyWriter && isAllowedToRequestRole);
            if (canAddWriter) {
                assembledMessage = await MsgUtils.assembleAddWriterMessage(this.#wallet, this.#writingKey);
            }
        }
        else {
            if (isAlreadyWriter) {
                assembledMessage = await MsgUtils.assembleRemoveWriterMessage(this.#wallet, this.#writingKey);
            }
        }

        if (assembledMessage) {
            await this.#sendMessageToAdmin(adminEntry, assembledMessage);
        }
    }

    async #updateIndexerRole(tracPublicKey, toAdd) {
        if (this.#enable_wallet === false) return;
        const adminEntry = await this.get(EntryType.ADMIN);
        if (!this.#isAdmin(adminEntry) && !this.#base.writable) return;

        const isWhitelisted = await this.#isWhitelisted(tracPublicKey);
        if (!isWhitelisted) return;

        const nodeEntry = await this.get(tracPublicKey);
        if (!nodeEntry || !nodeEntry.isWriter) return;

        const indexersEntry = await this.get(EntryType.INDEXERS);

        if (toAdd) {
            const canAddIndexer = !nodeEntry.isIndexer && indexersEntry.length <= MAX_INDEXERS;
            if (canAddIndexer) {
                const assembledAddIndexerMessage = await MsgUtils.assembleAddIndexerMessage(this.#wallet, tracPublicKey);
                await this.#base.append(assembledAddIndexerMessage);
            }
        } else {
            const canRemoveIndexer = !toAdd && nodeEntry.isIndexer && indexersEntry.length > MIN_INDEXERS;
            if (canRemoveIndexer) {
                const assembledRemoveIndexer = await MsgUtils.assembleRemoveIndexerMessage(this.#wallet, tracPublicKey);
                await this.#base.append(assembledRemoveIndexer);
            }

        }
    }

    async tryConnection(address, type = null) {
        if (null === this.#swarm) return null;
        if (this.#network.validator_stream !== null && address !== b4a.toString(this.#network.validator_stream.remotePublicKey, 'hex')) {
            this.#swarm.leavePeer(this.#network.validator_stream.remotePublicKey);
            this.#network.validator_stream = null;
            this.#network.validator = null;
        }
        // trying to join a peer from the global swarm
        if (false === this.#swarm.peers.has(address)) {
            this.#swarm.joinPeer(b4a.from(address, 'hex'));
            let cnt = 0;
            while (false === this.#swarm.peers.has(address)) {
                if (cnt >= 1500) break;
                await sleep(10);
                cnt += 1;
            }
        }

        if (this.#swarm.peers.has(address)) {
            let stream;
            // split it into 2 cases as before 1. existing connection and 
            const peerInfo = this.#swarm.peers.get(address)
            stream = this.#swarm._allConnections.get(peerInfo.publicKey)

            if (stream !== undefined && stream.messenger !== undefined) {   
                await this.#sendRequestByType(stream, type);
            }
        }
    }

    async #sendRequestByType(stream, type) {
        const waitFor = {
            validator: () => this.#network.validator_stream,
            admin: () => this.#network.admin_stream,
            node: () => this.#network.custom_stream
        }[type];
        
        if (type === 'validator') {
            await stream.messenger.send('get_validator');
        } else if (type === 'admin') {
            await stream.messenger.send('get_admin');
        } else if (type === 'node') {
            await stream.messenger.send('get_node');
        } else {
            return;
        }
        await this.spinLock( () => !waitFor)
    };
    
   async spinLock(conditionFn, maxIterations = 1500, intervalMs = 10) {
        let counter = 0;
        while (conditionFn() && counter < maxIterations) {
            await sleep(intervalMs);
            counter++;
        }
    }
    
    // TODO: AFTER WHILE LOOP SIGNAL TO THE PROCESS THAT VALIDATOR OBSERVER STOPPED OPERATING. 
    // OS CALLS, ACCUMULATORS, MAYBE THIS IS POSSIBLE TO CHECK I/O QUEUE IF IT COINTAIN IT. FOR NOW WE ARE USING SLEEP.
    async validatorObserver() {
        // Finding writers for admin recovery case
        while (this.#enableValidatorObserver && this.#enable_wallet) {

            if (this.#dht_node === null || this.#network.validator_stream !== null) {
                await sleep(1000);
                continue;
            }
            const lengthEntry = await this.#base.view.get('wrl');
            const length = lengthEntry?.value ?? 0;

            async function findValidator(_this) {
                if (_this.#network.validator_stream !== null) return;

                const rndIndex = Math.floor(Math.random() * length);
                const wriEntry = await _this.#base.view.get('wri/' + rndIndex);
                if (_this.#network.validator_stream !== null || wriEntry === null) return;

                const validatorEntry = await _this.#base.view.get(wriEntry.value);
                if (
                    _this.#network.validator_stream !== null ||
                    _this.#network.validator !== null ||
                    validatorEntry === null ||
                    !validatorEntry.value.isWriter ||
                    validatorEntry.value.isIndexer
                ) return;

                const pubKey = validatorEntry.value.pub;
                if (pubKey === _this.#wallet.publicKey) return;
                await _this.tryConnection(pubKey, 'validator');
            }

            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(findValidator(this));
                await sleep(250);
            }
            await Promise.all(promises);

            await sleep(1000);
        }
    }


    async #banValidator(tracPublicKey) {
        const adminEntry = await this.get(EntryType.ADMIN);
        if (!this.#isAdmin(adminEntry)) return;
        const isWhitelisted = await this.#isWhitelisted(tracPublicKey);
        const nodeEntry = await this.get(tracPublicKey);
        if (!isWhitelisted || null === nodeEntry || nodeEntry.isIndexer === true) return;

        const assembledBanValidatorMessage = await MsgUtils.assembleBanValidatorMessage(this.#wallet, tracPublicKey);
        this.#base.append(assembledBanValidatorMessage);

    }

    async #handleAddIndexerOperation(tracPublicKey) {
        this.#updateIndexerRole(tracPublicKey, true);
    }

    async #handleRemoveIndexerOperation(tracPublicKey) {
        this.#updateIndexerRole(tracPublicKey, false);
    }

    async #handleAddWriterOperation() {
        await this.#requestWriterRole(true);
    }

    async #handleRemoveWriterOperation() {
        await this.#requestWriterRole(false);
    }

    async #handleBanValidatorOperation(tracPublicKey) {
        await this.#banValidator(tracPublicKey);
    }

    stopValidatorObserver() {
        this.#enableValidatorObserver = false;
    }

    printHelp() {
        console.log('Available commands:');
        console.log('- /add_writer: add yourself as validator to this MSB once whitelisted.');
        console.log('- /remove_writer: remove yourself from this MSB.');
        console.log('- /add_admin: register admin entry with bootstrap key. (initial setup)');
        console.log('- /add_whitelist: add all specified whitelist addresses. (admin only)');
        console.log('- /add_indexer <address>: change a role of the selected writer node to indexer role. (admin only)');
        console.log('- /remove_indexer <address>: change a role of the selected indexer node to default role. (admin only)');
        console.log('- /ban_writer <address>: demote a whitelisted writer to default role and remove it from the whitelist. (admin only)');
        console.log('- /get_node_info <address>: get information about a node with the given address.');
        console.log('- /stats: check system stats such as writing key, DAG, etc.');
        console.log('- /exit: Exit the program.');
        console.log('- /help: display this help.');
    }

    async interactiveMode() {
        if (this.#readline_instance === null) return;
        const rl = this.#readline_instance;

        this.printHelp();

        rl.on('line', async (input) => {
            switch (input) {
                case '/help':
                    this.printHelp();
                    break;
                case '/exit':
                    rl.close();
                    await this.close();
                    break;
                case '/push_writer_add':
                    await this.#requestWriterRole(true)
                    break;
                case '/add_admin':
                    await this.#handleAdminOperations();
                    break;
                case '/add_whitelist':
                    await this.#handleWhitelistOperations();
                    break;
                case '/add_writer':
                    await this.#handleAddWriterOperation(true);
                    break;
                case '/remove_writer':
                    await this.#handleRemoveWriterOperation();
                    break
                case '/flags':
                    console.log("shouldListenToAdminEvents: ", this.#shouldListenToAdminEvents);
                    console.log("shouldListenToWriterEvents: ", this.#shouldListenToWriterEvents);
                    console.log("isWritable: ", this.#base.writable);
                    console.log("isIndexer: ", this.#base.isIndexer);
                    break
                case '/show':
                    const admin = await this.get(EntryType.ADMIN);
                    console.log('Admin:', admin);
                    const indexers = await this.get(EntryType.INDEXERS);
                    console.log('Indexers:', indexers);
                    break;
                case '/stats':
                    await verifyDag(this.#base, this.#swarm, this.#wallet, this.#writingKey);
                    break;
                default:
                    if (input.startsWith('/get_node_info')) {
                        const splitted = input.split(' ');
                        console.log("whitelist entry:", await this.#isWhitelisted(splitted[1]))
                    } else if (input.startsWith('/add_indexer')) {
                        const splitted = input.split(' ');
                        const tracPublicKey = splitted[1]
                        await this.#handleAddIndexerOperation(tracPublicKey);
                    }
                    else if (input.startsWith('/remove_indexer')) {
                        const splitted = input.split(' ');
                        const tracPublicKey = splitted[1]
                        await this.#handleRemoveIndexerOperation(tracPublicKey);
                    }
                    else if (input.startsWith('/ban_writer')) {
                        const splitted = input.split(' ');
                        const tracPublicKey = splitted[1]
                        await this.#handleBanValidatorOperation(tracPublicKey);
                    }
            }
            rl.prompt();
        });

        rl.prompt();
    }

}

export default MainSettlementBus;
