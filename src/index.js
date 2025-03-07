/** @typedef {import('pear-interface')} */ /* global Pear */
import Autobase from 'autobase';
import Hyperswarm from 'hyperswarm';
import ReadyResource from 'ready-resource';
import b4a from 'b4a';
import Hyperbee from 'hyperbee';
import readline from 'readline';
import BlindPairing from 'blind-pairing';
import crypto from 'hypercore-crypto';
import { sanitizeTransaction, addWriter } from './functions.js';
import w from 'protomux-wakeup';
import * as edKeyGen from "ed25519-key-generator"
import fs from 'node:fs';
import Corestore from 'corestore';

const wakeup = new w();

const STORES_DIRECTORY = 'stores/';
const KEY_PAIR_PATH = `${STORES_DIRECTORY}${process.argv[2]}/keypair.json`
export const store = new Corestore(STORES_DIRECTORY + process.argv[2])

export class MainSettlementBus extends ReadyResource {

    constructor(store, options = {}) {
        super();
        this.signingKeyPair = null;
        this.store = store;
        this.swarm = null;
        this.tx = options.tx || null;
        this.enable_txchannel = options.enable_txchannel || true;
        this.base = null;
        this.key = null;
        this.channel = options.channel || null;;
        this.connectedNodes = 1;
        this.replicate = options.replicate !== false;
        this.writerLocalKey = null;
        this.isStreaming = false;
        this.bootstrap = options.bootstrap || null;
        this.opts = options;
        this.connectedPeers = new Set();
        this.invite = null;
        this.bee = null;

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
                return _this.bee;
            },

            apply: async (nodes, view, base) => {

                const batch = view.batch({ update: false })

                for (const node of nodes) {
                    const op = node.value;
                    const postTx = op.value;
                    if (op.type === 'addWriter') {
                        const writerKey = b4a.from(op.key, 'hex');
                        await base.addWriter(writerKey);
                        console.log(`Writer added: ${op.key}`);
                    } else if (op.type === 'tx') {
                        if (sanitizeTransaction(postTx) &&
                            postTx.op === 'post-tx' &&
                            crypto.verify(Buffer.from(postTx.tx, 'utf-8'), Buffer.from(postTx.is.data), Buffer.from(postTx.ipk.data)) &&// sender verification
                            crypto.verify(Buffer.from(postTx.tx, 'utf-8'), Buffer.from(postTx.ws.data), Buffer.from(postTx.wm.signers[0].publicKey)) &&// writer verification
                            this.base.activeWriters.has(Buffer.from(postTx.w, 'hex'))) {
                            await batch.put(op.key, op.value);
                            console.log(`TX: ${op.key} appended. Signed length: `, _this.base.view.core.signedLength);
                        }

                    }
                }

                await batch.flush();
            }
        })
        this.base.on('warning', (e) => console.log(e))
    }

    async _open() {
        await this.base.ready();
        await this.#initKeyPair();
        console.log('View Length:', this.base.view.core.length);
        console.log('View Signed Length:', this.base.view.core.signedLength);
        console.log('MSB Key:', Buffer(this.base.view.core.key).toString('hex'));
        this.writerLocalKey = b4a.toString(this.base.local.key, 'hex');
        if (this.replicate) await this._replicate();
        if (this.enable_txchannel) {
            await this.txChannel();
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
            const peerName = b4a.toString(connection.remotePublicKey, 'hex');
            this.connectedPeers.add(peerName);
            this.connectedNodes++;

            connection.on('close', () => {
                this.connectedNodes--;
                this.connectedPeers.delete(peerName);
            });

            connection.on('error', (error) => { });

            connection.on('data', async (msg) => {
                try {
                    const parsedPreTx = JSON.parse(msg);
                    if (sanitizeTransaction(parsedPreTx) &&
                        parsedPreTx.op === 'pre-tx' &&
                        crypto.verify(Buffer.from(parsedPreTx.tx, 'utf-8'), Buffer.from(parsedPreTx.is.data), Buffer.from(parsedPreTx.ipk.data)) &&
                        parsedPreTx.w === _this.writerLocalKey &&
                        _this.base.activeWriters.has(Buffer.from(parsedPreTx.w, 'hex'))) {

                        const manifest = this.base.localWriter.core.manifest;
                        const signature = crypto.sign(Buffer.from(parsedPreTx.tx, 'utf-8'), this.base.localWriter.core.keyPair.secretKey);
                        const append_tx = {
                            op: 'post-tx',
                            tx: parsedPreTx.tx,
                            is: parsedPreTx.is,
                            w: parsedPreTx.w,
                            i: parsedPreTx.i,
                            ipk: parsedPreTx.ipk,
                            ch: parsedPreTx.ch,
                            in: parsedPreTx.in,
                            ws: JSON.parse(JSON.stringify(signature)),
                            wm: manifest
                        };
                        const str_append_tx = JSON.stringify(append_tx);
                        await _this.base.append({ type: 'tx', key: parsedPreTx.tx, value: append_tx });
                        await _this.base.update();
                        await connection.write(str_append_tx);

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

    async _replicate() {
        if (!this.swarm) {
            const keyPair = await this.store.createKeyPair('hyperswarm');
            this.swarm = new Hyperswarm({ keyPair, maxPeers: 1024, maxParallel: 512, maxServerConnections: 256 });
            this.invite = new BlindPairing(this.swarm, {
                poll: 5000
            });

            console.log(`Channel: ${this.channel}`);
            console.log(`Writer key: ${this.writerLocalKey}`)

            this.swarm.on('connection', async (connection, peerInfo) => {
                const peerName = b4a.toString(connection.remotePublicKey, 'hex');
                this.connectedPeers.add(peerName);
                wakeup.addStream(connection);
                this.store.replicate(connection);
                this.connectedNodes++;

                connection.on('close', () => {
                    this.connectedNodes--;
                    this.connectedPeers.delete(peerName);
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

    async verifyDag() {
        try {
            console.log('--- DAG Monitoring ---');
            const dagView = await this.base.view.core.treeHash();
            const lengthdagView = this.base.view.core.length;
            const dagSystem = await this.base.system.core.treeHash();
            const lengthdagSystem = this.base.system.core.length;
            console.log("this.base.system.core", this.base.system.core);
            console.log(`writerLocalKey: ${this.writerLocalKey}`);
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
            if (fs.existsSync(KEY_PAIR_PATH)) {
                const keyPair = JSON.parse(fs.readFileSync(KEY_PAIR_PATH));
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

                fs.writeFileSync(KEY_PAIR_PATH, JSON.stringify(keyPair));
                this.signingKeyPair = {
                    publicKey: generatedSecrets.publicKey,
                    secretKey: generatedSecrets.secretKey,
                }

                console.log("DEBUG: Key pair generated and stored in", KEY_PAIR_PATH);
            }
        } catch (err) {
            console.error(err);
        }
    }
}

function noop() { }
export default MainSettlementBus;
