/** @typedef {import('pear-interface')} */ /* global Pear */
import Autobase from 'autobase';
import Hyperswarm from 'hyperswarm';
import ReadyResource from 'ready-resource';
import b4a from 'b4a';
import Hyperbee from 'hyperbee';
import readline from 'readline';
import hccrypto from 'hypercore-crypto';
import { sanitizeTransaction, verifyDag, sleep } from './functions.js';
import w from 'protomux-wakeup';
import PeerWallet from "trac-wallet"
import Corestore from 'corestore';
import tty from 'tty';
import sodium from 'sodium-native';
import MsbManager from './msbManager.js';
import { createHash } from 'crypto';
import { MAX_PUBKEYS_LENGTH, LISTENER_TIMEOUT, EntryType, OperationType, EventType, TracNamespace } from './constants.js';
//TODO: CHANGE NONCE.
//TODO FIX PROBLEM WITH REPLICATION.

const wakeup = new w();

export class MainSettlementBus extends ReadyResource {
    #shouldListenToAdminEvents = false;
    #shouldListenToWriterEvents = false;

    constructor(options = {}) {
        super();
        this.STORES_DIRECTORY = options.stores_directory;
        this.KEY_PAIR_PATH = `${this.STORES_DIRECTORY}${options.store_name}/db/keypair.json`
        this.store = new Corestore(this.STORES_DIRECTORY + options.store_name);
        this.swarm = null;
        this.tx = b4a.alloc(32).fill(options.tx) || null;
        this.tx_pool = [];
        this.enable_txchannel = typeof options.enable_txchannel !== "undefined" && options.enable_txchannel === false ? false : true;
        this.enable_wallet = typeof options.enable_wallet !== "undefined" && options.enable_wallet === false ? false : true;
        this.enable_updater = typeof options.enable_updater !== "undefined" && options.enable_updater === false ? false : true;
        this.base = null;
        this.key = null;
        this.channel = b4a.alloc(32).fill(options.channel) || null;
        this.replicate = options.replicate !== false;
        this.writingKey = null;
        this.isStreaming = false;
        this.bootstrap = options.bootstrap || null;
        this.opts = options;
        this.bee = null;
        this.wallet = new PeerWallet(options);
        this.pool();
        this.msbListener();
        this._boot();
        this.ready().catch(noop);
    }

