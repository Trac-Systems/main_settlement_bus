import w from 'protomux-wakeup';
import b4a from 'b4a';
import Hyperswarm from 'hyperswarm';
import {
    EventType,
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

const wakeup = new w();

class Network {
    #shouldStopPool = false;
    constructor(base) {
        this.tx_pool = [];
        this.pool(base);
        this.check = new Check();
        this.admin_stream = null
        this.admin = null
        this.validator_stream = null
        this.validator = null;
        this.custom_stream = null;
        this.custom_node = null
    }

    static async replicate(disable_rate_limit, msb, network, enable_txchannel, base, writingKey, bootstrap, swarm, walletEnabled, store, wallet, channel, isStreaming, handleIncomingEvent, emit) {
        if (!swarm) {

            let keyPair;
            if (!walletEnabled) {
                keyPair = await store.createKeyPair(TRAC_NAMESPACE);
            } else {
                keyPair = {
                    publicKey: b4a.from(wallet.publicKey, 'hex'),
                    secretKey: b4a.from(wallet.secretKey, 'hex')
                };
            }

            let clean = Date.now();
            let conns = {};

            swarm = new Hyperswarm({ keyPair, bootstrap: bootstrap, maxPeers: MAX_PEERS, maxParallel: MAX_PARALLEL, maxServerConnections: MAX_SERVER_CONNECTIONS, maxClientConnections: MAX_CLIENT_CONNECTIONS });

            console.log(`Channel: ${b4a.toString(channel)}`);
            swarm.on('connection', async (connection) => {

                const mux = Protomux.from(connection)
                connection.userData = mux

                const message_channel = mux.createChannel({
                    protocol: b4a.toString(channel, 'utf8'),
                    onopen() {
                    },
                    onclose() {
                    }
                })
                message_channel.open()
                const message = message_channel.addMessage({
                    encoding: c.json,
                    async onmessage(msg) {
                        try {

                            if (msg === 'get_validator') {
                                const nonce = Wallet.generateNonce().toString('hex');
                                const _msg = {
                                    op: 'validator',
                                    key: writingKey,
                                    address: wallet.publicKey,
                                    channel: b4a.toString(channel, 'utf8')
                                };
                                const sig = wallet.sign(JSON.stringify(_msg) + nonce);
                                message.send({ response: _msg, sig, nonce })
                                swarm.leavePeer(connection.remotePublicKey)
                            } else if (msg === 'get_admin') {
                                const res = await msb.get(EntryType.ADMIN);
                                if (wallet.publicKey !== res.tracPublicKey) return;
                                const nonce = Wallet.generateNonce().toString('hex');
                                const _msg = {
                                    op: 'admin',
                                    key: writingKey,
                                    address: wallet.publicKey,
                                    channel: b4a.toString(channel, 'utf8')
                                };
                                const sig = wallet.sign(JSON.stringify(_msg) + nonce);
                                message.send({ response: _msg, sig, nonce })
                                swarm.leavePeer(connection.remotePublicKey)
                            } else if (msg === 'get_node') {

                                const nonce = Wallet.generateNonce().toString('hex');
                                const _msg = {
                                    op: 'node',
                                    key: writingKey,
                                    address: wallet.publicKey,
                                    channel: b4a.toString(channel, 'utf8')
                                };
                                const sig = wallet.sign(JSON.stringify(_msg) + nonce);
                                message.send({ response: _msg, sig, nonce })
                                swarm.leavePeer(connection.remotePublicKey)

                            } else if (msg.response !== undefined && msg.response.op !== undefined && msg.response.op === 'validator') {
                                const res = await msb.get(msg.response.address);
                                if (res === null) return;
                                const verified = wallet.verify(msg.sig, JSON.stringify(msg.response) + msg.nonce, msg.response.address)
                                if (verified && msg.response.channel === b4a.toString(channel, 'utf8') && network.validator_stream === null) {
                                    console.log('Validator stream established', msg.response.address)
                                    network.validator_stream = connection;
                                    network.validator = msg.response.address;
                                }
                                swarm.leavePeer(connection.remotePublicKey)
                            } else if (msg.response !== undefined && msg.response.op !== undefined && msg.response.op === 'admin') {
                                const res = await msb.get(EntryType.ADMIN);
                                if (res === null || res.tracPublicKey !== msg.response.address) return;
                                const verified = wallet.verify(msg.sig, JSON.stringify(msg.response) + msg.nonce, res.tracPublicKey)
                                if (verified && msg.response.channel === b4a.toString(channel, 'utf8')) {
                                    console.log('Admin stream established', res.tracPublicKey)
                                    network.admin_stream = connection;
                                    network.admin = res.tracPublicKey;
                                }
                                swarm.leavePeer(connection.remotePublicKey)
                            }
                            else if (msg.response !== undefined && msg.response.op !== undefined && msg.response.op === 'node') {

                                const verified = wallet.verify(msg.sig, JSON.stringify(msg.response) + msg.nonce, msg.response.address)
                                if (verified && msg.response.channel === b4a.toString(channel, 'utf8')) {

                                    console.log('Node stream established', msg.response.address)
                                    network.custom_stream = connection;
                                    network.custom_node = msg.response.address;
                                }
                                swarm.leavePeer(connection.remotePublicKey)
                            } else if (msg.type !== undefined && msg.key !== undefined && msg.value !== undefined && msg.type === 'addWriter') {
                                const adminEntry = await msb.get(EntryType.ADMIN);
                                if (null === adminEntry || (adminEntry.tracPublicKey !== wallet.publicKey)) return;
                                const nodeEntry = await msb.get(msg.value.pub);
                                const isAlreadyWriter = null !== nodeEntry && nodeEntry.isWriter;
                                const isAllowedToRequestRole = await msb._isAllowedToRequestRole(msg.key, adminEntry);
                                const canAddWriter = base.writable && !isAlreadyWriter && isAllowedToRequestRole;
                                if (msg.key !== wallet.publicKey && canAddWriter) {
                                    await handleIncomingEvent(msg);
                                }
                                swarm.leavePeer(connection.remotePublicKey)
                            } else if (msg.type !== undefined && msg.key !== undefined && msg.value !== undefined && msg.type === 'removeWriter') {
                                const adminEntry = await msb.get(EntryType.ADMIN);
                                if (null === adminEntry || (adminEntry.tracPublicKey !== wallet.publicKey)) return;
                                const nodeEntry = await msb.get(msg.value.pub);
                                const isAlreadyWriter = null !== nodeEntry && nodeEntry.isWriter;
                                const canRemoveWriter = base.writable && isAlreadyWriter
                                if (msg.key !== wallet.publicKey && canRemoveWriter) {
                                    await handleIncomingEvent(msg);
                                }
                                swarm.leavePeer(connection.remotePublicKey)
                            } else if (msg.type !== undefined && msg.key !== undefined && msg.value !== undefined && msg.type === 'addAdmin') {
                                const adminEntry = await msb.get(EntryType.ADMIN);
                                if (null === adminEntry || (adminEntry.tracPublicKey !== msg.key)) return;
                                await handleIncomingEvent(msg);
                                swarm.leavePeer(connection.remotePublicKey)
                            }
                            else if (msg.type !== undefined && msg.key !== undefined && msg.value !== undefined && msg.type === 'whitelisted') {
                                await handleIncomingEvent(msg);
                                swarm.leavePeer(connection.remotePublicKey)
                            } else {
                                if (base.isIndexer || !base.writable) return;

                                if (true !== disable_rate_limit) {
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
                                        swarm.leavePeer(connection.remotePublicKey);
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
                                    null === await base.view.get(parsedPreTx.tx)
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

                                swarm.leavePeer(connection.remotePublicKey)
                            }
                        } catch (e) {
                            console.log(e);
                        }
                    }
                })

                connection.messenger = message;

                connection.on('close', () => {
                    if (network.validator_stream === connection) {
                        network.validator_stream = null;
                        network.validator = null;
                    }
                    if (network.admin_stream === connection) {
                        network.admin_stream = null;
                        network.admin = null;
                    }

                    if (network.custom_stream === connection) {
                        network.custom_stream = null;
                        network.custom_node = null;
                    }

                    message_channel.close()
                });

                // must be called AFTER the protomux init above
                const stream = store.replicate(connection);
                stream.on('error', (error) => { });
                wakeup.addStream(stream);

                connection.on('error', (error) => { });

                if (!isStreaming) {
                    emit(EventType.READY_MSB);
                }
            });

            swarm.join(channel, { server: true, client: true });
            await swarm.flush();
        }
        return swarm;
    }

    async pool(base) {
        while (!this.#shouldStopPool) {
            if (this.tx_pool.length > 0) {
                const length = this.tx_pool.length;
                const batch = [];
                for (let i = 0; i < length; i++) {
                    if (i >= 10) break;
                    batch.push({ type: OperationType.TX, key: this.tx_pool[i].tx, value: this.tx_pool[i].append_tx });
                }
                await base.append(batch);
                this.tx_pool.splice(0, batch.length);
            }
            await sleep(5);
        }
    }

    stopPool() {
        this.#shouldStopPool = true;
    }
}
export default Network;