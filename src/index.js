/** @typedef {import('pear-interface')} */ /* global Pear */
import Autobase from 'autobase';
import Hyperswarm from 'hyperswarm';
import ReadyResource from 'ready-resource';
import b4a from 'b4a';
import Hyperbee from 'hyperbee';
import readline from 'readline';
import hccrypto from 'hypercore-crypto';
import { sanitizeTransaction, addWriter } from './functions.js';
import w from 'protomux-wakeup';
import PeerWallet from "trac-wallet"
import Corestore from 'corestore';
import tty from 'tty';
import sodium from 'sodium-native';

import WriterManager from './writerManager.js';
import { createHash } from 'crypto';
// CHANGE NONCE.
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
                            const tracPublicKey = Buffer.from(op.value.tracPublicKey, 'hex');
                            const nonce = Buffer.from(op.value.nonce);
                            
                            if (this.#verifyMessage(op.value.pop, tracPublicKey, [tracPublicKey, nonce])) {
                                view.put('admin', {
                                    tracPublicKey: tracPublicKey,
                                    writerKey: this.bootstrap // TODO: Maybe we should start to call it "id" as this is used to identiy a node in the network
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

                        const listEntry = await this.getSigned('list');
                        if (!listEntry) {
                            //TODO sanitize this string to avoid heavy calculations
                            const pubKeys = JSON.parse(op.value.pubKeysList); // As all pubkeys are 32 bytes, we can check the string.len instead of parsing it first
                            if (pubKeys.length > MAX_PUBKEYS_LENGTH) {
                                continue;
                            }

                            // TODO: This seems unnecessary since we do exactly the same thing inside #verifyMessage
                            const adminPublicKey = Buffer.from(adminEntry.tracPublicKey.data)
                            const nonce =  Buffer.from(op.value.nonce);
                            const bufferPubKeys = Buffer.from(pubKeys.join(''), 'hex');
                            
                            if(this.#verifyMessage(op.value.sig, adminPublicKey, [bufferPubKeys, nonce])) {
                                // TODO: Implement a hashmap structure to store public keys. Storing it as a vector is not efficient.
                                //       We might need to implement a new class for having a solution more tailored to our needs
                                view.put('list', pubKeys);
                            }
                        }
                    }
                    else if (op.type === 'addWriter') {
                        //const writerKey = b4a.from(op.key, 'hex');
                        //await base.addWriter(writerKey);
                        console.log(`Writer added: ${op.key}`);
                    } else if (op.type === 'addWriter2') {
                        const writerKey = b4a.from(op.key, 'hex');
                        await base.addWriter(writerKey, { isIndexer: false });
                        console.log(`Writer added: ${op.key} non-indexer`);
                    }
                }

                await batch.flush();
                await batch.close();
            }
        })
        this.base.on('warning', (e) => console.log(e))
    }

    #isAdmin(adminEntry, node) {
        return adminEntry && adminEntry.writerKey === Buffer.from(node.from.key).toString('hex');
    }

    #verifyMessage(signature, publicKey, messageElements) {
        const bufferPublicKey = Buffer.from(publicKey);
        const bufferMessage = Buffer.concat(messageElements);
        const hash = createHash('sha256').update(bufferMessage).digest('hex');

        return this.wallet.verify(signature, hash, bufferPublicKey);
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
        this.writerManager = new WriterManager(this);
        if (this.enable_updater) {
            this.updater();
        }
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
                    console.log(e)
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
            await this.sleep(10);
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
            console.log(`Writer key: ${this.writingKey}`)
            console.log(`isIndexer: ${this.base.isIndexer}`);
            this.swarm.on('connection', async (connection, peerInfo) => {

                wakeup.addStream(connection);
                this.store.replicate(connection);


                connection.on('close', () => {

                });

                connection.on('error', (error) => { });

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
            console.log(`writerKey: ${this.writingKey}`);
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
        console.log('- /add_writer: enter a peer writer key as argument to get included as writer.');
        console.log('- /add_writer2: enter a peer writer key as argument to get included as non-indexing writer.');
        console.log('- /dag: check system properties such as writer key, DAG, etc.');
        console.log('- /exit: Exit the program');

        rl.on('line', async (input) => {
            switch (input) {
                case '/dag':
                    await this.verifyDag();
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
                    this.writerManager.addAdmin();
                    //case if I want to CHANGE admin entry with Trac Public key to become admin (writer + indexer)
                    break;
                case '/add_whitelist':
                    this.writerManager.appendToWhitelist();
                    break;
                case '/show':
                    const admin = await this.getSigned('admin');
                    console.log('List:', admin);
                    const list = await this.getSigned('list');
                    console.log('List:', list);
                    break;
                default:
                    if (input.startsWith('/add_writer')) {
                        await addWriter(input, this);
                    }
            }
            rl.prompt();
        });

        rl.prompt();
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
}

function noop() { }
export default MainSettlementBus;
