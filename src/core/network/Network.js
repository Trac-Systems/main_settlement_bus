import ReadyResource from 'ready-resource';
import Hyperswarm from 'hyperswarm';
import w from 'protomux-wakeup';
import b4a from 'b4a';
import Wallet from 'trac-wallet';

import ApplyOperationEncodings from '../state/ApplyOperationEncodings.js';
import PoolService from './services/PoolService.js';
import NetworkMessages from './messaging/NetworkMessages.js';
import { sleep } from '../../utils/helpers.js';
import {
    TRAC_NAMESPACE,
    MAX_PEERS,
    MAX_PARALLEL,
    MAX_SERVER_CONNECTIONS,
    MAX_CLIENT_CONNECTIONS,
    NETWORK_MESSAGE_TYPES,
    DHT_BOOTSTRAPS
} from '../../utils/constants.js';

const wakeup = new w();

class Network extends ReadyResource {
    #dht_bootstrap = DHT_BOOTSTRAPS;
    #swarm = null;
    #enableValidatorObserver;
    #enable_wallet;
    #channel;
    #networkMessages;
    #poolService;

    constructor(state, channel, options = {}) {
        super();
        this.#enableValidatorObserver = options.enableValidatorObserver !== undefined ? options.enableValidatorObserver : true;
        this.#enable_wallet = options.enable_wallet !== false;
        this.#channel = channel;
        this.#poolService = new PoolService(state)
        this.#networkMessages = new NetworkMessages(this, options);
        //TODO: move streams maybe to HASHMAP? To discuss because this change will affect the whole network module and it's usage. It is not a priority right now
        //However, it gives us more flexibility in the future, because we can create set of streams. Maybe in this case exist better data structure?
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

    get channel() {
        return this.#channel;
    }

    get poolService() {
        return this.#poolService;
    }

    async _open() {
        console.log('Network initialization...');
        this.poolService.start();
    }

    async _close() {
        console.log('Network: closing gracefully...');
        this.poolService.stopPool();
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
        state,
        store,
        wallet,
        handleIncomingEvent,
    ) {
        if (!this.#swarm) {
            const keyPair = await this.initializeNetworkingKeyPair(store, wallet);
            this.#swarm = new Hyperswarm({
                keyPair,
                bootstrap: this.#dht_bootstrap,
                maxPeers: MAX_PEERS,
                maxParallel: MAX_PARALLEL,
                maxServerConnections: MAX_SERVER_CONNECTIONS,
                maxClientConnections: MAX_CLIENT_CONNECTIONS
            });

            console.log(`Channel: ${b4a.toString(this.#channel)}`);
            this.#networkMessages.initializeMessageRouter(state, wallet, handleIncomingEvent);

            this.#swarm.on('connection', async (connection) => {
                const { message_channel, message } = this.#networkMessages.setupProtomuxMessages(connection);
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

                // ATTENTION: Must be called AFTER the protomux init above
                const stream = store.replicate(connection);
                wakeup.addStream(stream);

                connection.on('error', (error) => {
                    //TODO: handle error
                });

            });

            this.#swarm.join(this.#channel, { server: true, client: true });
            await this.#swarm.flush();
        }
    }

    async initializeNetworkingKeyPair(store, wallet) {
        if (!this.#enable_wallet) {
            const keyPair = await store.createKeyPair(TRAC_NAMESPACE);
            return keyPair;
        } else {
            const keyPair = {
                publicKey: wallet.publicKey,
                secretKey: wallet.secretKey
            };
            return keyPair;
        }
    }
    
    //TODO: Move this as a new service
    // TODO: AFTER WHILE LOOP SIGNAL TO THE PROCESS THAT VALIDATOR OBSERVER STOPPED OPERATING. 
    // OS CALLS, ACCUMULATORS, MAYBE THIS IS POSSIBLE TO CHECK I/O QUEUE IF IT COINTAIN IT. FOR NOW WE ARE USING SLEEP.
    //TODO fix finding validators and specific node
    async validatorObserver(getWriterLength, getWriterIndex, getNodeEntry, addresss) {
        //TODO: we should throw an error instead of returning null
        try {
            console.log('Validator observer started');
            while (this.#enableValidatorObserver && this.#enable_wallet) {
                if (this.validator_stream !== null) {
                    await sleep(1000);
                    continue;
                }
                const lengthEntry = await getWriterLength();
                const length = lengthEntry ?? 0;
                
                const findValidator = async () => {
                    if (this.validator_stream !== null) return;
                    const rndIndex = Math.floor(Math.random() * length);
                    const validatorAddressBuffer = await getWriterIndex(rndIndex);

                    if (validatorAddressBuffer === null || b4a.byteLength(validatorAddressBuffer) !== ApplyOperationEncodings.TRAC_ADDRESS_SIZE) return;

                    const validatorAddress = ApplyOperationEncodings.bufferToAddress(validatorAddressBuffer);
                    if (validatorAddress === addresss) return;

                    const validatorPubKey = Wallet.decodeBech32m(validatorAddress).toString('hex');
                    const validatorEntry = await getNodeEntry(validatorAddress);

                    if (
                        this.validator_stream !== null ||
                        this.validator !== null ||
                        validatorEntry === null ||
                        !validatorEntry.isWriter ||
                        validatorEntry.isIndexer
                    ) return;

                    await this.tryConnect(validatorPubKey, 'validator');
                };

                const promises = [];
                for (let i = 0; i < 10; i++) {
                    promises.push(findValidator());
                    await sleep(250);
                }
                await Promise.all(promises);
                await sleep(1000);
            }
        } catch (e) {
            console.log('Error in validatorObserver:', e);
        }
    }

    stopValidatorObserver() {
        this.#enableValidatorObserver = false;
    }

    async tryConnect(publicKey, type = null) {
        //TODO: we should throw an error instead of returning null
        if (null === this.#swarm) return null;

        if (this.validator_stream !== null && publicKey !== b4a.toString(this.validator_stream.remotePublicKey, 'hex')) {
            this.#swarm.leavePeer(this.validator_stream.remotePublicKey);
            this.validator_stream = null;
            this.validator = null;
        }
        // trying to join a peer from the global swarm

        if (false === this.#swarm.peers.has(publicKey)) {
            this.#swarm.joinPeer(b4a.from(publicKey, 'hex'));
            let cnt = 0;
            while (false === this.#swarm.peers.has(publicKey)) {
                if (cnt >= 1500) break;
                await sleep(10);
                cnt += 1;
            }
        }

        if (this.#swarm.peers.has(publicKey)) {
            let stream;
            const peerInfo = this.#swarm.peers.get(publicKey)
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
            await stream.messenger.send(NETWORK_MESSAGE_TYPES.GET.VALIDATOR);
        } else if (type === 'admin') {
            await stream.messenger.send(NETWORK_MESSAGE_TYPES.GET.ADMIN);
        } else if (type === 'node') {
            await stream.messenger.send(NETWORK_MESSAGE_TYPES.GET.NODE);
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
                throw new Error('Invalid admin entry or message');
            }
            const adminPublicKey = Wallet.decodeBech32m(adminEntry.tracAddr).toString('hex');
            await this.tryConnect(adminPublicKey, 'admin');
            await this.spinLock(() => this.admin_stream === null);
            if (this.admin_stream !== null) {
                await this.admin_stream.messenger.send(message);
            }
        } catch (e) {
            console.log(e)
        }
    }

    async sendMessageToNode(nodePublicKey, message) {
        try {
            if (!nodePublicKey || !message) {
                return;
            }
            await this.tryConnect(nodePublicKey, 'node');

            await this.spinLock(() =>
                this.custom_stream === null ||
                !b4a.equals(this.custom_node, b4a.from(nodePublicKey, 'hex'))
            );
            if (
                this.custom_stream !== null &&
                this.custom_node !== null &&
                b4a.equals(this.custom_node, b4a.from(nodePublicKey, 'hex'))
            ) {
                await this.custom_stream.messenger.send(message);
            } else {
                throw new Error(`Failed to send message to node: ${nodePublicKey}`);
            }

        } catch (e) {
            console.log(e)
        }
    }
}
export default Network;