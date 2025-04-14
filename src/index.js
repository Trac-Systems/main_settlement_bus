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
import { LISTENER_TIMEOUT, EntryType, OperationType, EventType, ACK_INTERVAL, WHITELIST_SLEEP_INTERVAL, UPDATER_INTERVAL, MAX_INDEXERS, MIN_INDEXERS, WHITELIST_PREFIX } from './utils/constants.js';
import Network from './network.js';
import Check from './utils/check.js';

import DHT from 'hyperdht'
import process from 'process'

//TODO: CHANGE NONCE.

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
    #tx;
    #store;
    #bee;
    #swarm;
    #dht_server;
    #dht_node;
    #dht_bootstrap;
    #base;
    #writingKey;
    #enable_txchannel;
    #enable_updater;
    #enable_wallet;
    #wallet;
    #replicate;
    #network;
    #opts;

    constructor(options = {}) {
        super();
        this.check = new Check();
        this.#initInternalAttributes(options);
        this.msbListener();
        this.#boot();
        this.ready().catch(noop);
        this.#setupInternalListeners();
        this.#network = new Network(this.#base);
    }

    #initInternalAttributes(options) {
        this.#STORES_DIRECTORY = options.stores_directory;
        this.#KEY_PAIR_PATH = `${this.STORES_DIRECTORY}${options.store_name}/db/keypair.json`
        this.#bootstrap = options.bootstrap || null;
        this.#channel = b4a.alloc(32).fill(options.channel) || null;
        this.#tx = b4a.alloc(32).fill(options.tx) || null;
        this.#store = new Corestore(this.STORES_DIRECTORY + options.store_name);
        this.#bee = null;
        this.#swarm = null;
        this.#dht_bootstrap = [/*'116.202.214.143:10001','116.202.214.149:10001', */'node1.hyperdht.org:49737', 'node2.hyperdht.org:49737', 'node3.hyperdht.org:49737'];
        this.#dht_node = new DHT({ bootstrap: this.#dht_bootstrap });
        this.#dht_server = null;
        this.#base = null;
        this.#writingKey = null;
        this.#enable_txchannel = options.enable_txchannel !== false;
        this.#enable_updater = options.enable_updater !== false;
        this.#enable_wallet = options.enable_wallet !== false;
        this.#wallet = new PeerWallet(options);
        this.#replicate = options.replicate !== false;
        this.#opts = options;
    }

    // TODO: Implement other getters as necessary
    // TODO: Separate those getters in the code
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

    #boot() {
        const _this = this;
        this.#base = new Autobase(this.#store, this.#bootstrap, {
            valueEncoding: 'json',
            ackInterval: ACK_INTERVAL,
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
        };
        return handlers[type] || null;
    }

    async #handleApplyTxOperation(op, view, base, node, batch) {
        const postTx = op.value;
        if (postTx.op === OperationType.POST_TX &&
            null === await batch.get(op.key) &&
            this.check.sanitizePostTx(op) &&
            op.key === postTx.tx &&
            this.#wallet.verify(b4a.from(postTx.is, 'hex'), b4a.from(postTx.tx + postTx.in), b4a.from(postTx.ipk, 'hex')) && // sender verification
            this.#wallet.verify(b4a.from(postTx.ws, 'hex'), b4a.from(postTx.tx + postTx.wn), b4a.from(postTx.wp, 'hex')) && // writer verification
            postTx.tx === await this.generateTx(postTx.bs, this.bootstrap, postTx.wp, postTx.i, postTx.ipk, postTx.ch, postTx.in) &&
            b4a.byteLength(JSON.stringify(postTx)) <= 4096
        ) {
            await batch.put(op.key, op.value);
            console.log(`TX: ${op.key} appended. Signed length: `, this.#base.view.core.signedLength);
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

    async #handleApplyAddWriterOperation(op, view, base, node, batch) {
        const adminEntry = await batch.get(EntryType.ADMIN);
        if (null === adminEntry || !this.check.sanitizeAdminAndWritersOperations(op) || !this.#isAdmin(adminEntry.value, node)) return;

        const isWhitelisted = await this.#isWhitelisted2(op.key, batch);
        if (!isWhitelisted || op.key !== op.value.pub) return;
        // TODO: if the below is not a message signed by admin BUT this handler is supposed to be executed by the admin, then use admin signatures in apply!
        const isMessageVerifed = await this.#verifyMessage(op.value.sig, op.key, MsgUtils.createMessage(op.key, op.value.pub, op.value.wk, op.value.nonce, op.type));
        if (isMessageVerifed) {
            await this.#addWriter(op, batch, base);
        }
    }

    async #addWriter(op, batch, base) {
        const nodeEntry = await batch.get(op.key);
        if (nodeEntry === null || !nodeEntry.value.isWriter) {
            await base.addWriter(b4a.from(op.value.wk, 'hex'), { isIndexer: false })
            await batch.put(op.key, {
                pub : op.value.pub,
                wk: op.value.wk,
                isWriter: true,
                isIndexer: false
            });
            let length = await batch.get('wrl');
            if(null === length){
                length = 0;
            } else {
                length = length.value;
            }
            await batch.put('wri/'+length, op.value.pub);
            await batch.put('wrl', length + 1);
            console.log(`Writer added: ${op.key}:${op.value.wk}`);
        }
    }

    async #handleApplyRemoveWriterOperation(op, view, base, node, batch) {
        const adminEntry = await batch.get(EntryType.ADMIN);
        if (null === adminEntry || !this.check.sanitizeAdminAndWritersOperations(op) || !this.#isAdmin(adminEntry.value, node)) return;
        // TODO: if the below is not a message signed by admin BUT this handler is supposed to be executed by the admin, then use admin signatures in apply!
        const isMessageVerifed = await this.#verifyMessage(op.value.sig, op.key, MsgUtils.createMessage(op.key,op.value.pub, op.value.wk, op.value.nonce, op.type));
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
            console.log(`Writer removed: ${op.key}:${op.value.wk}`);
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
        if (null === adminEntry  || !this.#isAdmin(adminEntry.value, node) || null === indexersEntry || !Array.from(indexersEntry.value).includes(op.key) || Array.from(indexersEntry.value).length <= 1) return;
        // TODO: is the below an admin signature? -yes
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

    async _open() {
        await this.#base.ready();
        if (this.#enable_wallet) {
            await this.#wallet.initKeyPair(this.KEY_PAIR_PATH);
        }
        console.log('View Length:', this.#base.view.core.length);
        console.log('View Signed Length:', this.#base.view.core.signedLength);
        console.log('MSB Key:', b4a.from(this.#base.view.core.key).toString('hex'));

        this.#writingKey = b4a.toString(this.#base.local.key, 'hex');
        console.log('Writer Key:', this.#writingKey);

        if (this.#replicate) {
            this.#swarm = await Network.replicate(this.#dht_bootstrap, this.#swarm, this.#enable_wallet, this.#store, this.#wallet, this.#channel, this.#isStreaming, this.#handleIncomingEvent.bind(this), this.emit.bind(this));
        }

        if (this.#enable_txchannel) {
            this.#dht_server = this.#dht_node.createServer();
            await Network.dhtServer(this, this.#dht_server, this.#base, this.#wallet, this.#writingKey, this.#network);
        }

        const adminEntry = await this.get(EntryType.ADMIN);

        if (this.#isAdmin(adminEntry)) {
            this.#shouldListenToAdminEvents = true;
            this.#adminEventListener(); // only for admin
        } else if (!this.#isAdmin(adminEntry) && this.#base.writable && !this.#base.isIndexer) {
            this.#shouldListenToWriterEvents = true;
            this.#writerEventListener(); // only for writers
        }

        //await this.#setUpRoleAutomatically(adminEntry);

        if (this.#enable_updater) {
            this.updater();// TODO: NODE AFTER BECOMING A writer should start the updater
        }

        console.log(`isIndexer: ${this.#base.isIndexer}`);
        console.log(`isWriter: ${this.#base.writable}`);
        console.log('View Length:', this.#base.view.core.length);
        console.log('View Signed Length:', this.#base.view.core.signedLength);
    }

    async close() {
        console.log('Closing everything...');
        if (this.#swarm) {
            await this.#swarm.destroy();
        }
        if (this.#dht_server) {
            try{
                await this.#dht_server.close();
            } catch(e){
                console.log(e.message);
            }
        }
        try{
            this.#dht_node.destroy();
        } catch(e){
            console.log(e.message);
        }
        await this.#base.close();
    }

    async #setUpRoleAutomatically() {
        if (!this.#base.writable) {
            await this.#requestWriterRole(false)
            setTimeout(async () => {
                await this.#requestWriterRole(true)
            }, 10_000);
        }
    }

    #sendMessageToAdmin(adminEntry, message) {
        if (!adminEntry || !message) {
            return;
        }
        const node = new DHT({bootstrap:this.#dht_bootstrap})
        const stream = node.connect(b4a.from(adminEntry.tracPublicKey, 'hex'))
        stream.on('connect', async function () {
            await stream.send(b4a.from(JSON.stringify({ op : 'add_writer', message : message })));
            await stream.destroy();
        });
        stream.on('open', function () { });
        stream.on('close', () => { });
        stream.on('error', (error) => { });
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

    async updater() {
        while (true) {
            if (this.#base.writable) {
                await this.#base.append(null);
            }
            await sleep(UPDATER_INTERVAL);
        }
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

    async #handleIncomingEvent(data) {
        try {
            const bufferData = data.toString();
            const parsedRequest = JSON.parse(bufferData);
            if (parsedRequest && parsedRequest.type && parsedRequest.key && parsedRequest.value) {
                if (parsedRequest.type === OperationType.ADD_WRITER || parsedRequest.type === OperationType.REMOVE_WRITER) {
                    //This request must be hanlded by ADMIN
                    this.emit(EventType.ADMIN_EVENT, parsedRequest);
                } else if (parsedRequest.type === OperationType.ADD_ADMIN) {
                    //This request must be handled by WRITER
                    this.emit(EventType.WRITER_EVENT, parsedRequest);
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
            console.log('Current node is an indexer');
        });

        this.#base.on(EventType.IS_NON_INDEXER, () => {
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
            if(this.#enable_wallet === false) {
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
            if(this.#enable_wallet === false) return;
            const isWhitelisted = await this.#isWhitelisted(parsedRequest.key);
            const isEventMessageVerifed = await MsgUtils.verifyEventMessage(parsedRequest, this.#wallet)
            if (isWhitelisted && isEventMessageVerifed) {
                await this.#base.append(parsedRequest);
            }
        });
    }

    async #writerEventListener() {
        this.on(EventType.WRITER_EVENT, async (parsedRequest) => {
            if(this.#enable_wallet === false) return;
            const adminEntry = await this.get(EntryType.ADMIN);
            const isEventMessageVerifed = await MsgUtils.verifyEventMessage(parsedRequest, this.#wallet)
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
        //TODO: ADJUST FOR WHITELIST STRUCTURE
        const adminEntry = await this.get(EntryType.ADMIN);
        const addAdminMessage = await MsgUtils.assembleAdminMessage(adminEntry, this.#writingKey, this.#wallet, this.#bootstrap);
        if (!adminEntry && this.#wallet && this.#writingKey && this.#writingKey === this.#bootstrap) {
            await this.#base.append(addAdminMessage);
        } else if (adminEntry && this.#wallet && adminEntry.tracPublicKey === this.#wallet.publicKey && this.#writingKey && this.#writingKey !== adminEntry.wk) {
            let connections = [];
            for (const conn of this.#swarm.connections) {

                const remotePublicKeyHex = b4a.from(conn.remotePublicKey).toString('hex');
                const remotePublicKeyEntry = await this.get(remotePublicKeyHex);
                const isWhitelisted = await this.#isWhitelisted(remotePublicKeyHex);

                if (conn.connected &&
                    isWhitelisted &&
                    remotePublicKeyEntry &&
                    remotePublicKeyEntry.isWriter === true &&
                    remotePublicKeyEntry.isIndexer === false &&
                    remotePublicKeyHex !== this.#wallet.publicKey) {
                    connections.push(conn);
                }
            }
            if (connections.length > 0) {
                connections[Math.floor(Math.random() * connections.length)].write(JSON.stringify(addAdminMessage));
            }
            //TODO: Implement an algorithm to search a new writer and connect/send the request for it.
        }

        setTimeout(async () => {
            const updatedAdminEntry = await this.get(EntryType.ADMIN);
            if (this.#isAdmin(updatedAdminEntry) && !this.#shouldListenToAdminEvents) {
                this.#shouldListenToAdminEvents = true;
                this.#adminEventListener();
            }
        }, LISTENER_TIMEOUT);

    }

    async #handleWhitelistOperations() {
        if(this.#enable_wallet === false) return;
        const adminEntry = await this.get(EntryType.ADMIN);
        if (!this.#isAdmin(adminEntry)) return;

        const assembledWhitelistMessages = await MsgUtils.assembleWhitelistMessages(adminEntry, this.#wallet);

        if (!assembledWhitelistMessages) {
            console.log('Whitelist message not sent.');
            return;
        }

        const totelElements = assembledWhitelistMessages.length;

        for (let i = 0; i < totelElements; i++) {
            await this.#base.append(assembledWhitelistMessages[i]);
            console.log(`Whitelist message sent (public key ${(i + 1)}/${totelElements})`);
            await sleep(WHITELIST_SLEEP_INTERVAL);
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
        if(this.#enable_wallet === false) return;
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
            this.#sendMessageToAdmin(adminEntry, assembledMessage);
        }
    }

    async #updateIndexerRole(tracPublicKey, toAdd) {
        if(this.#enable_wallet === false) return;
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

    async interactiveMode() {
        const rl = readline.createInterface({
            input: new tty.ReadStream(0),
            output: new tty.WriteStream(1)
        });

        console.log('MSB started. Available commands:');
        console.log('- /add_admin: register admin entry with bootstrap key.');
        console.log('- /add_whitelist: add a list of Trac public keys. Nodes that own these public keys can become writers.');
        console.log('- /add_indexer <trac_public_key>: change a role of the selected writer node to indexer role');
        console.log('- /push_writer_add: try to enforce adding this peer as writer after whitelisting.');
        console.log('- /remove_indexer <trac_public_key>: change a role of the selected indexer node to default role');
        console.log('- /get_node_info <trac_public_key>: get information about a node with the given Trac public key');
        console.log('- /dag: check system properties such as writing key, DAG, etc.');
        console.log('- /exit: Exit the program');

        rl.on('line', async (input) => {
            switch (input) {
                case '/exit':
                    console.log('Exiting...');
                    rl.close();
                    await this.close();
                    typeof process !== "undefined" ? process.exit(0) : Pear.exit(0);
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
                    // Only for DEBUG
                    console.log("shouldListenToAdminEvents: ", this.#shouldListenToAdminEvents);
                    console.log("shouldListenToWriterEvents: ", this.#shouldListenToWriterEvents);
                    console.log("isWritable: ", this.#base.writable);
                    console.log("isIndexer: ", this.#base.isIndexer);
                    break
                case '/show':
                    // /get_node_info 9da99d98f02f24bdb13d46ba5d346c9a3eda03c18ab6e1441b7bac9743cf0bcc1
                    // Only for DEBUG
                    const admin = await this.get(EntryType.ADMIN);
                    console.log('Admin:', admin);
                    const indexers = await this.get(EntryType.INDEXERS);
                    console.log('Indexers:', indexers);
                    break;
                case '/dag':
                    await verifyDag(this.#base);
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
            }
            rl.prompt();
        });

        rl.prompt();
    }

}

function noop() { }
export default MainSettlementBus;
