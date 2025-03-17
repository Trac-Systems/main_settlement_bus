/** @typedef {import('pear-interface')} */ /* global Pear */
import Autobase from 'autobase';
import Hyperswarm from 'hyperswarm';
import ReadyResource from 'ready-resource';
import b4a from 'b4a';
import Hyperbee from 'hyperbee';
import readline from 'readline';
import crypto from 'hypercore-crypto';
import { sanitizeTransaction, addWriter, restoreManifest, sleep } from './functions.js';
import w from 'protomux-wakeup';
import Corestore from 'corestore';
import verifier from 'hypercore/lib/verifier.js';
import WriterManager from './writerManager.js';
import PeerWallet from "ed25519-key-generator"; // TODO: Decide if this should be used here directly or inputed as an option

const { manifestHash, createManifest } = verifier;

const wakeup = new w();

//TODO: How about nonce if edDSA is deterministic?
//TODO: CHECK IF TX HASH IS ALREDY IN BASE BEFORE VALIDATING IT TO DON'T OVERWRITE tx/writerPubKey. Also we need to validate this case where the 2 nodes send the same hash. 

export class MainSettlementBus extends ReadyResource {

    constructor(options = {}) {
        super();
        this.STORES_DIRECTORY = options.stores_directory;
        this.KEY_PAIR_PATH = `${this.STORES_DIRECTORY}${options.store_name}/db/keypair.json`
        this.signingKeyPair = null;
        this.store = new Corestore(this.STORES_DIRECTORY + options.store_name);
        this.swarm = null;
        this.tx = options.tx || null;
        this.tx_pool = [];
        this.enable_txchannel = typeof options.enable_txchannel !== "undefined" && options.enable_txchannel === false ? false : true;
        this.enable_wallet = typeof options.enable_wallet !== "undefined" && options.enable_wallet === false ? false : true;
        this.base = null;
        this.channel = options.channel || null;
        this.connectedNodes = 1;
        this.replicate = options.replicate !== false;
        this.writingKey = null;
        this.isStreaming = false;
        this.bootstrap = options.bootstrap || null;
        this.opts = options;
        this.bee = null;

        // TODO: Decide if this is better placed in the _open method instead of here
        if (this.enable_wallet) {
            this.wallet = new PeerWallet();
        }

        this.pool();
        this.msbListener();
        this._boot();
        this.ready().catch(noop);
    }
    
