import w from 'protomux-wakeup';
import b4a from 'b4a';
import Hyperswarm from 'hyperswarm';
import {
    TRAC_NAMESPACE,
    MAX_PEERS,
    MAX_PARALLEL,
    MAX_SERVER_CONNECTIONS,
    MAX_CLIENT_CONNECTIONS,
    OperationType,
    EntryType
} from './utils/constants.js';
import { sleep } from './utils/functions.js';
import Check from './utils/check.js';
import Wallet from 'trac-wallet';
import Protomux from 'protomux'
import c from 'compact-encoding'
import ReadyResource from 'ready-resource';

const wakeup = new w();

class Network extends ReadyResource {
    #shouldStopPool = false;
    #swarm = null;
    #enableValidatorObserver;
    #enable_wallet;
    #disable_rate_limit;
    #channel;
    #dht_bootstrap = ['116.202.214.149:10001', '157.180.12.214:10001', 'node1.hyperdht.org:49737', 'node2.hyperdht.org:49737', 'node3.hyperdht.org:49737'];

    constructor(state, channel, options = {}) {
        super();
        this.#enableValidatorObserver = options.enableValidatorObserver !== undefined ? options.enableValidatorObserver : true;
        this.#enable_wallet = options.enable_wallet !== false;
        this.#disable_rate_limit = options.disable_rate_limit === true;
        this.#channel = channel;
        this.tx_pool = [];
        this.pool(state.append.bind(state));
        this.check = new Check();
        this.admin_stream = null;
        this.admin = null;
        this.validator_stream = null;
        this.validator = null;
        this.custom_stream = null;
        this.custom_node = null;
        
    }

    get swarm() {
        return this.#swarm;
    }

    get disable_rate_limit() {
        return this.#disable_rate_limit;
    }

    get channel() {
        return this.#channel;
    }

    async _open() { console.log('Network initialization...'); }

    async _close() {
        console.log('Network: closing gracefully...');
        this.stopPool();
        await sleep(100);

        if (this.#enableValidatorObserver) {
            this.stopValidatorObserver();
        }

        await sleep(5_000);

        if (this.#swarm !== null) {
            this.#swarm.destroy();
        }
    }

    async replicate(
        //TODO: we should delete an access to state. We should create a new methods in index.js which will allows access to needed properties and bind them here.
        state,
        writingKey,
        store,
        wallet,
        handleIncomingEvent,
    ) {
        if (!this.#swarm) {
            let keyPair;
            if (!this.#enable_wallet) {
                keyPair = await store.createKeyPair(TRAC_NAMESPACE);
            } else {
                keyPair = {
                    publicKey: b4a.from(wallet.publicKey, 'hex'),
                    secretKey: b4a.from(wallet.secretKey, 'hex')
                };
            }

            let clean = Date.now();
            let conns = {};

            this.#swarm = new Hyperswarm({
                keyPair,
                bootstrap: this.#dht_bootstrap,
                maxPeers: MAX_PEERS,
                maxParallel: MAX_PARALLEL,
                maxServerConnections: MAX_SERVER_CONNECTIONS,
                maxClientConnections: MAX_CLIENT_CONNECTIONS
            });

            console.log(`Channel: ${b4a.toString(this.#channel)}`);
            const network = this;
            this.#swarm.on('connection', async (connection) => {

                const mux = Protomux.from(connection)
                connection.userData = mux

