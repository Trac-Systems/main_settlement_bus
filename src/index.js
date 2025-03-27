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
import MsbManager from './writerManager.js'; //TODO: CHANGE FILE NAME
import { createHash } from 'crypto';
//TODO: CHANGE NONCE.
//TODO FIX PROBLEM WITH REPLICATION.

const wakeup = new w();
const MAX_PUBKEYS_LENGTH = 100;
export class MainSettlementBus extends ReadyResource {

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
        this.isWorkingWriterEventListener = false; // TODO: DECIDE IF THIS FLAG WILL BE USEFUL IN THE FUTURE;

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
                    if (op.type === 'tx') {
                        if (postTx.op === 'post-tx' &&
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
                    } else if (op.type === 'addAdmin') {
                        const adminEntry = await this.getSigned('admin');
                        // first case if admin entry doesn't exist yet and we have to autorize Admin public key only with bootstrap writing key
                        if (!adminEntry && node.from.key.toString('hex') === this.bootstrap) {

                            if (this.#verifyMessage(op.value.pop, op.value.tracPublicKey, MsbManager.createMessage(op.value.tracPublicKey, op.value.nonce, op.type))) {
                                await view.put('admin', {
                                    tracPublicKey: op.value.tracPublicKey,
                                    writingKey: this.bootstrap // TODO: Maybe we should start to call it "id" as this is used to identiy a node in the network
                                })
                            }
                        }
                    }
                    else if (op.type === 'whitelist') {
                        // TODO: - change list to hashmap (Map() in js)
                        // - make a decision how will we append pubKeys into hashmap.

                        const adminEntry = await this.getSigned('admin');
                        if (!this.#isAdmin(adminEntry, node)) {
                            continue;
                        }
                        
                        const pubKeys = JSON.parse(op.value.pubKeysList); // As all pubkeys are 32 bytes, we can check the string.len instead of parsing it first
                        
                        if (this.#verifyMessage(op.value.sig, adminEntry.tracPublicKey, MsbManager.createMessage(pubKeys.join(''), op.value.nonce, op.type))) {
                            if (pubKeys.length > MAX_PUBKEYS_LENGTH) {
                                continue;
                            }

                            const listEntry = await this.getSigned('list');

                            if (!listEntry) {
                                // TODO: Implement a hashmap structure to store public keys. Storing it as a vector is not efficient.
                                //       We might need to implement a new class for having a solution more tailored to our needs
                                await view.put('list', pubKeys);
                            }
                            else {
                                // TODO: In this case we should include items in the list (in the future it will be a hashmap). Doing this with a vector is VERY inefficient
                                pubKeys.forEach((key) => {
                                    if (!listEntry.includes(key)) {
                                        listEntry.push(key);
                                    }
                                });

                                await view.put('list', listEntry);
                            }
                        }
                    }
                    else if (op.type === 'addWriter') {
                        const adminEntry = await this.getSigned('admin');
                        const listEntry = await this.getSigned('list');

                        if (!this.#isAdmin(adminEntry, node) || !listEntry || !Array.from(listEntry).includes(op.key)){
                            continue;
                        }

                        if (this.#verifyMessage(op.value.sig, op.key, MsbManager.createMessage(op.key, op.value.wk, op.value.nonce, op.type))) {
                            const nodeEntry = await this.getSigned(op.key);
                            if (nodeEntry === null || !nodeEntry.isWriter){
                                await base.addWriter(Buffer.from(op.value.wk, 'hex'), { isIndexer: false })
                                await view.put(op.key, {
                                    wk: op.value.wk,
                                    isWriter: true,
                                    isIndexer: false
                                });
                                console.log(`Writer added: ${op.key}:${op.value.wk}`);
                            }
                        }
                        //todo implement removeWriter https://github.com/Trac-Systems/main_settlement_bus/blob/implement-wallet/src/index.js#L58
                    } 
                    else  if (op.type === 'removeWriter') {
                        const adminEntry = await this.getSigned('admin');
                        const listEntry = await this.getSigned('list');
                        if (!this.#isAdmin(adminEntry, node) || !listEntry || !Array.from(listEntry).includes(op.key)){
                            continue;
                        }
                        if (this.#verifyMessage(op.value.sig, op.key, MsbManager.createMessage(op.key, op.value.wk ,op.value.nonce, op.type))) {
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
                    } else if (op.type === 'addWriter2') {
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

        await this.setUpRoleAutomatically();

        if (this.enable_updater) {
            this.updater();
        }

        console.log(`isIndexer: ${this.base.isIndexer}`);
        console.log(`isWriter: ${this.base.writable}`);
        console.log('View Length:', this.base.view.core.length);
        console.log('View Signed Length:', this.base.view.core.signedLength);
    }
    async setUpRoleAutomatically() {

        const adminEntry = await this.getSigned('admin');
        if (this.#isAdmin(adminEntry)) {
            this.writerEventListener();
            this.isWorkingWriterEventListener = true;
        }
        
        const nodeEntry = await this.getSigned(this.wallet.publicKey);
        if (!this.base.writable && nodeEntry !== null && nodeEntry.isWriter === true) {

            const assembledRemoveWriterMessage = MsbManager.assembleRemoveWriterMessage(this.wallet, this.writingKey);
            this.#sendMessageToAdmin(adminEntry, assembledRemoveWriterMessage);
        }

        const listEntry = await this.getSigned('list');
        if (!this.base.writable && this.#amIWhitelisted(listEntry, adminEntry)) {
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
        if (node) return adminEntry.writingKey === Buffer.from(node.from.key).toString('hex');
        return this.wallet.publicKey === adminEntry.tracPublicKey && adminEntry.writingKey === this.writingKey;

    }

    #amIWhitelisted(listEntry, adminEntry) {
        return listEntry !== null  && listEntry.includes(this.wallet.publicKey) && !this.#isAdmin(adminEntry);
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

    async getSigned(key) {
        const view_session = this.base.view.checkout(this.base.view.core.signedLength);
        const result = await view_session.get(key);
        if (result === null) return null;
        return result.value;
    }

    async get(key) {
        const result = await this.base.view.get(key);
        if (result === null) return null;
        return result.value;
    }

    async #handleIncomingWriterEvent(data) {
        try {
            const bufferData = data.toString();
            const parsedRequest = JSON.parse(bufferData);
            if (parsedRequest.type === 'addWriter' || parsedRequest.type === 'removeWriter') {
                this.emit('writerEvent', parsedRequest);
            }
        } catch (error) {
            // for now ignore the error
        }
    }
    
    async writerEventListener() {
        this.on('writerEvent', async (parsedRequest) => {
            const listEntry = await this.getSigned('list')
            if (Array.from(listEntry).includes(parsedRequest.key) && MsbManager.verifyAddOrRemoveWriterMessage(parsedRequest, this.wallet)) {
                await this.base.append(parsedRequest);
            }
        });
    }

    async txChannel() {
        this.tx_swarm = new Hyperswarm();
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
                keyPair = await this.store.createKeyPair('TracNetwork');
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
                    await this.#handleIncomingWriterEvent(data);
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
                    const adminEntry = await this.getSigned('admin');
                    const addAdminMessage = MsbManager.assembleAdminMessage(adminEntry, this.writingKey, this.wallet, this.bootstrap);
                    await this.base.append(addAdminMessage);

                    setTimeout(async () => {
                        const updatedAdminEntry = await this.getSigned('admin');
                        if (this.#isAdmin(updatedAdminEntry) && !this.isWorkingWriterEventListener) {
                            this.writerEventListener();
                            this.isWorkingWriterEventListener = true;
                            console.log(`Admin has been added successfully.`);
                        } else {
                            console.warn(`Admin has NOT been added.`);
                        }

                    }, 5000);

                    //case if I want to CHANGE admin entry with Trac Public key to become admin (writer + indexer)
                    break;
                case '/add_whitelist':
                    const adminEntry2 = await this.getSigned('admin');
                    const addWhitelistMessage = MsbManager.assembleWhiteListMessage(adminEntry2, this.wallet);
                    await this.base.append(addWhitelistMessage);
                    break;
                case '/show':
                    const admin = await this.getSigned('admin');
                    console.log('Admin:', admin);
                    const list = await this.getSigned('list');
                    console.log('List:', list);
                    break;
                case '/add_writer':
                    //TODO: Consider the cases when this command can be executed. THIS IS NOT TESTED. Not sure if this is implemented well

                      
                    const adminEntry3 = await this.getSigned('admin');
                    const nodeEntry = await this.getSigned(this.wallet.publicKey);
                    const listEntry = await this.getSigned('list');

                    if (!this.base.writable &&  ((nodeEntry === null) || nodeEntry.isWriter === false)  && this.#amIWhitelisted(listEntry, adminEntry3)) {
                        const assembledAddWriterMessage = MsbManager.assembleAddWriterMessage(this.wallet, this.writingKey);
                        this.#sendMessageToAdmin(adminEntry3, assembledAddWriterMessage);
                    }
                    break;
                case '/remove_writer':
                    //TODO: Consider the cases when this command can be executed. THIS IS NOT TESTED. Not sure if this is implemented well
                    const nodeEntry2 = await this.getSigned(this.wallet.publicKey);
                    const listEntry2 = await this.getSigned('list');
                    const adminEntry4 = await this.getSigned('admin');

                    if (this.base.writable &&(nodeEntry2 && nodeEntry2.isWriter) &&this.#amIWhitelisted(listEntry2, adminEntry4)) {
                        const assembledRemoveWriterMessage = MsbManager.assembleRemoveWriterMessage(this.wallet, this.writingKey);
                        this.#sendMessageToAdmin(adminEntry4, assembledRemoveWriterMessage);
                    }
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