    _boot() {
        const _this = this;
        this.base = new Autobase(this.store, this.bootstrap, {
            valueEncoding: 'json',

            open(store) {
                _this.bee = new Hyperbee(store.get('view'), {
                    extension: false,
                    keyEncoding: 'utf-8',
                    valueEncoding: 'json'
                })
                _this.keysView = _this.bee.sub('pubKeys');

                return _this.bee;
            },

            apply: async (nodes, view, base) => {

                for (const node of nodes) {
                    const op = node.value;
                    const postTx = op.value;

                    if (!op || !op.type || op.key == null || op.value == null) {
                        continue;
                    }

                    // WRITING & INDEXING
                    if (op.type === 'addWriter') {
                        //TODO: it can be optimalized by adding variables to don't call Buffer.from multiple times.
                        //TODO: SANITIZE INCOMPING PROPOSAL

                        if (node.from.key.toString('hex') === this.bootstrap) {
                            const message = Buffer.concat([
                                Buffer.from(JSON.stringify(op.value.hpm)),
                                Buffer.from(op.value.wk, 'hex'),
                                Buffer.from(op.key, 'hex')
                                //TODO: ADD THE NONCE?
                            ]);

                            const pop1Valid = crypto.verify(message, Buffer.from(op.value.pop1, 'hex'), Buffer.from(op.value.hpm.signers[0].publicKey));
                            const pop2Valid = crypto.verify(message, Buffer.from(op.value.pop2, 'hex'), Buffer.from(op.key, 'hex'));
                            const restoredManifest = restoreManifest(op.value.hpm); //temporary workaround
                            // await this.base.view.get(op.key) === null
                            if (pop1Valid && pop2Valid && manifestHash(createManifest(restoredManifest)).toString('hex') === op.value.wk) {

                                const writerEntry = this.base.view.get(op.key);
                                if (writerEntry === null || !writerEntry.isValid) {
                                    await base.addWriter(b4a.from(op.value.wk, 'hex'))
                                    await view.put(op.key, {
                                        wk: op.value.wk,
                                        hpm: op.value.hpm,
                                        pop1: op.value.pop1, // TODO: observation this is really necessary to store pops? IF NOT DELETE IT!
                                        pop2: op.value.pop2,
                                        isValid: true
                                        //TODO: ADD NONCE?
                                    });
                                    console.log(`Writer added: ${op.value.wk} indexer`);

                                }
                            }
                        }

                    } else if (op.type === 'removeWriter') {
                        //TODO: it can be optimalized by adding variables to don't call Buffer.from multiple times. And other operations
                        //TODO: SANITIZE INCOMPING PROPOSAL
                        if (node.from.key.toString('hex') === this.bootstrap) {
                            const publicKey = Buffer.from(op.key, 'hex');
                            const message = Buffer.concat([
                                publicKey
                                //TODO: ADD NONCE ?
                            ]);

                            const popIsValid = crypto.verify(message, Buffer.from(op.value.pop, 'hex'), publicKey);
                            if (popIsValid) {
                                const writerEntry = await _this.base.view.get(op.key)
                                if (writerEntry !== null && writerEntry.value.isValid) {
                                    await base.removeWriter(Buffer.from(writerEntry.value.wk, 'hex'));
                                    writerEntry.value.isValid = false;
                                    await view.put(op.key, writerEntry.value);
                                    console.log(`Writer removed: ${writerEntry.value.wk} indexer`);
                                }

                            }
                        }


                    } else if (op.type === 'initBootstrap') {
                        // this operation initializes the bootstrap skp to grant this public key the owner status.
                        //TODO: ADD MORE SANITIZATION. THIS IS STILL JS.
                        //TODO: HANDLE ERRORS?
                        //TODO: it can be optimalized by adding variables to don't call Buffer.from multiple times.

                        if (node.from.key.toString('hex') === this.bootstrap) {
                            const message = Buffer.concat([
                                Buffer.from(JSON.stringify(op.value.hpm)),
                                Buffer.from(op.value.wk, 'hex'),
                                Buffer.from(op.value.skp, 'hex')
                                //here should be nonce anyway in the future - generated randomly from the huge space. 
                            ]);

                            const pop1Valid = crypto.verify(message, Buffer.from(op.value.pop1, 'hex'), Buffer.from(op.value.hpm.signers[0].publicKey));
                            const pop2Valid = crypto.verify(message, Buffer.from(op.value.pop2, 'hex'), Buffer.from(op.value.skp, 'hex'));
                            const restoredManifest = restoreManifest(op.value.hpm); //temporary workaround

                            if (pop1Valid && pop2Valid && manifestHash(createManifest(restoredManifest)).toString('hex') === this.bootstrap) {
                                await view.put(op.key, op.value);
                            }
                        }

                    } else if (op.type === 'addWriter2') {
                        const writerKey = b4a.from(op.key, 'hex');
                        await base.addWriter(writerKey, { isIndexer: false });
                        console.log(`Writer added: ${op.key} non-indexer`);

                    } else if (op.type === 'tx') {
                        //TODO: as a validator I should reconstruct hash and validate it.

                        if (null === await view.get(op.key) &&
                            sanitizeTransaction(postTx) &&
                            postTx.op === 'post-tx' &&
                            crypto.verify(Buffer.from(postTx.tx, 'utf-8'), Buffer.from(postTx.is, 'hex'), Buffer.from(postTx.ipk, 'hex')) &&// sender verification
                            crypto.verify(Buffer.from(postTx.tx, 'utf-8'), Buffer.from(postTx.ws, 'hex'), Buffer.from(postTx.wp, 'hex')) &&// writer verification
                            Buffer.byteLength(JSON.stringify(postTx)) <= 4096
                    ) {
                        await view.put(op.key, op.value);
                        console.log(`TX: ${op.key} appended. Signed length: `,  _this.base.view.core.signedLength);
                    }
                        
                        
                    }
                }
            }
        })
        this.base.on('warning', (e) => console.log(e))
    }