                const message_channel = mux.createChannel({
                    protocol: b4a.toString(this.#channel, 'utf8'),
                    onopen() {
                    },
                    onclose() {
                    }
                })
                message_channel.open()
                const message = message_channel.addMessage({
                    encoding: c.json,
                    //TODO:split this into many functions. This function should only contain switch statement
                    //TODO: instad of doing return; in cases which does not fit for us, we should perform - swarm.leavePeer(connection.remotePublicKey)
                    async onmessage(msg) {
                        try {
                            const channelString = b4a.toString(network.channel, 'utf8');

                            if (msg === 'get_validator') {
                                const nonce = Wallet.generateNonce().toString('hex');
                                const _msg = {
                                    op: 'validator',
                                    key: writingKey,
                                    address: wallet.publicKey,
                                    channel: channelString
                                };
                                const sig = wallet.sign(JSON.stringify(_msg) + nonce);
                                message.send({ response: _msg, sig, nonce })
                                network.#swarm.leavePeer(connection.remotePublicKey)
                            } else if (msg === 'get_admin') {
                                const res = await state.get(EntryType.ADMIN);
                                if (wallet.publicKey !== res.tracPublicKey) return;
                                const nonce = Wallet.generateNonce().toString('hex');
                                const _msg = {
                                    op: 'admin',
                                    key: writingKey,
                                    address: wallet.publicKey,
                                    channel: channelString
                                };
                                const sig = wallet.sign(JSON.stringify(_msg) + nonce);
                                message.send({ response: _msg, sig, nonce })
                                network.#swarm.leavePeer(connection.remotePublicKey)
                            } else if (msg === 'get_node') {

                                const nonce = Wallet.generateNonce().toString('hex');
                                const _msg = {
                                    op: 'node',
                                    key: writingKey,
                                    address: wallet.publicKey,
                                    channel: channelString
                                };
                                const sig = wallet.sign(JSON.stringify(_msg) + nonce);
                                message.send({ response: _msg, sig, nonce })
                                network.#swarm.leavePeer(connection.remotePublicKey)

                            } else if (msg.response !== undefined && msg.response.op !== undefined && msg.response.op === 'validator') {
                                const res = await state.get(msg.response.address);
                                if (res === null) return;
                                const verified = wallet.verify(msg.sig, JSON.stringify(msg.response) + msg.nonce, msg.response.address)
                                if (verified && msg.response.channel === channelString && network.validator_stream === null) {
                                    console.log('Validator stream established', msg.response.address)
                                    network.validator_stream = connection;
                                    network.validator = msg.response.address;
                                }
                                network.#swarm.leavePeer(connection.remotePublicKey)
                            } else if (msg.response !== undefined && msg.response.op !== undefined && msg.response.op === 'admin') {
                                const res = await state.get(EntryType.ADMIN);
                                if (res === null || res.tracPublicKey !== msg.response.address) return;
                                const verified = wallet.verify(msg.sig, JSON.stringify(msg.response) + msg.nonce, res.tracPublicKey)
                                if (verified && msg.response.channel === channelString) {
                                    console.log('Admin stream established', res.tracPublicKey)
                                    network.admin_stream = connection;
                                    network.admin = res.tracPublicKey;
                                }
                                network.#swarm.leavePeer(connection.remotePublicKey)
                            }
                            else if (msg.response !== undefined && msg.response.op !== undefined && msg.response.op === 'node') {

                                const verified = wallet.verify(msg.sig, JSON.stringify(msg.response) + msg.nonce, msg.response.address)
                                if (verified && msg.response.channel === channelString) {

                                    console.log('Node stream established', msg.response.address)
                                    network.custom_stream = connection;
                                    network.custom_node = msg.response.address;
                                }
                                network.#swarm.leavePeer(connection.remotePublicKey)

                                //TODO: Most of this logic below should be moved into the handleIncomingEvent function. Code below can be reduced to call only handleIncomingEvent(msg) with some basic checks.
                            } else if (msg.type !== undefined && msg.key !== undefined && msg.value !== undefined && msg.type === 'addWriter') {
                                const adminEntry = await state.get(EntryType.ADMIN);
                                if (null === adminEntry || (adminEntry.tracPublicKey !== wallet.publicKey)) return;
                                const nodeEntry = await state.get(msg.value.pub);
                                const isAlreadyWriter = null !== nodeEntry && nodeEntry.isWriter;
                                const canAddWriter = state.isWritable() && !isAlreadyWriter;
                                if (msg.key === wallet.publicKey || !canAddWriter) return;
                                await handleIncomingEvent(msg);
                                network.#swarm.leavePeer(connection.remotePublicKey)
                            } else if (msg.type !== undefined && msg.key !== undefined && msg.value !== undefined && msg.type === 'removeWriter') {
                                const adminEntry = await state.get(EntryType.ADMIN);
                                if (null === adminEntry || (adminEntry.tracPublicKey !== wallet.publicKey)) return;
                                const nodeEntry = await state.get(msg.value.pub);
                                const isAlreadyWriter = null !== nodeEntry && nodeEntry.isWriter;
                                const canRemoveWriter = state.isWritable() && isAlreadyWriter
                                if (msg.key === wallet.publicKey || !canRemoveWriter) return;
                                await handleIncomingEvent(msg);
                                network.#swarm.leavePeer(connection.remotePublicKey)
                            } else if (msg.type !== undefined && msg.key !== undefined && msg.value !== undefined && msg.type === 'addAdmin') {
                                const adminEntry = await state.get(EntryType.ADMIN);
                                if (null === adminEntry || (adminEntry.tracPublicKey !== msg.key)) return;
                                await handleIncomingEvent(msg);
                                network.#swarm.leavePeer(connection.remotePublicKey)
                            }
                            else if (msg.type !== undefined && msg.key !== undefined && msg.value !== undefined && msg.type === 'whitelisted') {
                                await handleIncomingEvent(msg);
                                network.#swarm.leavePeer(connection.remotePublicKey)
                            } else {
                                if (state.isIndexer() || !state.isWritable()) return;

                                if (true !== network.disable_rate_limit) {
                                    const peer = b4a.toString(connection.remotePublicKey, 'hex');
                                    const _now = Date.now();

                                    if (_now - clean >= 120_000) {
                                        clean = _now;
                                        conns = {};
                                    }

                                    if (conns[peer] === undefined) {
                                        conns[peer] = { prev: _now, now: 0, tx_cnt: 0 }
                                    }

                                    conns[peer].now = _now;
                                    conns[peer].tx_cnt += 1;

                                    if (conns[peer].now - conns[peer].prev >= 60_000) {
                                        delete conns[peer];
                                    }

                                    if (conns[peer] !== undefined && conns[peer].now - conns[peer].prev >= 1000 && conns[peer].tx_cnt >= 50) {
                                        network.#swarm.leavePeer(connection.remotePublicKey);
                                        connection.end()
                                    }
                                }

                                if (network.tx_pool.length >= 1000) {
                                    console.log('pool full');
                                    return
                                }

                                if (b4a.byteLength(JSON.stringify(msg)) > 3072) return;

                                const parsedPreTx = msg;

                                if (network.check.sanitizePreTx(parsedPreTx) &&
                                    wallet.verify(b4a.from(parsedPreTx.is, 'hex'), b4a.from(parsedPreTx.tx + parsedPreTx.in), b4a.from(parsedPreTx.ipk, 'hex')) &&
                                    parsedPreTx.wp === wallet.publicKey &&
                                    null === await state.get(parsedPreTx.tx)
                                ) {
                                    const nonce = Wallet.generateNonce().toString('hex');
                                    const signature = wallet.sign(b4a.from(parsedPreTx.tx + nonce), b4a.from(wallet.secretKey, 'hex'));
                                    const append_tx = {
                                        op: OperationType.POST_TX,
                                        tx: parsedPreTx.tx,
                                        is: parsedPreTx.is,
                                        w: writingKey,
                                        i: parsedPreTx.i,
                                        ipk: parsedPreTx.ipk,
                                        ch: parsedPreTx.ch,
                                        in: parsedPreTx.in,
                                        bs: parsedPreTx.bs,
                                        mbs: parsedPreTx.mbs,
                                        ws: signature.toString('hex'),
                                        wp: wallet.publicKey,
                                        wn: nonce
                                    };
                                    network.tx_pool.push({ tx: parsedPreTx.tx, append_tx: append_tx });
                                }

                                network.#swarm.leavePeer(connection.remotePublicKey)
                            }
                        } catch (e) {
                            console.log(e);
                        }
                        finally {
                            network.#swarm.leavePeer(connection.remotePublicKey);
                        }
                    }
                })

                connection.messenger = message;

                connection.on('close', () => {
                    if (this.validator_stream === connection) {
                        this.validator_stream = null;
                        this.validator = null;
                    }
                    if (this.admin_stream === connection) {
                        this.admin_stream = null;
                        this.admin = null;
                    }

                    if (this.custom_stream === connection) {
                        this.custom_stream = null;
                        this.custom_node = null;
                    }

                    message_channel.close()
                });

                // must be called AFTER the protomux init above
                const stream = store.replicate(connection);
                wakeup.addStream(stream);

                connection.on('error', (error) => { });

            });

            this.#swarm.join(this.#channel, { server: true, client: true });
            await this.#swarm.flush();
        }
    }

    async pool(appendState) {
        while (!this.#shouldStopPool) {
            if (this.tx_pool.length > 0) {
                const length = this.tx_pool.length;
                const batch = [];
                for (let i = 0; i < length; i++) {
                    if (i >= 10) break;
                    batch.push({ type: OperationType.TX, key: this.tx_pool[i].tx, value: this.tx_pool[i].append_tx });
                }
                await appendState(batch);
                this.tx_pool.splice(0, batch.length);
            }
            await sleep(5);
        }
    }

    stopPool() {
        this.#shouldStopPool = true;
    }

    // TODO: AFTER WHILE LOOP SIGNAL TO THE PROCESS THAT VALIDATOR OBSERVER STOPPED OPERATING. 
    // OS CALLS, ACCUMULATORS, MAYBE THIS IS POSSIBLE TO CHECK I/O QUEUE IF IT COINTAIN IT. FOR NOW WE ARE USING SLEEP.
    async validatorObserver(get, publicKey) {
        console.log('Validator observer started');
        while (this.#enableValidatorObserver && this.#enable_wallet) {
            if (this.validator_stream !== null) {
                await sleep(1000);
                continue;
            }
            const lengthEntry = await get('wrl');
            const length = lengthEntry ?? 0;

            const findValidator = async () => {
                if (this.validator_stream !== null) return;

                const rndIndex = Math.floor(Math.random() * length);
                const wriEntry = await get('wri/' + rndIndex);
                if (this.validator_stream !== null || wriEntry === null) return;

                const validatorEntry = await get(wriEntry);
                if (
                    this.validator_stream !== null ||
                    this.validator !== null ||
                    validatorEntry === null ||
                    !validatorEntry.isWriter ||
                    validatorEntry.isIndexer
                ) return;

                const validatorPubKey = validatorEntry.pub;
                if (validatorPubKey === publicKey) return;

                console.log('Trying to connect to validator:', validatorPubKey);
                await this.tryConnection(validatorPubKey, 'validator');
            };

            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(findValidator());
                await sleep(250);
            }
            await Promise.all(promises);

            await sleep(1000);
        }
    }

    stopValidatorObserver() {
        this.#enableValidatorObserver = false;
    }

    async tryConnection(address, type = null) {
        if (null === this.#swarm) return null;
        if (this.validator_stream !== null && address !== b4a.toString(this.validator_stream.remotePublicKey, 'hex')) {
            this.#swarm.leavePeer(this.validator_stream.remotePublicKey);
            this.validator_stream = null;
            this.validator = null;
        }
        // trying to join a peer from the global swarm
        if (false === this.#swarm.peers.has(address)) {
            this.#swarm.joinPeer(b4a.from(address, 'hex'));
            let cnt = 0;
            while (false === this.#swarm.peers.has(address)) {
                if (cnt >= 1500) break;
                await sleep(10);
                cnt += 1;
            }
        }

        if (this.#swarm.peers.has(address)) {
            let stream;
            const peerInfo = this.#swarm.peers.get(address)
            stream = this.#swarm._allConnections.get(peerInfo.publicKey)

            if (stream !== undefined && stream.messenger !== undefined) {
                await this.#sendRequestByType(stream, type);
            }
        }
    }

    async #sendRequestByType(stream, type) {
        const waitFor = {
            validator: () => this.validator_stream,
            admin: () => this.admin_stream,
            node: () => this.custom_stream
        }[type];

        if (type === 'validator') {
            await stream.messenger.send('get_validator');
        } else if (type === 'admin') {
            await stream.messenger.send('get_admin');
        } else if (type === 'node') {
            await stream.messenger.send('get_node');
        } else {
            return;
        }
        await this.spinLock(() => !waitFor)
    };

    async spinLock(conditionFn, maxIterations = 1500, intervalMs = 10) {
        let counter = 0;
        while (conditionFn() && counter < maxIterations) {
            await sleep(intervalMs);
            counter++;
        }
    }

    async sendMessageToAdmin(adminEntry, message) {
        try {
            if (!adminEntry || !message) {
                return;
            }
            await this.tryConnection(adminEntry.tracPublicKey, 'admin');
            await this.spinLock(() => this.admin_stream === null);
            if (this.admin_stream !== null) {
                await this.admin_stream.messenger.send(message);
            }
        } catch (e) {
            console.log(e)
        }
    }

    async sendMessageToNode(address, message) {
        try {
            if (!address || !message) {
                return;
            }
            await this.tryConnection(address, 'node');

            await this.spinLock(() =>
                this.custom_stream === null || this.custom_node !== address
            );

            if (this.custom_stream !== null) {
                await this.custom_stream.messenger.send(message);
            }

        } catch (e) {
            console.log(e)
        }

    }
}
export default Network;