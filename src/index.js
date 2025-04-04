/** @typedef {import('pear-interface')} */ /* global Pear */
import Autobase from 'autobase';
import Hyperswarm from 'hyperswarm';
import ReadyResource from 'ready-resource';
import b4a from 'b4a';
import Hyperbee from 'hyperbee';
import readline from 'readline';
import { sanitizeTransaction, verifyDag, sleep } from './utils/functions.js';
import w from 'protomux-wakeup';
import PeerWallet from "trac-wallet"
import tty from 'tty';
import Corestore from 'corestore';
import tty from 'tty';
import sodium from 'sodium-native';
import MsgUtils from './utils/msgUtils.js';
import { createHash } from 'crypto';
import { MAX_PUBKEYS_LENGTH, LISTENER_TIMEOUT, EntryType, OperationType, EventType, TRAC_NAMESPACE, ACK_INTERVAL, WHITELIST_SLEEP_INTERVAL, MAX_PEERS, MAX_PARALLEL, MAX_SERVER_CONNECTIONS } from './utils/constants.js';

//TODO: CHANGE NONCE.

const wakeup = new w();

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
    #tx_pool;
    #store;
    #bee;
    #swarm;
    #tx_swarm;
    #base;
    #key;
    #writingKey;
    #enable_txchannel;
    #enable_updater;
    #enable_wallet;
    #wallet;
    #replicate;
    #opts;

    constructor(options = {}) {
        super();
        this.#initInternalAttributes(options);
        this.pool();
        this.msbListener();
        this._boot();
        this.ready().catch(noop);
        this.#setupInternalListeners();
    }

    #initInternalAttributes(options) {
        //TODO: change visibility of the attributes to private. Most of them should be internal.
        this.#STORES_DIRECTORY = options.stores_directory;
        this.#KEY_PAIR_PATH = `${this.STORES_DIRECTORY}${options.store_name}/db/keypair.json`
        this.#bootstrap = options.bootstrap || null;
        this.#channel = b4a.alloc(32).fill(options.channel) || null;
        this.#tx = b4a.alloc(32).fill(options.tx) || null;
        this.#tx_pool = [];
        this.#store = new Corestore(this.STORES_DIRECTORY + options.store_name);
        this.#bee = null;
        this.#swarm = null;
        this.#tx_swarm = null;
        this.#base = null;
        this.#key = null;
        this.#writingKey = null;
        this.#enable_txchannel = options.enable_txchannel !== false;
        this.#enable_updater = options.enable_updater !== false;
        this.#enable_wallet = options.enable_wallet !== false;
        this.#wallet = this.#enable_wallet ? new PeerWallet(options) : null;
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

    _boot() {
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
        for (const node of nodes) {
            const op = node.value;
            const handler = this.#getApplyOperationHandler(op.type);
    
            if (handler) {
                await handler(op, view, base, node);
            } else {
                console.warn(`Unknown operation type: ${op.type}`);
            }
        }
        await view.batch.flush();
        await view.batch.close();
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

    async #handleApplyTxOperation(op, view, base, node) {
        const batch = view.batch(); 
        const postTx = op.value;

        if (postTx.op === OperationType.POST_TX &&
            null === await batch.get(op.key) &&
            sanitizeTransaction(postTx) &&
            this.#wallet.verify(b4a.from(postTx.is, 'hex'), b4a.from(postTx.tx + postTx.in), b4a.from(postTx.ipk, 'hex')) && // sender verification
            this.#wallet.verify(b4a.from(postTx.ws, 'hex'), b4a.from(postTx.tx + postTx.wn), b4a.from(postTx.wp, 'hex')) && // writer verification
            postTx.tx === await this.generateTx(postTx.bs, this.bootstrap, postTx.w, postTx.i, postTx.ipk, postTx.ch, postTx.in) &&
            b4a.byteLength(JSON.stringify(postTx)) <= 4096
        ) {
            await batch.put(op.key, op.value);
            console.log(`TX: ${op.key} appended. Signed length: `, this.#base.view.core.signedLength);
        }
    }

    async #handleApplyAddAdminOperation(op, view, base, node) {
        const adminEntry = await this.getSigned(EntryType.ADMIN);
        if (!adminEntry && node.from.key.toString('hex') === this.#bootstrap && op.value.wk === this.#bootstrap) {
            // If admin isn't set yet...
            if (this.#verifyMessage(op.value.sig, op.key, MsgUtils.createMessage(op.key, op.value.wk, op.value.nonce, op.type))) {
                await view.put(EntryType.ADMIN, {
                    tracPublicKey: op.key,
                    wk: this.#bootstrap
                })
                const initIndexers = [op.key];
                await view.put(EntryType.INDEXERS, initIndexers);
                console.log(`Admin added: ${op.key}:${this.#bootstrap}`);
            }
        }
        else if (adminEntry && adminEntry.tracPublicKey === op.key) {
            // If admin is already set...
            if (this.#verifyMessage(op.value.sig, adminEntry.tracPublicKey, MsgUtils.createMessage(adminEntry.tracPublicKey, op.value.wk, op.value.nonce, op.type))) {

                const indexersEntry = await this.getSigned(EntryType.INDEXERS);
                if (indexersEntry && indexersEntry.includes(adminEntry.tracPublicKey) && indexersEntry.length > 1) {

                    await base.removeWriter(b4a.from(adminEntry.wk, 'hex'));
                    await base.addWriter(b4a.from(op.value.wk, 'hex'), { isIndexer: true })
                    await view.put(EntryType.ADMIN, {
                        tracPublicKey: adminEntry.tracPublicKey,
                        wk: op.value.wk
                    })
                    console.log(`Admin updated: ${adminEntry.tracPublicKey}:${op.value.wk}`);
                }
            }
        }
    }

    async #handleApplyAppendWhitelistOperation(op, view, base, node) {
        // TODO: - change list to hashmap (Map() in js)
        // - make a decision how will we append pubKeys into hashmap.
        const adminEntry = await this.getSigned(EntryType.ADMIN);
        if (!this.#isAdmin(adminEntry, node)) {
            return;
        }

        const pubKeys = JSON.parse(op.value.pubKeysList); // As all pubkeys are 32 bytes, we can check the string.len instead of parsing it first

        if (this.#verifyMessage(op.value.sig, adminEntry.tracPublicKey, MsgUtils.createMessage(pubKeys.join(''), op.value.nonce, op.type))) {

            if (pubKeys.length > MAX_PUBKEYS_LENGTH) {
                return;
            }
            const whitelistEntry = await this.getSigned(EntryType.WHITELIST);

            if (!whitelistEntry) {
                // TODO: Implement a hashmap structure to store public keys. Storing it as a vector is not efficient.
                //       We might need to implement a new class for having a solution more tailored to our needs
                await view.put(EntryType.WHITELIST, pubKeys);
            }
            else {
                // TODO: In this case we should include items in the list (in the future it will be a hashmap). Doing this with a vector is VERY inefficient
                pubKeys.forEach((key) => {
                    if (!whitelistEntry.includes(key)) {
                        whitelistEntry.push(key);
                    }
                });

                await view.put(EntryType.WHITELIST, whitelistEntry);
            }
        }
    }

    async #handleApplyAddWriterOperation(op, view, base, node) {
        const adminEntry = await this.getSigned(EntryType.ADMIN);
        const whitelistEntry = await this.getSigned(EntryType.WHITELIST);

        if (!this.#isAdmin(adminEntry, node) || !whitelistEntry || !Array.from(whitelistEntry).includes(op.key)) {
            return;
        }

        if (this.#verifyMessage(op.value.sig, op.key, MsgUtils.createMessage(op.key, op.value.wk, op.value.nonce, op.type))) {
            const nodeEntry = await this.getSigned(op.key);
            if (nodeEntry === null || !nodeEntry.isWriter) {
                await base.addWriter(b4a.from(op.value.wk, 'hex'), { isIndexer: false })
                await view.put(op.key, {
                    wk: op.value.wk,
                    isWriter: true,
                    isIndexer: false
                });
                console.log(`Writer added: ${op.key}:${op.value.wk}`);
            }
        }
    }

    async #handleApplyRemoveWriterOperation(op, view, base, node) {
        const adminEntry = await this.getSigned(EntryType.ADMIN);
        if (!this.#isAdmin(adminEntry, node)) {
            return;
        }
        if (this.#verifyMessage(op.value.sig, op.key, MsgUtils.createMessage(op.key, op.value.wk, op.value.nonce, op.type))) {
            const nodeEntry = await this.getSigned(op.key)
            if (nodeEntry !== null && nodeEntry.isWriter === true) {
                await base.removeWriter(b4a.from(nodeEntry.wk, 'hex'));
                nodeEntry.isWriter = false;

                if (nodeEntry.isIndexer === true) {
                    nodeEntry.isIndexer = false;
                }
                await view.put(op.key, nodeEntry);
                console.log(`Writer removed: ${op.key}:${op.value.wk}`);
            }
        }
    }

    async #handleApplyAddIndexerOperation(op, view, base, node) {
        const adminEntry = await this.getSigned(EntryType.ADMIN);
        const whitelistEntry = await this.getSigned(EntryType.WHITELIST);
        const indexersEntry = await this.getSigned(EntryType.INDEXERS);

        if (!this.#isAdmin(adminEntry, node) ||
            !whitelistEntry ||
            !Array.from(whitelistEntry).includes(op.key) ||
            !indexersEntry || Array.from(indexersEntry).includes(op.key) ||
            Array.from(indexersEntry).length >= 5) {
            return;
        }

        if (this.#verifyMessage(op.value.sig, adminEntry.tracPublicKey, MsgUtils.createMessage(op.key, op.value.nonce, op.type))) {
            const nodeEntry = await this.getSigned(op.key);

            if (nodeEntry !== null && nodeEntry.isWriter && !nodeEntry.isIndexer) {

                await base.removeWriter(b4a.from(nodeEntry.wk, 'hex'));
                await base.addWriter(b4a.from(nodeEntry.wk, 'hex'), { isIndexer: true })
                nodeEntry.isIndexer = true;
                await view.put(op.key, nodeEntry);
                indexersEntry.push(op.key);
                await view.put(EntryType.INDEXERS, indexersEntry);
                console.log(`Indexer added: ${op.key}:${nodeEntry.wk}`);
            }
        }
    }

    async #handleApplyRemoveIndexerOperation(op, view, base, node) {
        const adminEntry = await this.getSigned(EntryType.ADMIN);
        const indexersEntry = await this.getSigned(EntryType.INDEXERS);
        if (!this.#isAdmin(adminEntry, node) || !indexersEntry || !Array.from(indexersEntry).includes(op.key) || Array.from(indexersEntry).length <= 1) {
            return;
        }
        if (this.#verifyMessage(op.value.sig, adminEntry.tracPublicKey, MsgUtils.createMessage(op.key, op.value.nonce, op.type))) {
            const nodeEntry = await this.getSigned(op.key);
            if (nodeEntry !== null && nodeEntry.isWriter && nodeEntry.isIndexer) {
                await base.removeWriter(b4a.from(nodeEntry.wk, 'hex'));

                nodeEntry.isWriter = false;
                nodeEntry.isIndexer = false;
                await view.put(op.key, nodeEntry);

                const idx = indexersEntry.indexOf(op.key);
                if (idx !== -1) {
                    indexersEntry.splice(idx, 1);
                    await view.put(EntryType.INDEXERS, indexersEntry);
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
        if (this.#replicate) await this._replicate();
        if (this.#enable_txchannel) {
            await this.txChannel();
        }

        const adminEntry = await this.getSigned(EntryType.ADMIN);
        if (this.#isAdmin(adminEntry)) {
            this.#shouldListenToAdminEvents = true;
            this.#adminEventListener(); // only for admin
        } else if (!this.#isAdmin(adminEntry) && this.#base.writable && !this.#base.isIndexer) {
            this.#shouldListenToWriterEvents = true;
            this.#writerEventListener(); // only for writers
        }

        await this.#setUpRoleAutomatically(adminEntry);

        if (this.#enable_updater && this.#base.writable) {
            this.updater();
        }

        console.log(`isIndexer: ${this.#base.isIndexer}`);
        console.log(`isWriter: ${this.#base.writable}`);
        console.log('View Length:', this.#base.view.core.length);
        console.log('View Signed Length:', this.#base.view.core.signedLength);
    }

    async close() {
        if (this.#swarm) {
            await this.#swarm.destroy();
        }
        if (this.#tx_swarm) {
            await this.#tx_swarm.destroy();
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
        this.#swarm.connections.forEach((conn) => {
            if (b4a.from(conn.remotePublicKey).toString('hex') === adminEntry.tracPublicKey && conn.connected) {
                conn.write(JSON.stringify(message));
            }
        });
    }

    #verifyMessage(signature, publicKey, bufferMessage) {
        const bufferPublicKey = b4a.from(publicKey, 'hex');
        const hash = createHash('sha256').update(bufferMessage).digest('hex');
        return this.#wallet.verify(signature, hash, bufferPublicKey);
    }

    #isAdmin(adminEntry, node = null) {
        if (!adminEntry) return false;
        if (node) return adminEntry.wk === b4a.from(node.from.key).toString('hex');
        return this.#wallet.publicKey === adminEntry.tracPublicKey && adminEntry.wk === this.#writingKey;

    }

    #amIWhitelisted(whitelistEntry, adminEntry) {
        return whitelistEntry && Array.isArray(whitelistEntry) && whitelistEntry.includes(this.#wallet.publicKey) && !this.#isAdmin(adminEntry);
    }

    async updater() {
        while (true) {
            if (this.#base.writable) {
                await this.#base.append(null);
            }
            await sleep(10_000);
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
            for (const eventName of this.eventNames()) {
                if (eventName === EventType.WRITER_EVENT) {
                    this.removeAllListeners(EventType.WRITER_EVENT);
                    this.#shouldListenToWriterEvents = false;
                    break;
                }
            }
            console.log('Current node is an indexer');
        });

        this.#base.on(EventType.IS_NON_INDEXER, () => {
            console.log('Current node is not an indexer anymore');
        });

        this.#base.on(EventType.WRITABLE, async () => {
            const updatedNodeEntry = await this.getSigned(this.#wallet.publicKey);
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
            const updatedNodeEntry = await this.getSigned(this.#wallet.publicKey);
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
            const whitelistEntry = await this.getSigned(EntryType.WHITELIST)
            if (Array.from(whitelistEntry).includes(parsedRequest.key) && MsgUtils.verifyEventMessage(parsedRequest, this.#wallet)) {
                await this.#base.append(parsedRequest);
            }
        });
    }

    async #writerEventListener() {
        this.on(EventType.WRITER_EVENT, async (parsedRequest) => {
            const adminEntry = await this.getSigned(EntryType.ADMIN);
            if (adminEntry && adminEntry.tracPublicKey === parsedRequest.value.tracPublicKey && MsgUtils.verifyEventMessage(parsedRequest, this.#wallet)) {
                await this.#base.append(parsedRequest);
            }
        });
    }

    async txChannel() {
        this.tx_swarm = new Hyperswarm({ maxPeers: 1024, maxParallel: 512, maxServerConnections: 256 });
        this.tx_swarm.on('connection', async (connection, peerInfo) => {
            const _this = this;

            connection.on('close', () => {});
            connection.on('error', (error) => {});
            connection.on('data', async (msg) => {

                if (_this.#base.isIndexer) return;

                // TODO: decide if a tx rejection should be responded with
                if (_this.#tx_pool.length >= 1000) {
                    console.log('pool full');
                    return
                }

                if (b4a.byteLength(msg) > 3072) return;

                try {

                    const parsedPreTx = JSON.parse(msg);

                    if (sanitizeTransaction(parsedPreTx) &&
                        parsedPreTx.op === 'pre-tx' &&
                        this.#wallet.verify(b4a.from(parsedPreTx.is, 'hex'), b4a.from(parsedPreTx.tx + parsedPreTx.in), b4a.from(parsedPreTx.ipk, 'hex')) &&
                        parsedPreTx.w === _this.#writingKey &&
                        null === await _this.#base.view.get(parsedPreTx.tx)
                    ) {
                        const nonce = MsgUtils.generateNonce();
                        const signature = this.#wallet.sign(b4a.from(parsedPreTx.tx + nonce), b4a.from(this.#wallet.secretKey, 'hex'));
                        const append_tx = {
                            op: 'post-tx',
                            tx: parsedPreTx.tx,
                            is: parsedPreTx.is,
                            w: parsedPreTx.w,
                            i: parsedPreTx.i,
                            ipk: parsedPreTx.ipk,
                            ch: parsedPreTx.ch,
                            in: parsedPreTx.in,
                            bs: parsedPreTx.bs,
                            mbs: parsedPreTx.mbs,
                            ws: signature.toString('hex'),
                            wp: this.#wallet.publicKey,
                            wn: nonce
                        };
                        _this.#tx_pool.push({ tx: parsedPreTx.tx, append_tx: append_tx });
                    }
                } catch (e) {
                    //console.log(e)
                }
            });
        });

        const channelBuffer = this.#tx;
        this.tx_swarm.join(channelBuffer, { server: true, client: true });
        await this.tx_swarm.flush();
        console.log('Joined MSB TX channel');
    }

    async pool() {
        while (true) {
            if (this.#tx_pool.length > 0) {
                const length = this.#tx_pool.length;
                const batch = [];
                for(let i = 0; i < length; i++){
                    if(i >= 100) break;
                    batch.push({ type: 'tx', key: this.#tx_pool[i].tx, value: this.#tx_pool[i].append_tx });
                }
                await this.base.append(batch);
                this.#tx_pool.splice(0, batch.length);
            }
            await sleep(10);
        }
    }

    async _replicate() {
        if (!this.#swarm) {
            let keyPair;
            if (!this.#enable_wallet) {
                keyPair = await this.#store.createKeyPair(TRAC_NAMESPACE);
            }

            keyPair = {
                publicKey: b4a.from(this.#wallet.publicKey, 'hex'),
                secretKey: b4a.from(this.#wallet.secretKey, 'hex')
            };

            this.#swarm = new Hyperswarm({ keyPair, maxPeers: MAX_PEERS, maxParallel: MAX_PARALLEL, maxServerConnections: MAX_SERVER_CONNECTIONS });

            console.log(`Channel: ${this.#channel}`);
            console.log(`Writing key: ${this.#writingKey}`)
            console.log(`isIndexer: ${this.#base.isIndexer}`);
            console.log(`isWriter: ${this.#base.writable}`);
            this.#swarm.on('connection', async (connection) => {
                wakeup.addStream(connection);
                this.#store.replicate(connection);

                connection.on('close', () => {

                });

                connection.on('error', (error) => { });

                connection.on('data', async data => {
                    await this.#handleIncomingEvent(data);
                })

                if (!this.#isStreaming) {
                    this.emit(EventType.READY_MSB);
                }
            });

            const channelBuffer = this.#channel
            this.#swarm.join(channelBuffer, { server: true, client: true });
            await this.#swarm.flush();
            console.log('Joined channel for peer discovery');
        }
    }

    msbListener() {
        this.on(EventType.READY_MSB, async () => {
            if (!this.#isStreaming) {
                this.#isStreaming = true;
            }
        });
    }

    async #handleAdminOperations() {
        //case if I want to ADD admin entry with bootstrap key to become admin
        const adminEntry = await this.getSigned(EntryType.ADMIN);
        const addAdminMessage = MsgUtils.assembleAdminMessage(adminEntry, this.#writingKey, this.#wallet, this.#bootstrap);
        if (!adminEntry && this.#wallet && this.#writingKey && this.#writingKey === this.#bootstrap) {
            await this.#base.append(addAdminMessage);
        } else if (adminEntry && adminEntry.tracPublicKey === this.#wallet.publicKey && this.#writingKey && this.#writingKey !== adminEntry.wk) {
            const whiteListEntry = await this.getSigned(EntryType.WHITELIST);
            let connections = [];
            if (whiteListEntry) {
                for (const conn of this.#swarm.connections) {
                    const remotePublicKeyHex = b4a.from(conn.remotePublicKey).toString('hex');
                    const remotePublicKeyEntry = await this.getSigned(remotePublicKeyHex);

                    if (conn.connected &&
                        whiteListEntry.includes(remotePublicKeyHex) &&
                        remotePublicKeyEntry &&
                        remotePublicKeyEntry.isWriter === true &&
                        remotePublicKeyEntry.isIndexer === false &&
                        remotePublicKeyHex !== this.#wallet.publicKey) {
                        connections.push(conn);
                    }
                }
            }
            if (connections.length > 0) {
                connections[Math.floor(Math.random() * connections.length)].write(JSON.stringify(addAdminMessage));
            }
            //TODO: Implement an algorithm to search a new writer and connect/send the request for it. 
        }

        setTimeout(async () => {
            const updatedAdminEntry = await this.getSigned(EntryType.ADMIN);
            if (this.#isAdmin(updatedAdminEntry) && !this.#shouldListenToAdminEvents) {
                this.#shouldListenToAdminEvents = true;
                this.#adminEventListener();
            }
        }, LISTENER_TIMEOUT);

    }

    async #handleWhitelistOperations() {
        const adminEntry = await this.getSigned(EntryType.ADMIN);
        if (!this.#isAdmin(adminEntry)) return;

        const assembledWhitelistMessages = await MsgUtils.assembleWhitelistMessages(adminEntry, this.#wallet);

        if (!assembledWhitelistMessages) {
            console.log('Whitelist message not sent.');
            return;
        }

        const totalChunks = assembledWhitelistMessages.length;

        for (let i = 0; i < totalChunks; i++) {
            const message = assembledWhitelistMessages[i];
            await this.#base.append({
                type: OperationType.APPEND_WHITELIST,
                key: EntryType.WHITELIST,
                value: message
            });
            console.log(`Whitelist message sent (chunk ${(i + 1)}/${totalChunks})`);
            await sleep(WHITELIST_SLEEP_INTERVAL);
        }
    }

    async generateTx(bootstrap, msb_bootstrap, validator_writer_key, local_writer_key, local_public_key, content_hash, nonce){
        let tx = bootstrap + '-' +
            msb_bootstrap + '-' +
            validator_writer_key + '-' +
            local_writer_key + '-' +
            local_public_key + '-' +
            content_hash + '-' +
            nonce;
        return await this.createHash('sha256', await this.createHash('sha256', tx));
    }

    
    async #requestWriterRole(toAdd) {
        const adminEntry = await this.getSigned(EntryType.ADMIN);
        const nodeEntry = await this.getSigned(this.#wallet.publicKey);
        const whitelistEntry = await this.getSigned(EntryType.WHITELIST);
        if (toAdd) {
            const canAddWriter = !this.#base.writable && (!nodeEntry || !nodeEntry.isWriter) && this.#amIWhitelisted(whitelistEntry, adminEntry);

            if (canAddWriter) {
                const assembledAddWriterMessage = MsgUtils.assembleAddWriterMessage(this.#wallet, this.#writingKey);
                this.#sendMessageToAdmin(adminEntry, assembledAddWriterMessage);
            }
        }
        else {
            const canRemoveWriter = nodeEntry && nodeEntry.isWriter
            if (canRemoveWriter) {
                const assembledRemoveWriterMessage = MsgUtils.assembleRemoveWriterMessage(this.#wallet, this.#writingKey);
                this.#sendMessageToAdmin(adminEntry, assembledRemoveWriterMessage);
            }
        }
    }

    async #updateIndexerRole(tracPublicKey, toAdd) {
        const adminEntry = await this.getSigned(EntryType.ADMIN);
        if (!this.#isAdmin(adminEntry) && !this.#base.writable) return;

        const whitelistEntry = await this.getSigned(EntryType.WHITELIST);
        if (!whitelistEntry && !Array.isArray(whitelistEntry) && !whitelistEntry.includes(tracPublicKey)) return;

        const nodeEntry = await this.getSigned(tracPublicKey);
        if (!nodeEntry || !nodeEntry.isWriter) return;

        if (toAdd) {
            const canAddIndexer = toAdd && !nodeEntry.isIndexer && whitelistEntry.length < 5;
            if (canAddIndexer) {
                const assembledAddIndexerMessage = MsgUtils.assembleAddIndexerMessage(this.#wallet, tracPublicKey);
                await this.#base.append(assembledAddIndexerMessage);
            }
        } else {
            const canRemoveIndexer = !toAdd && nodeEntry.isIndexer && whitelistEntry.length > 1;
            if (canRemoveIndexer) {
                const assembledRemoveIndexer = MsgUtils.assembleRemoveIndexerMessage(this.#wallet, tracPublicKey);
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
                case '/con':
                    console.log("MY PUB KEY IS: ", this.#wallet.publicKey);
                    this.#swarm.connections.forEach((conn) => {
                        console.log(`connection = ${JSON.stringify(conn)}`)
                    });
                    break;
                case '/test':
                    this.#base.append({ type: Math.random().toString(), key: 'test' });
                    break;
                case '/add_admin':
                    await this.#handleAdminOperations();
                    break;
                case '/add_whitelist':
                    await this.#handleWhitelistOperations();
                    break;
                case '/add_writer':
                    await this.#handleAddWriterOperation();
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
                    // Only for DEBUG
                    const admin = await this.getSigned(EntryType.ADMIN);
                    console.log('Admin:', admin);
                    const whitelistEntry = await this.getSigned(EntryType.WHITELIST);
                    console.log('Whitelist:', whitelistEntry);
                    const indexers = await this.getSigned(EntryType.INDEXERS);
                    console.log('Indexers:', indexers);
                    break;
                case '/dag':
                    await verifyDag(this.#base);
                    break;
                default:
                    if (input.startsWith('/get_node_info')) {
                        const splitted = input.split(' ');
                        await this.getSigned(splitted[1])
                        console.log(await this.getSigned(splitted[1]))
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
