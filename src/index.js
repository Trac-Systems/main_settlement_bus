/** @typedef {import('pear-interface')} */ /* global Pear */
import Autobase from 'autobase';
import Hyperswarm from 'hyperswarm';
import ReadyResource from 'ready-resource';
import b4a from 'b4a';
import Hyperbee from 'hyperbee';
import readline from 'readline';
import BlindPairing from 'blind-pairing';
import crypto from 'hypercore-crypto';
import {sanitizePreTransaction} from './functions.js';

import pkg from 'hypercore/lib/verifier.js';
import { version } from 'os';
const { manifestHash, createManifest } = pkg;

export class MainSettlementBus extends ReadyResource {

    constructor(store, options = {}) {
        super();

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

        // Emiters 
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

                //console.log('System core length', this.base.system.core.length);
                //console.log('System core fork', this.base.system.core.fork);

                const batch = view.batch({ update: false })

                for (const node of nodes) {
                    //console.log(node);
                    //console.log('System has node', await this.base.system.has(node.from.key));
                    const op = node.value;

                    if (op.type === 'addWriter') {
                        const writerKey = b4a.from(op.key, 'hex');
                        await base.addWriter(writerKey);
                        console.log(`Writer added: ${op.key}`);
                    } else if (op.type === 'tx'){
                        // TODO: check signatureS (both, sender and writer)
                        // TODO: check if writer is active writer
                        await batch.put(op.key, op.value);
                        console.log(`TX: ${op.key}:`, op.value);
                    }
                }

                await batch.flush();
            }
        })
        // This line propagates the 'update' event emitted by the `Autobase` instance.
        //The autobase instance emits an update event  whemever its state changes.
        // By listening to the 'update' event from `this.base` and re-emitting it
        // (`this.emit('update')`), the `MessageShooter` instance informs its own listeners about these updates.
        this.base.on('update', () => this.emit('update'));
    }

    async _open() {
        await this.base.ready();
        console.log('View Length:', this.base.view.core.length);
        console.log('View Signed Length:', this.base.view.core.signedLength);
        console.log('MSB Key:', Buffer(this.base.view.core.key).toString('hex'));
        this.writerLocalKey = b4a.toString(this.base.local.key, 'hex');
        if (this.replicate) await this._replicate();
        if(this.enable_txchannel){
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
        this.tx_swarm = new Hyperswarm({maxPeers : 1024, maxParallel: 512, maxServerConnections : 256});
        this.tx_swarm.on('connection', async (connection, peerInfo) => {
            const _this = this;
            const peerName = b4a.toString(connection.remotePublicKey, 'hex');

            //console.log(`TX Remote Public key: ${peerName}`)

            this.connectedPeers.add(peerName);
            this.connectedNodes++;
            //console.log(`TX Total connected nodes: ${this.connectedNodes}`);

            connection.on('close', () => {
                this.connectedNodes--;
                this.connectedPeers.delete(peerName);
                //console.log(`TX Peer disconnected. Remaining nodes: ${this.connectedNodes}`);
            });

            connection.on('error', (error) => {
                //console.error(`TX Connection error: ${error.message}`);
            });


            // Sanitization time: 0.085 ms
            // signature verification time: 0.105 ms SUGGESTION: SECOND SERVICE IN RUST WHICH WILL BE SOMETHING LIKE CRYPTOGRAPHIC VALIDATOR WHICH WILL USE SHARED MEMORY WITH THIS PROGRAM?
            // EVEN IF SODIUM JS LIBRARY IS FAST IT'S STILL SLOW FOR THIS PURPOSE.
            //todo: add this check  parsed.w === _this.writerLocalKey
            //todo: add this check _this.base.activeWriters.has(Buffer.from(parsed.w, 'hex'))
            connection.on('data', async (data) => {
                const msg = Buffer(data).toString('utf8');
                try {
                    console.log("===================> msg:",msg)
                    const parsedPreTx = JSON.parse(msg);
                    // console.log("======================> parsedPreTx",parsedPreTx)
                    if(sanitizePreTransaction(parsedPreTx) && 
                        crypto.verify(Buffer.from(parsedPreTx.tx, 'utf-8'), Buffer.from(parsedPreTx.isig.data), Buffer.from(parsedPreTx.ipk.data))) {
                            const manifest = this.base.localWriter.core.manifest;
                            // console.log("manifest", this.base.localWriter.core.manifest)

                            // const hashedManifest = manifestHash(createManifest(manifest));
                            // console.log("hashedManifest ",hashedManifest)
                            console.log("=========> manifest ",manifest)
                            console.log("=========> manifest stringify ",JSON.stringify(manifest))
                            const signature =  crypto.sign(Buffer.from(parsedPreTx.tx, 'utf-8'), this.base.localWriter.core.keyPair.secretKey);
                            const append_tx = {
                                op : 'post-tx',
                                tx : parsedPreTx.tx,
                                w : parsedPreTx.w,
                                i : parsedPreTx.i,
                                msbsig: signature,
                                msbpk: this.base.localWriter.core.keyPair.publicKey,
                                manifest: manifest
                            };
                            const str_append_tx = JSON.stringify(append_tx);
                            // console.log("=============> append_tx",append_tx);
                            console.log("============> str_append_tx",str_append_tx);
                            await _this.base.append({ type: 'tx', key: parsedPreTx.tx, value : append_tx });
                            await _this.base.update();
                            await connection.write(JSON.stringify(str_append_tx));
                            // console.log("stringifyed parsed post-tx",JSON.stringify(append_tx))
                    
                    }
                } catch(e) { 
                    console.log(e) 
                }
            });
        });

        const channelBuffer = this.tx;
        this.tx_swarm.join(channelBuffer, { server: true, client: true });
        await this.tx_swarm.flush();
        console.log('Joined MSB channel for peer discovery');
    }

    async _replicate() {
        if (!this.swarm) {
            const keyPair = await this.store.createKeyPair('hyperswarm');
            this.swarm = new Hyperswarm({ keyPair, maxPeers : 1024, maxParallel: 512, maxServerConnections : 256 });
            this.invite = new BlindPairing(this.swarm, {
                poll: 5000
            });

            console.log(`Channel: ${this.channel}`);
            console.log(`Writer key: ${this.writerLocalKey}`)

            this.swarm.on('connection', async (connection, peerInfo) => {
                const _this = this;
                const peerName = b4a.toString(connection.remotePublicKey, 'hex');

                //console.log(`Remote Public key: ${peerName}`)

                //console.log(`* Connected to peer: ${peerName} *`);
                this.connectedPeers.add(peerName);
                this.store.replicate(connection);
                this.connectedNodes++;
                //console.log(`Total connected nodes: ${this.connectedNodes}`);

                connection.on('close', () => {
                    this.connectedNodes--;
                    this.connectedPeers.delete(peerName);
                    //console.log(`Peer disconnected. Remaining nodes: ${this.connectedNodes}`);
                });

                connection.on('error', (error) => {
                    //console.error(`Connection error: ${error.message}`);
                });

                if (!this.isStreaming) {
                    //console.log(`*** Emitting "readyMsb" event. ***`);
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
            //const dag = await this.base.system.core.getBackingCore().session.treeHash();
            //const lengthdag = this.base.system.core.getBackingCore().session.length;
            const dagView = await this.base.view.core.treeHash();
            const lengthdagView = this.base.view.core.length;
            const dagSystem = await this.base.system.core.treeHash();
            const lengthdagSystem = this.base.system.core.length;
            console.log("this.base.system.core",this.base.system.core);
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
        console.log('- /add_me: enter a node address as argument to get included as writer.');
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
                    if(input.startsWith('/add_me')) {
                        try {
                            let splitted = input.split(' ');

                            const { invite, publicKey, discoveryKey } = BlindPairing.createInvite(Buffer.from(splitted[splitted.length-1], 'hex'));
                            console.log(invite.toString('hex'), publicKey.toString('hex'), discoveryKey.toString('hex'));

                            const _this = this;

                            const member = this.invite.addMember({
                                discoveryKey,
                                async onadd (candidate) {
                                    console.log('candiate id is', candidate.inviteId.toString('hex'))
                                    candidate.open(publicKey)
                                    console.log('add candidate:', candidate.userData.toString('hex'))
                                    candidate.confirm({ key: Buffer.from(splitted[splitted.length-1], 'hex') })
                                    await _this.base.append({ type: 'addWriter', key: splitted[splitted.length-1] });
                                    await _this.base.update();
                                }
                            })

                            console.log('Awaiting invite broadcast...');

                            await member.flushed();

                            console.log('Invite id...', invite.toString('hex'));

                            const adding = this.invite.addCandidate({
                                invite: invite,
                                userData : Buffer.from(splitted[splitted.length-1], 'hex'),
                                async onadd (result) {
                                    console.log('got the result!')
                                }
                            })

                            console.log('Awaiting invite pairing...');

                            await adding.pairing;

                            console.log('Paired!');
                        } catch(e) {
                         console.log(e.message);
                        }
                    }
            }
            rl.prompt();
        });

        rl.prompt();
    }
}

function noop() { }
export default MainSettlementBus;
