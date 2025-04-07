import w from 'protomux-wakeup';
import b4a from 'b4a';
import Hyperswarm from 'hyperswarm';
import { EventType, TRAC_NAMESPACE, MAX_PEERS, MAX_PARALLEL, MAX_SERVER_CONNECTIONS, OperationType } from './utils/constants.js';
import {sleep } from './utils/functions.js';
import MsgUtils from './utils/msgUtils.js';
import Check from './utils/check.js';
const wakeup = new w();

class Network {
    constructor(base) {
        this.tx_pool = [];
        this.pool(base);
        this.check = new Check();
    }


    static async replicate(swarm, walletEnabled, store, wallet, channel, isStreaming, handleIncomingEvent, emit) {
        if (!swarm) {
            let keyPair;
            if (!walletEnabled) {
                keyPair = await store.createKeyPair(TRAC_NAMESPACE);
            }

            keyPair = {
                publicKey: b4a.from(wallet.publicKey, 'hex'),
                secretKey: b4a.from(wallet.secretKey, 'hex')
            };

            swarm = new Hyperswarm({ keyPair, maxPeers: MAX_PEERS, maxParallel: MAX_PARALLEL, maxServerConnections: MAX_SERVER_CONNECTIONS });

            console.log(`Channel: ${b4a.toString(channel)}`);
            swarm.on('connection', async (connection) => {

                wakeup.addStream(connection);
                store.replicate(connection);
                connection.on('close', () => { });
                connection.on('error', (error) => { });
                connection.on('data', async (data) => {
                    await handleIncomingEvent(data);
                });

                if (!isStreaming) {
                    emit(EventType.READY_MSB);
                }
            });

            const channelBuffer = channel;
            swarm.join(channelBuffer, { server: true, client: true });
            await swarm.flush();
            console.log('Joined channel for peer discovery');
        }
        return swarm;
    }

    static async txChannel(tx_swarm, tx_channel, base, wallet, writingKey, networkInstance) {
        if (!tx_swarm) {
            tx_swarm = new Hyperswarm({ maxPeers: 1024, maxParallel: 512, maxServerConnections: 256 });
            tx_swarm.on('connection', async (connection, peerInfo) => {

                connection.on('close', () => { });
                connection.on('error', (error) => { });
                connection.on('data', async (msg) => {

                    if (base.isIndexer) return;

                    // TODO: decide if a tx rejection should be responded with
                    if (networkInstance.tx_pool.length >= 1000) {
                        console.log('pool full');
                        return
                    }

                    if (b4a.byteLength(msg) > 3072) return;

                    try {

                        const parsedPreTx = JSON.parse(msg);
                        
                        if (networkInstance.check.preTx(parsedPreTx) &&
                            wallet.verify(b4a.from(parsedPreTx.is, 'hex'), b4a.from(parsedPreTx.tx + parsedPreTx.in), b4a.from(parsedPreTx.ipk, 'hex')) &&
                            parsedPreTx.w === writingKey &&
                            null === await base.view.get(parsedPreTx.tx)
                        ) {
                            const nonce = MsgUtils.generateNonce();
                            const signature = wallet.sign(b4a.from(parsedPreTx.tx + nonce), b4a.from(wallet.secretKey, 'hex'));
                            const append_tx = {
                                op: OperationType.POST_TX,
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
                                wp: wallet.publicKey,
                                wn: nonce
                            };
                            networkInstance.tx_pool.push({ tx: parsedPreTx.tx, append_tx: append_tx });
                        }
                    } catch (e) {
                        //console.log(e)
                    }
                });

            });

            const channelBuffer = tx_channel;
            tx_swarm.join(channelBuffer, { server: true, client: true });
            await tx_swarm.flush();
            console.log('Joined MSB TX channel');
        }
        return tx_swarm;
    }

    async pool(base) {
        while (true) {
            if (this.tx_pool.length > 0) {
                const length = this.tx_pool.length;
                const batch = [];
                for (let i = 0; i < length; i++) {
                    if(i >= 100) break;
                    batch.push({ type: OperationType.TX, key: this.tx_pool[i].tx, value: this.tx_pool[i].append_tx });
                }
                await base.append(batch);
                this.tx_pool.splice(0, batch.length);
            }
            await sleep(10);
        }
    }
}

export default Network;