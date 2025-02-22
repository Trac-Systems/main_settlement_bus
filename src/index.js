/** @typedef {import('pear-interface')} */ /* global Pear */
import Autobase from 'autobase';
import Hyperswarm from 'hyperswarm';
import ReadyResource from 'ready-resource';
import b4a from 'b4a';
import Hyperbee from 'hyperbee';
import readline from 'readline';
import BlindPairing from 'blind-pairing';

class MainSettlementBus extends ReadyResource {

    constructor(store, options = {}) {
        super();

        this.store = store;
        this.swarm = null;
        this.tx = options.tx || null;;
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
                    } else if (op.type === 'msg'){
                        await batch.put(op.key, op.value);
                        console.log(`${op.key}: ${op.value}`);
                    } else if (op.type === 'tx'){
                        await batch.put(op.key, op.value);
                        console.log(`${op.key}:`, op.value);
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
        this.writerLocalKey = b4a.toString(this.base.local.key, 'hex');
        if (this.replicate) await this._replicate();
        await this.txChannel();
    }

    async close() {
        if (this.swarm) {
            await this.swarm.destroy();
        }
        await this.base.close();
    }

    async txChannel() {
        this.tx_swarm = new Hyperswarm();
        this.tx_swarm.on('connection', async (connection, peerInfo) => {
            const _this = this;
            const peerName = b4a.toString(connection.remotePublicKey, 'hex');

            console.log(`TX Remote Public key: ${peerName}`)
            console.log(`* TX Connected to peer: ${peerName} *`);

            connection.on('close', () => {
                console.log(`TX Peer disconnected. Remaining nodes: ${this.connectedNodes}`);
            });

            connection.on('data', async (data) => {
                const msg = Buffer(data).toString('utf8');
                try {
                    const parsed = JSON.parse(msg);
                    if(typeof parsed.op !== undefined && parsed.op === 'pre-tx' && typeof parsed.tx !== undefined){
                        const view = await this.base.view.checkout(this.base.view.core.length);
                        const batch = view.batch({ update: false });
                        if(null === await batch.get(parsed.tx)){
                            const post_tx = JSON.stringify({
                                op : 'post-tx',
                                tx : parsed.tx,
                                sig : 'abc'
                            });
                            await connection.write(post_tx);
                            await _this.base.append({ type: 'tx', key: parsed.tx, value : post_tx });
                            await _this.base.update();
                            console.log(`MSB Incoming:`, parsed);
                        }
                        await batch.flush();
                    }
                } catch(e) { }
                connection.end();
            });
        });

        const channelBuffer = this.tx;
        this.tx_swarm.join(channelBuffer, { server: true, client: false });
        await this.tx_swarm.flush();
        console.log('Joined channel for peer discovery');
    }

    async _replicate() {
        if (!this.swarm) {
            const keyPair = await this.store.createKeyPair('hyperswarm');
            this.swarm = new Hyperswarm({ keyPair });
            this.invite = new BlindPairing(this.swarm, {
                poll: 5000
            });

            console.log(`Channel: ${this.channel}`);
            console.log(`Writer key: ${this.writerLocalKey}`)

            this.swarm.on('connection', async (connection, peerInfo) => {
                const _this = this;
                const peerName = b4a.toString(connection.remotePublicKey, 'hex');

                console.log(`Remote Public key: ${peerName}`)

                console.log(`* Connected to peer: ${peerName} *`);
                this.connectedPeers.add(peerName);
                this.store.replicate(connection);
                this.connectedNodes++;
                console.log(`Total connected nodes: ${this.connectedNodes}`);

                connection.on('close', () => {
                    this.connectedNodes--;
                    this.connectedPeers.delete(peerName);
                    console.log(`Peer disconnected. Remaining nodes: ${this.connectedNodes}`);
                });

                connection.on('error', (error) => {
                    console.error(`Connection error: ${error.message}`);
                });

                if (!this.isStreaming) {
                    console.log(`*** Emitting "readyMsb" event. ***`);
                    this.emit('readyMsb');
                }
            });

            const channelBuffer = this.channel;
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
        console.log('- anything else to send a message');

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
                    } else {
                        if(this.isStreaming) {
                            await this.base.append([{
                                type : 'msg',
                                key : this.writerLocalKey,
                                value : input
                            }]);
                            await this.base.update();
                        } else {
                            console.log('App is not streaming yet');
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
