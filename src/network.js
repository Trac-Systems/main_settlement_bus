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

const wakeup = new w();

class Network {
    constructor(base) {
        this.tx_pool = [];
        this.pool(base);
        this.check = new Check();
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

            swarm = new Hyperswarm({ keyPair, bootstrap : bootstrap, maxPeers: MAX_PEERS, maxParallel: MAX_PARALLEL, maxServerConnections: MAX_SERVER_CONNECTIONS, maxClientConnections :  MAX_CLIENT_CONNECTIONS});

            console.log(`Channel: ${b4a.toString(channel)}`);
            swarm.on('connection', async (connection) => {
                wakeup.addStream(connection);
                store.replicate(connection);
                connection.on('close', () => {});
                connection.on('error', (error) => { });

                if(enable_txchannel){
                    connection.on('message', async (msg) =>  {
                        try{
                            const tmp_message = msg;
                            msg = b4a.toString(msg, 'utf-8');
                            msg = JSON.parse(msg);

                            if(null === msg) return;
                            if(msg === 'get_writer_key'){
                                await connection.send(b4a.from(JSON.stringify({op:'writer_key', key : writingKey})));
                            } else if(msg.type !== undefined && msg.key !== undefined && msg.value !== undefined && msg.type === 'addWriter'){
                                const adminEntry = await msb.get(EntryType.ADMIN);
                                if (null === adminEntry || (adminEntry.tracPublicKey !== wallet.publicKey)) return;
                                const nodeEntry = await msb.get(msg.value.pub);
                                const isAlreadyWriter = null !== nodeEntry && nodeEntry.isWriter;
                                const isAllowedToRequestRole = await msb._isAllowedToRequestRole(msg.key, adminEntry);
                                const canAddWriter = base.writable && !isAlreadyWriter && isAllowedToRequestRole;
                                if (msg.key !== wallet.publicKey && canAddWriter) {
                                    await handleIncomingEvent(msg);
                                }
                            } else if (msg.type !== undefined && msg.key !== undefined && msg.value !== undefined && msg.type === 'removeWriter') {
                                const adminEntry = await msb.get(EntryType.ADMIN);
                                if (null === adminEntry || (adminEntry.tracPublicKey !== wallet.publicKey)) return;
                                const nodeEntry = await msb.get(msg.value.pub);
                                const isAlreadyWriter = null !== nodeEntry && nodeEntry.isWriter;
                                const canRemoveWriter = base.writable && isAlreadyWriter
                                if (msg.key !== wallet.publicKey && canRemoveWriter) {
                                    await handleIncomingEvent(msg);
                                }
                            }
                            else if (msg.type !== undefined && msg.key !== undefined && msg.value !== undefined && msg.type === 'addAdmin') {
                                const adminEntry = await msb.get(EntryType.ADMIN);
                                if (null === adminEntry || (adminEntry.tracPublicKey !== msg.key)) return;
                                await handleIncomingEvent(msg);

                            }
                            else {
                                if (base.isIndexer || !base.writable) return;

                                if(true !== disable_rate_limit)
                                {
                                    const peer = b4a.toString(connection.remotePublicKey, 'hex');
                                    const _now = Date.now();

                                    if(_now - clean >= 120_000) {
                                        clean = _now;
                                        conns = {};
                                    }

                                    if(conns[peer] === undefined){
                                        conns[peer] = { prev : _now, now: 0, tx_cnt : 0 }
                                    }

                                    conns[peer].now = _now;
                                    conns[peer].tx_cnt += 1;

                                    if(conns[peer].now - conns[peer].prev >= 60_000){
                                        delete conns[peer];
                                    }

                                    if(conns[peer] !== undefined && conns[peer].now - conns[peer].prev >= 1000 && conns[peer].tx_cnt >= 50){
                                        swarm.leavePeer(connection.remotePublicKey);
                                        connection.end()
                                    }
                                }

                                if (network.tx_pool.length >= 1000) {
                                    console.log('pool full');
                                    return
                                }

                                if (b4a.byteLength(tmp_message) > 3072) return;

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
                            }
                        } catch (e) {
                            console.log(e);
                        }
                    });
                }

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
        while (true) {
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
}

export default Network;