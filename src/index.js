/** @typedef {import('pear-interface')} */ /* global Pear */
import Autobase from 'autobase';
import Hyperswarm from 'hyperswarm';
import ReadyResource from 'ready-resource';
import b4a from 'b4a';
import Hyperbee from 'hyperbee';
import readline from 'readline';
import crypto from 'hypercore-crypto';
import { sanitizeTransaction, addWriter, restoreManifest } from './functions.js';
import w from 'protomux-wakeup';
import * as edKeyGen from "trac-wallet"
import fs from 'node:fs';
import Corestore from 'corestore';
import verifier from 'hypercore/lib/verifier.js';

//TODO: MOVE FEATURE LOGIC TO WRITER MANAGER CLASS BECAUSE IT'S TERRIBLE TO READ
const { manifestHash, createManifest } = verifier;

const wakeup = new w();

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
                    if (op.type === 'addWriter') {
                        //bootstrap can't add itself?
                        //TODO: it can be optimalized by adding variables to don't call Buffer.from multiple times.
                        //TODO: SANITIZE INCOMPING PROPOSAL
                        if (node.from.key.toString('hex') === this.bootstrap &&
                            this.base.activeWriters.has(Buffer.from(node.from.key)) &&
                            await _this.base.view.get(op.key) === null &&
                            !await base.system.has(Buffer.from(op.value.wk, 'hex'))
                        ) {
                            const message = Buffer.concat([
                                Buffer.from(JSON.stringify(op.value.hpm)),
                                Buffer.from(op.value.wk, 'hex'),
                                Buffer.from(op.key, 'hex')
                            ]);

                            const pop1Valid = crypto.verify(message, Buffer.from(op.value.pop1, 'hex'), Buffer.from(op.value.hpm.signers[0].publicKey));
                            const pop2Valid = crypto.verify(message, Buffer.from(op.value.pop2, 'hex'), Buffer.from(op.key, 'hex'));
                            const restoredManifest = restoreManifest(op.value.hpm); //temporary workaround
                            if (pop1Valid && pop2Valid && manifestHash(createManifest(restoredManifest)).toString('hex') === op.value.wk) {
                                await base.addWriter(b4a.from(op.value.wk, 'hex'))
                                await view.put(op.key, op.value);
                                console.log(`Writer added: ${op.value.wk} indexer`);
                            }
                        }

                    } else if (op.type === 'removeWriter') {
                        // bootstrap can't remove itself?
                        //TODO: it can be optimalized by adding variables to don't call Buffer.from multiple times. And other operations
                        //TODO: SANITIZE INCOMPING PROPOSAL
                        //WHO CAN PERFORM THIS OPERATION? BOOTSTRAP
                        if (
                            node.from.key.toString('hex') === this.bootstrap && // only bootstrap can remove writers
                            this.base.activeWriters.has(Buffer.from(node.from.key)) && // only active writer can perform this operation
                            _this.base.view.get(op.key) !== null  // you can't remove anything that doesn't exist (ledger))

                        ) {

                            const message = Buffer.concat([
                                Buffer.from(op.key, 'hex')
                            ]);

                            const pop = crypto.verify(message, Buffer.from(op.value.pop, 'hex'), Buffer.from(op.key, 'hex'));
                            if (pop) {
                                const userData = await _this.base.view.get(op.key)
                                if (await base.system.has(Buffer.from(userData.value.wk, 'hex')) === true) {// you can't remove writer that doesn't exist (writers)
                                    await base.removeWriter(Buffer.from(userData.value.wk, 'hex'));
                                    await view.del(op.key);

                                    //WORKAROUND:
                                    //const selectedWriter = this.base.activeWriters.get(Buffer.from(userData.value.wk, 'hex'));
                                    //this.base.activeWriters.delete(selectedWriter);
                                }

                            }
                        }
                        //await base.removeWriter(writerKey);

                    } else if (op.type === 'initBootstrap') {
                        // this operation initializes the bootstrap skp to grant this public key the owner status.
                        //TODO: ADD MORE SANITIZATION. THIS IS STILL JS.
                        //TODO: HANDLE ERRORS?
                        //TODO: it can be optimalized by adding variables to don't call Buffer.from multiple times.

                        if (node.from.key.toString('hex') === this.bootstrap && this.base.activeWriters.has(Buffer.from(op.value.wk, 'hex'))) {
                            const message = Buffer.concat([
                                Buffer.from(JSON.stringify(op.value.hpm)),
                                Buffer.from(op.value.wk, 'hex'),
                                Buffer.from(op.value.skp, 'hex')
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
    //TODO: CHECK IF TX HASH IS ALREDY IN BASE BEFORE VALIDATING IT TO DON'T OVERWRITE tx/writerPubKey. Also we need to validate this case where the 2 nodes send the same hash. 

    async _open() {
        await this.base.ready();
        if (this.enable_wallet) {
            await this.#initKeyPair();
        }
        console.log('View Length:', this.base.view.core.length);
        console.log('View Signed Length:', this.base.view.core.signedLength);
        console.log('MSB Key:', Buffer(this.base.view.core.key).toString('hex'));
        this.writingKey = b4a.toString(this.base.local.key, 'hex');

        console.log(`AM I WRITABLE? ${this.base.writable}`);
        if (this.replicate) await this._replicate();
        if (this.enable_txchannel) {
            await this.txChannel();
        }

        //TODO: MOVE IT TO A FUNCTION AND SHOULD IT BE BEFORE OR AFTER THE REPLICATION?
        // if this node is a bootstrap and the first node in the network. Add itself as a writer.
        if (this.writingKey && this.writingKey === this.bootstrap) {
            console.log("this.base.view.get(this.signingKeyPair.publicKey.toString('hex')): ", await this.base.view.get('bootstrap'));
            const isExistingStrapOfTracManifest = await this.base.view.get('bootstrap');
            if (isExistingStrapOfTracManifest === null) {

                const message = Buffer.concat([
                    Buffer.from(JSON.stringify(this.base.localWriter.core.manifest)),
                    Buffer.from(this.writingKey, 'hex'),
                    this.signingKeyPair.publicKey
                ]);

                //SEND BOOTSTRAP TRAC MANIFEST
                await this.base.append({
                    type: 'initBootstrap',
                    key: 'bootstrap',
                    value: {
                        wk: this.writingKey,
                        hpm: this.base.localWriter.core.manifest,
                        skp: this.signingKeyPair.publicKey.toString('hex'),
                        pop1: crypto.sign(message, this.base.localWriter.core.keyPair.secretKey),
                        pop2: crypto.sign(message, this.signingKeyPair.secretKey)
                    }
                });
            }
            this.WriterEventListener();
        }
    }

    async handleIncomingWriterEvent(data) {
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

    async WriterEventListener() {
        if (this.writingKey !== this.bootstrap) return;
        this.on('writerEvent', async (parsedRequest) => {
            await this.base.append(parsedRequest);
        });
    }

    async addMe() {
        //TODO: special case. Bootstrap can't run it.
        try {
            const _this = this;

            const existsInView = await _this.base.view.get(this.signingKeyPair.publicKey.toString("hex"));
            if (existsInView !== null) {
                console.log(`Writer ${_this.writingKey} is already associated`);
                return;
            }
            // 2 TYPES OF CHECKING THAT NODE IS ALREADY WRITER IS BASE.SYSTEM.HAS AND ACTIVEWRITERS.HAS
            const alreadyAdded = await _this.base.system.has(Buffer.from(_this.writingKey, 'hex'));
            if (alreadyAdded) {
                console.log(`Writer ${_this.writingKey} is already added in the system`);
                return;
            }

            const bootstrapData = await _this.base.view.get('bootstrap');
            if (!bootstrapData?.value?.hpm?.signers?.[0]?.publicKey?.data) {
                console.log(`Bootstrap key not found`);
                return;
            }

            const bootstrapPubKey = Buffer.from(((await _this.base.view.get('bootstrap')).value.hpm.signers[0].publicKey.data)).toString('hex');
            _this.swarm.connections.forEach(async conn => {
                if (conn.connected && conn.remotePublicKey.toString('hex') === bootstrapPubKey) {
                    
                    const message = Buffer.concat([
                        Buffer.from(JSON.stringify(_this.base.local.core.manifest)),
                        Buffer.from(_this.writingKey, 'hex'),
                        _this.signingKeyPair.publicKey
                    ]);

                    //SEND TRAC MANIFEST
                    conn.write(JSON.stringify({
                        type: 'addWriter',
                        key: this.signingKeyPair.publicKey.toString("hex"),
                        value: {
                            wk: _this.writingKey,
                            hpm: _this.base.local.core.manifest,
                            pop1: crypto.sign(message, _this.base.local.core.header.keyPair.secretKey),
                            pop2: crypto.sign(message, _this.signingKeyPair.secretKey)
                        }
                    }));

                    setTimeout(async () => {
                        const isWriterAdded = _this.base.activeWriters.has(Buffer.from(_this.writingKey, 'hex'));
                        if (isWriterAdded) {
                            console.log(`Writer ${_this.writingKey} was successfully added.`);
                        } else {
                            console.warn(`Writer ${_this.writingKey} was NOT added.`);
                        }
                    }, 5000);
                }
            })
        } catch (error) {
            console.error(`err in `, error);
        }
    }

    async removeMe() {
        //there must be special case for the bootstrap
        try {
            const _this = this;
            console.log("await base.system.has(Buffer.from(userData.value.wk, 'hex'))", await _this.base.system.has(Buffer.from(_this.writingKey, 'hex')));
            console.log(_this.base.activeWriters.has(Buffer.from(_this.writingKey, 'hex')));
            //strange behaviour because as a deleted writer I should receive a false. 
            const bootstrapData = await _this.base.view.get('bootstrap');

            if (!bootstrapData || !bootstrapData.value?.hpm?.signers?.[0]?.publicKey?.data) {
                console.log(`Bootstrap key not found`);
                return;
            }
            const bootstrapPubKey = Buffer.from(bootstrapData.value.hpm.signers[0].publicKey.data).toString('hex');

            const userKeyData = await _this.base.view.get(_this.signingKeyPair.publicKey.toString("hex"));
            if (!userKeyData) {
                console.log(`Your key does not exist in the database`);
                return;
            }

            // check - you cant delete if you are not a owner.
            // if (userKeyData.value.wk !== _this.writingKey) {
            //     console.log(`You are not the owner of this key`);
            //     return;
            // }

            _this.swarm.connections.forEach(async conn => {
                if (conn.connected && conn.remotePublicKey.toString('hex') === bootstrapPubKey) {

                    const message = Buffer.concat([
                        _this.signingKeyPair.publicKey
                    ]);

                    //SEND TRAC MANIFEST
                    conn.write(JSON.stringify({
                        type: 'removeWriter',
                        key: this.signingKeyPair.publicKey.toString("hex"),
                        value: {
                            pop: crypto.sign(message, _this.signingKeyPair.secretKey),
                        }
                    }));
                }
            })

            setTimeout(async () => {
                const checkKey = await _this.base.view.get(_this.signingKeyPair.publicKey.toString("hex"));
                //console.log(`checkKey`,checkKey)
                if (!checkKey) {
                    console.log(`Key successfully removed`);
                } else {
                    console.log(`Failed to remove key`);
                }
            }, 5000);

        } catch (error) {
            console.error(`err in `, error);
        }
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
                    await this.sleep(5);
                }
                this.tx_pool.splice(0, length);
            }
            await this.sleep(10);
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async _replicate() {
        if (!this.swarm) {
            const keyPair = this.base.local.keyPair//await this.store.createKeyPair('hyperswarm');
            this.swarm = new Hyperswarm({ keyPair, maxPeers: 1024, maxParallel: 512, maxServerConnections: 256 });

            console.log(`Channel: ${this.channel}`);
            console.log(`Writer key: ${this.writingKey}`)
            console.log(`isIndexer: ${this.base.isIndexer}`);

            this.swarm.on('connection', async (connection, peerInfo) => {
                wakeup.addStream(connection);
                this.store.replicate(connection);


                connection.on('close', () => {
                });

                connection.on('data', async data => {
                    await this.handleIncomingWriterEvent(data);
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
                    await this.addMe();
                    break;
                case '/aw':
                    console.log('Active writers:', this.base.activeWriters.map);
                    break;
                case '/removeMe':
                    await this.removeMe();
                    break;
                default:
                    if (input.startsWith('/add_writer')) {
                        await addWriter(input, this);
                    } else if (input.startsWith('/verify')) {
                        let splitted = input.split(' ');
                        const argument = splitted[1];
                        console.log(`Verifying the ${argument} in activeWriters:`, this.base.activeWriters.has(Buffer.from(argument, 'hex')));
                        console.log(`Verifying the ${argument} in base.system.has:`, await this.base.system.has(Buffer.from(argument, 'hex')));

                    }
            }
            rl.prompt();
        });

        rl.prompt();
    }

    async #getMnemonicInteractiveMode() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (query) => {
            return new Promise(resolve => {
                rl.question(query, resolve);
            });
        }

        let mnemonic;
        let choice = '';
        while (!choice.trim()) {
            choice = await question("[1]. Generate new mnemonic phrase\n[2]. Restore keypair from backed up mnemonic phrase\nYour choice (1/2): ");
            switch (choice) {
                case '1':
                    mnemonic = undefined
                    break;
                case '2':
                    const mnemonicInput = await question("Enter your mnemonic phrase: ");
                    mnemonic = edKeyGen.sanitizeMnemonic(mnemonicInput);
                    break;
                default:
                    console.log("Invalid choice. Please select again");
                    choice = '';
                    break;
            }
        }
        rl.close();
        return mnemonic;
    }

    async #initKeyPair() {
        // TODO: User shouldn't be allowed to store it in unencrypted form. ASK for a password to encrypt it. ENCRYPT(HASH(PASSWORD,SALT),FILE)/DECRYPT(HASH(PASSWORD,SALT),ENCRYPTED_FILE)?
        try {
            // Check if the key file exists
            if (fs.existsSync(this.KEY_PAIR_PATH)) {
                const keyPair = JSON.parse(fs.readFileSync(this.KEY_PAIR_PATH));
                this.signingKeyPair = {
                    publicKey: Buffer.from(keyPair.publicKey, 'hex'),
                    secretKey: Buffer.from(keyPair.secretKey, 'hex')
                }
            } else {
                console.log("Key file was not found. How do you wish to proceed?");
                const mnemonic = await this.#getMnemonicInteractiveMode();

                const generatedSecrets = edKeyGen.generateKeyPair(mnemonic);
                const keyPair = {
                    publicKey: Buffer.from(generatedSecrets.publicKey).toString('hex'),
                    secretKey: Buffer.from(generatedSecrets.secretKey).toString('hex')
                }

                //TODO: ASK USER TO WRITE FIRST SECOND AND LAST WORD OR SOMETHING SIMILAR TO CONFIRM THEY HAVE WRITTEN IT DOWN
                if (!mnemonic) console.log("This is your mnemonic:\n", generatedSecrets.mnemonic, "\nPlease back it up in a safe location")

                fs.writeFileSync(this.KEY_PAIR_PATH, JSON.stringify(keyPair));
                this.signingKeyPair = {
                    publicKey: generatedSecrets.publicKey,
                    secretKey: generatedSecrets.secretKey,
                }

                console.log("DEBUG: Key pair generated and stored in", this.KEY_PAIR_PATH);
            }
        } catch (err) {
            console.error(err);
        }
    }
}

function noop() { }
export default MainSettlementBus;