    _boot() {
        const _this = this;
        this.base = new Autobase(this.store, this.bootstrap, {
            valueEncoding: 'json',
            ackInterval: 1000,
            open(store) {
                _this.bee = new Hyperbee(store.get('view'), {
                    extension: false,
                    keyEncoding: 'utf-8',
                    valueEncoding: 'json'
                })
                return _this.bee;
            },
            apply: async (nodes, view, base) => {

                const batch = view.batch();

                for (const node of nodes) {

                    const op = node.value;
                    const postTx = op.value;
                    if (op.type === OperationType.TX) {
                        if (postTx.op === OperationType.POST_TX &&
                            null === await batch.get(op.key) &&
                            sanitizeTransaction(postTx) &&
                            hccrypto.verify(b4a.from(postTx.tx + postTx.in, 'utf-8'), b4a.from(postTx.is, 'hex'), b4a.from(postTx.ipk, 'hex')) &&
                            hccrypto.verify(b4a.from(postTx.tx + postTx.wn, 'utf-8'), b4a.from(postTx.ws, 'hex'), b4a.from(postTx.wp, 'hex')) &&
                            postTx.tx === await _this.generateTx(postTx.bs, this.bootstrap, postTx.w, postTx.i, postTx.ipk, postTx.ch, postTx.in) &&
                            b4a.byteLength(JSON.stringify(postTx)) <= 4096
                        ) {
                            await batch.put(op.key, op.value);
                            console.log(`TX: ${op.key} appended. Signed length: `,  _this.base.view.core.signedLength);
                        }
                    }
                    else if (op.type === OperationType.ADD_ADMIN) {
                        console.log('Adding admin entry...');
                        const adminEntry = await this.getSigned(EntryType.ADMIN);
                        // first case if admin entry doesn't exist yet and we have to autorize Admin public key only with bootstrap writing key
                        if (!adminEntry && node.from.key.toString('hex') === this.bootstrap && op.value.wk === this.bootstrap) {

                            if (this.#verifyMessage(op.value.sig, op.value.tracPublicKey, MsbManager.createMessage(op.value.tracPublicKey, op.value.wk, op.value.nonce, op.type))) {
                                await view.put(EntryType.ADMIN, {
                                    tracPublicKey: op.value.tracPublicKey,
                                    wk: this.bootstrap // TODO: Maybe we should start to call it "id" as this is used to identiy a node in the network
                                })
                                console.log(`Admin added: ${op.value.tracPublicKey}:${this.bootstrap}`);
                            }
                        } else if (adminEntry && adminEntry.tracPublicKey === op.value.tracPublicKey) {
                            // second case if admin entry exists and we have to autorize Admin public key only with bootstrap writing key
                            if (this.#verifyMessage(op.value.sig, adminEntry.tracPublicKey, MsbManager.createMessage(adminEntry.tracPublicKey, op.value.wk, op.value.nonce, op.type))) {
                                await base.removeWriter(Buffer.from(adminEntry.wk, 'hex'));
                                await base.addWriter(Buffer.from(op.value.wk, 'hex'), { indexer: true })
                                await view.put(EntryType.ADMIN, {
                                    tracPublicKey: adminEntry.tracPublicKey,
                                    wk: op.value.wk
                                })
                                console.log(`Admin updated: ${adminEntry.tracPublicKey}:${op.value.wk}`);
                            }
                        }
                    }
                    else if (op.type === OperationType.APPEND_WHITELIST) {
                        // TODO: - change list to hashmap (Map() in js)
                        // - make a decision how will we append pubKeys into hashmap.

                        const adminEntry = await this.getSigned(EntryType.ADMIN);
                        if (!this.#isAdmin(adminEntry, node)) {
                            continue;
                        }

                        const pubKeys = JSON.parse(op.value.pubKeysList); // As all pubkeys are 32 bytes, we can check the string.len instead of parsing it first

                        if (this.#verifyMessage(op.value.sig, adminEntry.tracPublicKey, MsbManager.createMessage(pubKeys.join(''), op.value.nonce, op.type))) {

                            if (pubKeys.length > MAX_PUBKEYS_LENGTH) {
                                continue;
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
                    else if (op.type === OperationType.ADD_WRITER) {
                        const adminEntry = await this.getSigned(EntryType.ADMIN);
                        const whitelistEntry = await this.getSigned(EntryType.WHITELIST);

                        if (!this.#isAdmin(adminEntry, node) || !whitelistEntry || !Array.from(whitelistEntry).includes(op.key)) {
                            continue;
                        }

                        if (this.#verifyMessage(op.value.sig, op.key, MsbManager.createMessage(op.key, op.value.wk, op.value.nonce, op.type))) {
                            const nodeEntry = await this.getSigned(op.key);
                            if (nodeEntry === null || !nodeEntry.isWriter) {
                                await base.addWriter(Buffer.from(op.value.wk, 'hex'), { isIndexer: false })
                                await view.put(op.key, {
                                    wk: op.value.wk,
                                    isWriter: true,
                                    isIndexer: false
                                });
                                console.log(`Writer added: ${op.key}:${op.value.wk}`);
                            }
                        }
                    }
                    else if (op.type === OperationType.REMOVE_WRITER) {
                        const adminEntry = await this.getSigned(EntryType.ADMIN);
                        const whitelistEntry = await this.getSigned(EntryType.WHITELIST);
                        if (!this.#isAdmin(adminEntry, node) || !whitelistEntry || !Array.from(whitelistEntry).includes(op.key)) {
                            continue;
                        }
                        if (this.#verifyMessage(op.value.sig, op.key, MsbManager.createMessage(op.key, op.value.wk, op.value.nonce, op.type))) {
                            const nodeEntry = await this.getSigned(op.key)
                            if (nodeEntry !== null && nodeEntry.isWriter === true) {
                                await base.removeWriter(Buffer.from(nodeEntry.wk, 'hex'));
                                nodeEntry.isWriter = false;

                                if (nodeEntry.isIndexer === true) {
                                    nodeEntry.isIndexer = false;
                                }
                                await view.put(op.key, nodeEntry);
                                console.log(`Writer removed: ${op.value.wk}`);
                            }
                        }
                    }
                    else if (op.type === 'addWriter2') {
                        const writingKey = b4a.from(op.key, 'hex');
                        await base.addWriter(writingKey, { isIndexer: false });
                        console.log(`Writer added: ${op.key} non-indexer`);
                    }
                }

                await batch.flush();
                await batch.close();
            }
        })
        this.base.on('warning', (e) => console.log(e))
    }

    async _open() {
        await this.base.ready();
        if (this.enable_wallet) {
            await this.wallet.initKeyPair(this.KEY_PAIR_PATH);
        }
        console.log('View Length:', this.base.view.core.length);
        console.log('View Signed Length:', this.base.view.core.signedLength);
        console.log('MSB Key:', Buffer(this.base.view.core.key).toString('hex'));

        this.writingKey = b4a.toString(this.base.local.key, 'hex');
        if (this.replicate) await this._replicate();
        if (this.enable_txchannel) {
            await this.txChannel();
        }

        const adminEntry = await this.getSigned(EntryType.ADMIN);
        if (this.#isAdmin(adminEntry)) {
            this.#shouldListenToAdminEvents = true;
            this.#adminEventListener(); // only for admin
        } else if (!this.#isAdmin(adminEntry) && this.base.writable && !this.base.isIndexer) {
            this.#shouldListenToWriterEvents = true;
            this.#writerEventListener(); // only for writers
        }

        await this.#setUpRoleAutomatically(adminEntry);

        if (this.enable_updater) {
            this.updater();
        }

        console.log(`isIndexer: ${this.base.isIndexer}`);
        console.log(`isWriter: ${this.base.writable}`);
        console.log('View Length:', this.base.view.core.length);
        console.log('View Signed Length:', this.base.view.core.signedLength);
    }

    async #setUpRoleAutomatically(adminEntry = null) {
        if (adminEntry === null) {
            adminEntry = await this.getSigned(EntryType.ADMIN);
        }

        const nodeEntry = await this.getSigned(this.wallet.publicKey);
        if (!this.base.writable && nodeEntry !== null && nodeEntry.isWriter === true) {

            const assembledRemoveWriterMessage = MsbManager.assembleRemoveWriterMessage(this.wallet, this.writingKey);
            this.#sendMessageToAdmin(adminEntry, assembledRemoveWriterMessage);
        }

        const whitelistEntry = await this.getSigned(EntryType.WHITELIST);
        if (!this.base.writable && this.#amIWhitelisted(whitelistEntry, adminEntry)) {
            const assembledAddWriterMessage = MsbManager.assembleAddWriterMessage(this.wallet, this.writingKey);
            this.#sendMessageToAdmin(adminEntry, assembledAddWriterMessage);
        }

    }

    #sendMessageToAdmin(adminEntry, message) {
        if (!adminEntry || !message) {
            return;
        }
        this.swarm.connections.forEach((conn) => {
            if (Buffer.from(conn.remotePublicKey).toString('hex') === adminEntry.tracPublicKey && conn.connected) {
                conn.write(JSON.stringify(message));
            }
        });
    }

    #verifyMessage(signature, publicKey, bufferMessage) {
        const bufferPublicKey = Buffer.from(publicKey, 'hex');
        const hash = createHash('sha256').update(bufferMessage).digest('hex');
        return this.wallet.verify(signature, hash, bufferPublicKey);
    }

