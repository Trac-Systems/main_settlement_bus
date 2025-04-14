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
import {sleep } from './utils/functions.js';
import MsgUtils from './utils/msgUtils.js';
import Check from './utils/check.js';
import DHT from "hyperdht";
const wakeup = new w();

class Network {
    constructor(base) {
        this.tx_pool = [];
        this.pool(base);
        this.check = new Check();
    }


    static async replicate(bootstrap, swarm, walletEnabled, store, wallet, channel, isStreaming, handleIncomingEvent, emit) {
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

            swarm = new Hyperswarm({ keyPair, bootstrap : bootstrap, maxPeers: MAX_PEERS, maxParallel: MAX_PARALLEL, maxServerConnections: MAX_SERVER_CONNECTIONS, maxClientConnections :  MAX_CLIENT_CONNECTIONS});

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

            const discovery = swarm.join(channel, { server: true, client: true });
            await swarm.flush();
            console.log('Joined channel');
            async function refresh(){
                await discovery.refresh();
                setTimeout(function(){
                    refresh();
                }, 30_000);
            }
            await refresh();
        }
        return swarm;
    }

    static async dhtServer(msb, dhtServer, base, wallet, writingKey, networkInstance){
        try{
            dhtServer.on('connection', function (connection) {
                connection.on('message', async (msg) =>  {
                    try{
                        msg = b4a.toString(msg, 'utf-8');
                        //console.log(msg);
                        msg = JSON.parse(msg);
                        if(null === msg) return;
                        if(msg === 'get_writer_key'){
                            await connection.send(b4a.from(JSON.stringify({op:'writer_key', key : writingKey})));
                            await connection.destroy();
                        } else if(msg.op !== undefined && msg.message !== undefined && msg.op === 'add_writer'){
                            await connection.destroy();
                            msg = msg.message;
                            const adminEntry = await msb.get(EntryType.ADMIN);
                            if(null === adminEntry || (adminEntry.tracPublicKey !== wallet.publicKey)) return;
                            const nodeEntry = await msb.get(msg.value.pub);
                            const isAlreadyWriter = null !== nodeEntry && nodeEntry.isWriter;
                            const isAllowedToRequestRole = await msb._isAllowedToRequestRole(msg.value.pub, adminEntry);
                            const canAddWriter = base.writable && !isAlreadyWriter && isAllowedToRequestRole;
                            if(msg.value.pub !== wallet.publicKey && canAddWriter){
                                await base.append(msg);
                            }
                        } else {
                            //await connection.destroy();
                            if (base.isIndexer || !base.writable) return;

                            // TODO: decide if a tx rejection should be responded with
                            if (networkInstance.tx_pool.length >= 1000) {
                                console.log('pool full');
                                return
                            }

                            if (b4a.byteLength(msg) > 3072) return;

                            const parsedPreTx = msg;

                            if (networkInstance.check.sanitizePreTx(parsedPreTx) &&
                                wallet.verify(b4a.from(parsedPreTx.is, 'hex'), b4a.from(parsedPreTx.tx + parsedPreTx.in), b4a.from(parsedPreTx.ipk, 'hex')) &&
                                parsedPreTx.wp === wallet.publicKey &&
                                null === await base.view.get(parsedPreTx.tx)
                            ) {
                                const nonce = MsgUtils.generateNonce();
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
                                networkInstance.tx_pool.push({ tx: parsedPreTx.tx, append_tx: append_tx });
                            }
                        }
                    }catch(e){
                        console.log(e);
                        try{ await connection.destroy(); }catch (e){}
                    }
                });
                connection.on('close', () => { });
                connection.on('error', (error) => { });
            })
            const keyPair = {
                publicKey: b4a.from(wallet.publicKey, 'hex'),
                secretKey: b4a.from(wallet.secretKey, 'hex')
            };
            await dhtServer.listen(keyPair)
            console.log('DHT node is listening on public key', wallet.publicKey);
        } catch(e) { console.log(e) }
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