    async _open() {
        await this.base.ready();
        if (this.enable_wallet) {
            await this.wallet.initKeyPair(this.KEY_PAIR_PATH);
        }

        this.writingKey = b4a.toString(this.base.local.key, 'hex');

        if (this.replicate) await this._replicate();
        if (this.enable_txchannel) {
            await this.txChannel();
        }
        this.writerManager = new WriterManager(this);

        console.log('View Length:', this.base.view.core.length);
        console.log('View Signed Length:', this.base.view.core.signedLength);
        console.log('MSB Key:', Buffer(this.base.view.core.key).toString('hex'));
        console.log(`isWritable? ${this.base.writable}`);
        console.log(`isIndexer: ${this.base.isIndexer}`);
    }

    async close() {
        if (this.swarm) {
            await this.swarm.destroy();
        }
        await this.base.close();
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

                if(Buffer.byteLength(msg) > 3072) return;

                try {
                    const parsedPreTx = JSON.parse(msg);

                    if (sanitizeTransaction(parsedPreTx) &&
                        parsedPreTx.op === 'pre-tx' &&
                        crypto.verify(Buffer.from(parsedPreTx.tx, 'utf-8'), Buffer.from(parsedPreTx.is, 'hex'), Buffer.from(parsedPreTx.ipk, 'hex')) &&
                        parsedPreTx.w === _this.writingKey &&
                        null === await _this.base.view.get(parsedPreTx.tx)
                    ) {
                        //TODO: as a validator I should reconstruct hash and validate it.
                        const signature = crypto.sign(Buffer.from(parsedPreTx.tx, 'utf-8'), this.signingKeyPair.secretKey);
                        const append_tx = {
                            op: 'post-tx',
                            tx: parsedPreTx.tx,
                            is: parsedPreTx.is,
                            w: parsedPreTx.w,
                            i: parsedPreTx.i,
                            ipk: parsedPreTx.ipk,
                            ch: parsedPreTx.ch,
                            in: parsedPreTx.in,
                            ws: signature.toString('hex'),
                            wp: this.signingKeyPair.publicKey.toString('hex'),
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
                for (let i = 0; i < length; i++) {
                    await this.base.append({ type: 'tx', key: this.tx_pool[i].tx, value: this.tx_pool[i].append_tx });
                    await sleep(5);
                }
                this.tx_pool.splice(0, length);
            }
            await sleep(10);
        }
    }

    async _replicate() {
        if (!this.swarm) {
            const keyPair = this.base.local.keyPair //await this.store.createKeyPair('hyperswarm');
            this.swarm = new Hyperswarm({ keyPair, maxPeers: 1024, maxParallel: 512, maxServerConnections: 256 });

            console.log(`Channel: ${this.channel}`);
            console.log(`Writer key: ${this.writingKey}`)

            this.swarm.on('connection', async (connection, peerInfo) => {
                wakeup.addStream(connection);
                this.store.replicate(connection);


                connection.on('close', () => {
                });

                connection.on('data', async data => {
                    await WriterManager.handleIncomingWriterEvent(this, data);
                })

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
            console.log(`writerLocalKey: ${this.writingKey}`);
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
            input: process.stdin,
            output: process.stdout,
        });

        console.log('MSB started. Available commands:');
        console.log('- /add_writer: enter a peer writer key as argument to get included as writer.');
        console.log('- /add_writer2: enter a peer writer key as argument to get included as non-indexing writer.');
        console.log('- /removeMe:')
        console.log('- /addMe:')
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
                    process.exit(0);
                case '/addMe':
                    await this.writerManager.addMe();
                    break;
                case '/removeMe':
                    await this.writerManager.removeMe();
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
}

function noop() { }
export default MainSettlementBus;