    #isAdmin(adminEntry, node = null) {
        if (!adminEntry) return false;
        if (node) return adminEntry.wk === Buffer.from(node.from.key).toString('hex');
        return this.wallet.publicKey === adminEntry.tracPublicKey && adminEntry.wk === this.writingKey;

    }

    #amIWhitelisted(whitelistEntry, adminEntry) {
        return whitelistEntry !== null && whitelistEntry.includes(this.wallet.publicKey) && !this.#isAdmin(adminEntry);
    }

    async close() {
        if (this.swarm) {
            await this.swarm.destroy();
        }
        await this.base.close();
    }

    async updater(){
        while(true){
            if(this.base.writable){
                await this.base.append(null);
            }
            await this.sleep(10_000);
        }
    }

    async get(key) {
        const result = await this.base.view.get(key);
        if (result === null) return null;
        return result.value;
    }

    async getSigned(key) {
        const view_session = this.base.view.checkout(this.base.view.core.signedLength);
        const result = await view_session.get(key);
        if (result === null) return null;
        return result.value;
    }

    async #handleIncomingEvent(data) {
        try {
            const bufferData = data.toString();
            const parsedRequest = JSON.parse(bufferData);
            if (parsedRequest.type === OperationType.ADD_WRITER || parsedRequest.type === OperationType.REMOVE_WRITER) {
                //This request must be hanlded by ADMIN 
                this.emit(EventType.ADMIN_EVENT, parsedRequest);
            } else if (parsedRequest.type === OperationType.ADMIN) {
                //This request must be handled by WRITER
                this.emit(EventType.WRITER_EVENT, parsedRequest);
            }
        } catch (error) {
            // for now ignore the error
        }
    }

    async #adminEventListener() {
        this.on(EventType.ADMIN_EVENT, async (parsedRequest) => {
            const whitelistEntry = await this.getSigned(EntryType.WHITELIST)
            if (Array.from(whitelistEntry).includes(parsedRequest.key) && MsbManager.verifyEventMessage(parsedRequest, this.wallet)) {
                await this.base.append(parsedRequest);
            }
        });
    }

    async #writerEventListener() {
        this.on(EventType.WRITER_EVENT, async (parsedRequest) => {
            const adminEntry = await this.getSigned(EntryType.ADMIN);
            if (adminEntry && adminEntry.tracPublicKey === parsedRequest.value.tracPublicKey && MsbManager.verifyEventMessage(parsedRequest, this.wallet)) {
                await this.base.append(parsedRequest);
            }
        });
    }

    async txChannel() {
        this.tx_swarm = new Hyperswarm({ maxPeers: 1024, maxParallel: 512, maxServerConnections: 256 });
        this.tx_swarm.on('connection', async (connection, peerInfo) => {
            const _this = this;

            connection.on('close', () => {
            });

            connection.on('error', (error) => { });

            connection.on('data', async (msg) => {

                if (_this.base.isIndexer) return;

                // TODO: decide if a tx rejection should be responded with
                if (_this.tx_pool.length >= 1000) {
                    console.log('pool full');
                    return
                }

                if(b4a.byteLength(msg) > 3072) return;

                try {

                    const parsedPreTx = JSON.parse(msg);

                    if (sanitizeTransaction(parsedPreTx) &&
                        parsedPreTx.op === 'pre-tx' &&
                        hccrypto.verify(b4a.from(parsedPreTx.tx + parsedPreTx.in, 'utf-8'), b4a.from(parsedPreTx.is, 'hex'), b4a.from(parsedPreTx.ipk, 'hex')) &&
                        parsedPreTx.w === _this.writerLocalKey &&
                        null === await _this.base.view.get(parsedPreTx.tx)
                    ) {
                        const nonce = Math.random() + '-' + Date.now();
                        const signature = hccrypto.sign(b4a.from(parsedPreTx.tx + nonce, 'utf-8'), b4a.from(this.wallet.secretKey, 'hex'));
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
                            wp: this.wallet.publicKey,
                            wn : nonce
                        };
                        _this.tx_pool.push({ tx: parsedPreTx.tx, append_tx: append_tx });
                    }
                } catch (e) {
                    //console.log(e)
                }
            });
        });

        const channelBuffer = this.tx;
        this.tx_swarm.join(channelBuffer, { server: true, client: true });
        await this.tx_swarm.flush();
        console.log('Joined MSB TX channel');
    }

    async pool() {
        while (true) {
            if (this.tx_pool.length > 0) {
                const length = this.tx_pool.length;
                const batch = [];
                for(let i = 0; i < length; i++){
                    if(i >= 100) break;
                    batch.push({ type: 'tx', key: this.tx_pool[i].tx, value: this.tx_pool[i].append_tx });
                }
                await this.base.append(batch);
                this.tx_pool.splice(0, batch.length);
            }
            await sleep(10);
        }
    }

    async _replicate() {
        if (!this.swarm) {
            let keyPair;
            if (!this.enable_wallet) {
                keyPair = await this.store.createKeyPair(TracNamespace);
            }

            keyPair = {
                publicKey: Buffer.from(this.wallet.publicKey, 'hex'),
                secretKey: Buffer.from(this.wallet.secretKey, 'hex')
            };

            this.swarm = new Hyperswarm({ keyPair, maxPeers: 1024, maxParallel: 512, maxServerConnections: 256 });

            console.log(`Channel: ${this.channel}`);
            console.log(`Writing key: ${this.writingKey}`)
            console.log(`isIndexer: ${this.base.isIndexer}`);
            console.log(`isWriter: ${this.base.writable}`);
            this.swarm.on('connection', async (connection) => {
                wakeup.addStream(connection);
                this.store.replicate(connection);

                connection.on('close', () => {

                });

                connection.on('error', (error) => { });

                connection.on('data', async data => {
                    await this.#handleIncomingEvent(data);
                })

                if (!this.isStreaming) {
                    this.emit('readyMsb');
                }
            });

            const channelBuffer = this.channel
            this.swarm.join(channelBuffer, { server: true, client: true });
            await this.swarm.flush();
            console.log('Joined channel for peer discovery');
        }
    }

    msbListener() {
        this.on('readyMsb', async () => {
            if (!this.isStreaming) {
                this.isStreaming = true;
            }
        });
    }

    async createHash(type, message){
        if(type === 'sha256'){
            const out = b4a.alloc(sodium.crypto_hash_sha256_BYTES);
            sodium.crypto_hash_sha256(out, b4a.from(message));
            return b4a.toString(out, 'hex');
        }
        let createHash = null;
        if(global.Pear !== undefined){
            let _type = '';
            switch(type.toLowerCase()){
                case 'sha1': _type = 'SHA-1'; break;
                case 'sha384': _type = 'SHA-384'; break;
                case 'sha512': _type = 'SHA-512'; break;
                default: throw new Error('Unsupported algorithm.');
            }
            const encoder = new TextEncoder();
            const data = encoder.encode(message);
            const hash = await crypto.subtle.digest(_type, data);
            const hashArray = Array.from(new Uint8Array(hash));
            return hashArray
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
        } else {
            return crypto.createHash(type).update(message).digest('hex')
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

    async verifyDag() {
        try {
            console.log('--- DAG Monitoring ---');
            const dagView = await this.base.view.core.treeHash();
            const lengthdagView = this.base.view.core.length;
            const dagSystem = await this.base.system.core.treeHash();
            const lengthdagSystem = this.base.system.core.length;
            console.log('this.base.view.core.signedLength:', this.base.view.core.signedLength);
            console.log("this.base.signedLength", this.base.signedLength);
            console.log("this.base.linearizer.indexers.length", this.base.linearizer.indexers.length);
            console.log("this.base.indexedLength", this.base.indexedLength);
            //console.log("this.base.system.core", this.base.system.core);
            console.log(`writingKey: ${this.writingKey}`);
            console.log(`base.key: ${this.base.key.toString('hex')}`);
            console.log('discoveryKey:', b4a.toString(this.base.discoveryKey, 'hex'));

            console.log(`VIEW Dag: ${dagView.toString('hex')} (length: ${lengthdagView})`);
            console.log(`SYSTEM Dag: ${dagSystem.toString('hex')} (length: ${lengthdagSystem})`);

        } catch (error) {
            console.error('Error during DAG monitoring:', error.message);
        }
    }

    async interactiveMode() {
        const rl = readline.createInterface({
            input: new tty.ReadStream(0),
            output: new tty.WriteStream(1)
        });

        console.log('MSB started. Available commands:');
        console.log('- /add_admin: register admin entry with bootstrap key.');
        console.log('- /get_node_info <trac_public_key>: Get information about a node with the given Trac public key');
        console.log('- /dag: check system properties such as writing key, DAG, etc.');
        console.log('- /exit: Exit the program');

        rl.on('line', async (input) => {
            switch (input) {
                case '/dag':
                    await verifyDag(this.base);
                    break;
                case '/exit':
                    console.log('Exiting...');
                    rl.close();
                    await this.close();
                    typeof process !== "undefined" ? process.exit(0) : Pear.exit(0);
                    break;
                case '/con':
                    console.log("MY PUB KEY IS: ", this.wallet.publicKey);
                    this.swarm.connections.forEach((conn) => {
                        console.log(`connection = ${JSON.stringify(conn)}`)
                    });
                    break;
                case '/test':
                    this.base.append({ type: Math.random().toString(), key: 'test' });
                    break;
                case '/add_admin':
                    //case if I want to ADD admin entry with bootstrap key to become admin
                    const adminEntry = await this.getSigned(EntryType.ADMIN);
                    const addAdminMessage = MsbManager.assembleAdminMessage(adminEntry, this.writingKey, this.wallet, this.bootstrap);
                    if (!adminEntry && this.wallet && this.writingKey && this.writingKey === this.bootstrap) {
                        await this.base.append(addAdminMessage);
                    } else if (adminEntry && adminEntry.tracPublicKey === this.wallet.publicKey && this.writingKey && this.writingKey !== adminEntry.wk) {
                        const whiteListEntry = await this.getSigned(EntryType.WHITELIST);
                        let connections = [];
                        if (whiteListEntry) {
                            this.swarm.connections.forEach((conn) => {
                                const remotePublicKeyHex = Buffer.from(conn.remotePublicKey).toString('hex');
                                if (conn.connected && whiteListEntry.includes(remotePublicKeyHex)) {
                                    connections.push(conn);
                                }
                            });
                        }
                        if (connections.length > 0) {
                            connections[Math.floor(Math.random() * connections.length)].write(JSON.stringify(addAdminMessage));
                        }
                        //TODO: Implement an algorithm to search a new writer and connect/send the request for it. 

                        setTimeout(async () => {
                            const updatedAdminEntry = await this.getSigned(EntryType.ADMIN);
                            if (this.#isAdmin(updatedAdminEntry) && !this.#shouldListenToAdminEvents) {
                                this.#shouldListenToAdminEvents = true;
                                this.#adminEventListener();
                                console.log(`Admin has been added successfully.`);
                            } else {
                                console.warn(`Admin has NOT been added.`);
                            }

                        }, LISTENER_TIMEOUT);
                    }
                    break;
                case '/add_whitelist':
                    const adminEntry2 = await this.getSigned(EntryType.ADMIN);
                    const assembledWhitelistMessages = await MsbManager.assembleWhitelistMessages(adminEntry2, this.wallet);
                    for (const message of assembledWhitelistMessages) {
                        await this.base.append({
                            type: OperationType.APPEND_WHITELIST,
                            key: EntryType.WHITELIST,
                            value: message
                        });
                        sleep(1000);
                    }

                    break;
                case '/show':
                    const admin = await this.getSigned(EntryType.ADMIN);
                    console.log('Admin:', admin);
                    const whitelistEntry = await this.getSigned(EntryType.WHITELIST);
                    console.log('List:', whitelistEntry);
                    break;
                case '/add_writer':
                    //DEBUG
                    //TODO: Consider the cases when this command can be executed. THIS IS NOT TESTED. Not sure if this is implemented well
                    const adminEntry3 = await this.getSigned(EntryType.ADMIN);
                    const nodeEntry = await this.getSigned(this.wallet.publicKey);
                    const whitelistEntry2 = await this.getSigned(EntryType.WHITELIST);

                    if (!this.base.writable && ((nodeEntry === null) || nodeEntry.isWriter === false) && this.#amIWhitelisted(whitelistEntry2, adminEntry3)) {
                        const assembledAddWriterMessage = MsbManager.assembleAddWriterMessage(this.wallet, this.writingKey);
                        this.#sendMessageToAdmin(adminEntry3, assembledAddWriterMessage);
                    }
                    break;
                case '/remove_writer':
                    //DEBUG
                    //TODO: Consider the cases when this command can be executed. THIS IS NOT TESTED. Not sure if this is implemented well
                    const nodeEntry2 = await this.getSigned(this.wallet.publicKey);
                    const whitelistEntry3 = await this.getSigned(EntryType.WHITELIST);
                    const adminEntry4 = await this.getSigned(EntryType.ADMIN);

                    if (this.base.writable && (nodeEntry2 && nodeEntry2.isWriter) && this.#amIWhitelisted(whitelistEntry3, adminEntry4)) {
                        const assembledRemoveWriterMessage = MsbManager.assembleRemoveWriterMessage(this.wallet, this.writingKey);
                        this.#sendMessageToAdmin(adminEntry4, assembledRemoveWriterMessage);
                    }
                    break
                case '/flags':
                    console.log("shouldListenToAdminEvents: ", this.#shouldListenToAdminEvents);
                    console.log("shouldListenToWriterEvents: ", this.#shouldListenToWriterEvents);
                    break
                default:
                    if (input.startsWith('/get_node_info')) {
                        const splitted = input.split(' ');
                        await this.getSigned(splitted[1])
                        console.log(await this.getSigned(splitted[1]))
                    }
            }
            rl.prompt();
        });

        rl.prompt();
    }

}

function noop() { }
export default MainSettlementBus;
