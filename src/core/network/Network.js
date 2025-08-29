import ReadyResource from 'ready-resource';
import Hyperswarm from 'hyperswarm';
import w from 'protomux-wakeup';
import b4a from 'b4a';
import Wallet from 'trac-wallet';

import PoolService from './services/PoolService.js';
import ValidatorObserverService from './services/ValidatorObserverService.js';
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
    #enable_wallet;
    #channel;
    #networkMessages;
    #poolService;
    #validatorObserverService;

    constructor(state, channel, options = {}) {
        super();
        this.#enable_wallet = options.enable_wallet !== false;
        this.#channel = channel;
        this.#poolService = new PoolService(state)
        this.#validatorObserverService = new ValidatorObserverService(this, state, options)
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

    get validatorObserverService() {
        return this.#validatorObserverService;
    }

    async _open() {
        console.log('Network initialization...');
        this.poolService.start();
    }

    async _close() {
        console.log('Network: closing gracefully...');
        this.poolService.stopPool();
        await sleep(100);

        if (this.#validatorObserverService.enable_validator_observer) {
            this.#validatorObserverService.stopValidatorObserver();
        }

        await sleep(5_000);

        if (this.#swarm !== null) {
            this.#swarm.destroy();
        }
    }

    startValidatorObserver(address) {
        this.#validatorObserverService.startValidatorObserver();
        this.#validatorObserverService.validatorObserver(address);
    }

    async replicate(
        state,
        store,
        wallet,
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
            this.#networkMessages.initializeMessageRouter(state, wallet);

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
                    if (
                        error && error.message && (
                            error.message.includes('connection reset by peer') ||
                            error.message.includes('Duplicate connection')
                        )
                    ) {
                        // TODO: decide if we want to handle this error in a specific way. It generates a lot of logs.
                        return;
                    }
                    console.error(error.message)

                });

            });

            this.#swarm.join(this.#channel, { server: true, client: true });
            await this.#swarm.flush();
        }
    }

    async initializeNetworkingKeyPair(store, wallet) {
        if (!this.#enable_wallet) {
            return await store.createKeyPair(TRAC_NAMESPACE);
        } else {
            return {
                publicKey: wallet.publicKey,
                secretKey: wallet.secretKey
            };
        }
    }

    async tryConnect(publicKey, type = null) {
        
        if (null === this.#swarm) throw new Error('Network swarm is not initialized');

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

    async isConnected(publicKey) {
        return this.#swarm.peers.has(publicKey) && 
                this.#swarm.peers.get(publicKey).connectedTime != -1
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
