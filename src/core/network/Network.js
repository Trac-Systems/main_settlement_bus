import ReadyResource from 'ready-resource';
import Hyperswarm from 'hyperswarm';
import w from 'protomux-wakeup';
import b4a from 'b4a';
import TransactionPoolService from './services/TransactionPoolService.js';
import ValidatorObserverService from './services/ValidatorObserverService.js';
import NetworkMessages from './messaging/NetworkMessages.js';
import { sleep } from '../../utils/helpers.js';
import {
    TRAC_NAMESPACE,
    MAX_PEERS,
    MAX_PARALLEL,
    MAX_SERVER_CONNECTIONS,
    MAX_CLIENT_CONNECTIONS,
    NETWORK_MESSAGE_TYPES
} from '../../utils/constants.js';
import ConnectionManager from './services/ConnectionManager.js';
import MessageOrchestrator from './services/MessageOrchestrator.js';
import NetworkWalletFactory from './identity/NetworkWalletFactory.js';

const wakeup = new w();

class Network extends ReadyResource {
    #swarm = null;
    #networkMessages;
    #transactionPoolService;
    #validatorObserverService;
    #validatorConnectionManager;
    #validatorMessageOrchestrator;
    #config;
    #identityProvider = null;

    /**
     * @param {State} state
     * @param {object} config
     * @param {string} address
     **/
    constructor(state, config, address = null) {
        super();
        this.#config = config

        this.#transactionPoolService = new TransactionPoolService(state, address, this.#config);
        this.#validatorObserverService = new ValidatorObserverService(this, state, address, this.#config);
        this.#networkMessages = new NetworkMessages(this, this.#config);
        this.#validatorConnectionManager = new ConnectionManager(this.#config);
        this.#validatorMessageOrchestrator = new MessageOrchestrator(this.#validatorConnectionManager, state, this.#config);
        this.admin_stream = null;
        this.admin = null;
        this.validator = null;
        this.custom_stream = null;
        this.custom_node = null;
    }

    get swarm() {
        return this.#swarm;
    }

    get transactionPoolService() {
        return this.#transactionPoolService;
    }

    get validatorObserverService() {
        return this.#validatorObserverService;
    }

    get validatorConnectionManager() {
        return this.#validatorConnectionManager;
    }

    get validatorMessageOrchestrator() {
        return this.#validatorMessageOrchestrator;
    }

    async _open() {
        console.log('Network initialization...');
        this.transactionPoolService.start();
        this.validatorObserverService.start();
    }

    async _close() {
        console.log('Network: closing gracefully...');
        this.transactionPoolService.stopPool();
        await sleep(100);
        this.#validatorObserverService.stopValidatorObserver();
        await sleep(5_000);

        if (this.#swarm !== null) {
            this.#swarm.destroy();
        }
    }

    async replicate(
        state,
        store,
        wallet,
    ) {
        if (!this.#swarm) {
            const keyPair = await this.initializeNetworkingKeyPair(store, wallet);
            const wrappedWallet = this.#getNetworkWalletWrapper(wallet, keyPair);
            this.#swarm = new Hyperswarm({
                keyPair,
                bootstrap: this.#config.dhtBootstrap,
                maxPeers: MAX_PEERS,
                maxParallel: MAX_PARALLEL,
                maxServerConnections: MAX_SERVER_CONNECTIONS,
                maxClientConnections: MAX_CLIENT_CONNECTIONS
            });

            console.log(`Channel: ${b4a.toString(this.#config.channel)}`);
            this.#networkMessages.initializeMessageRouter(state, wrappedWallet);

            this.#swarm.on('connection', async (connection) => {
                const { message_channel, message } = await this.#networkMessages.setupProtomuxMessages(connection);
                connection.messenger = message;

                // ATTENTION: Must be called AFTER the protomux init above
                const stream = store.replicate(connection);
                wakeup.addStream(stream);

                connection.on('close', () => {
                    if (this.admin_stream === connection) {
                        this.admin_stream = null;
                        this.admin = null;
                    }

                    if (this.custom_stream === connection) {
                        this.custom_stream = null;
                        this.custom_node = null;
                    }
                    try { message_channel.close() } catch (e) { }

                });

                connection.on('error', (error) => {
                    if (
                        error && error.message && (
                            error.message.includes('connection reset by peer') ||
                            error.message.includes('Duplicate connection') ||
                            error.message.includes('connection timed out'))
                    ) {
                        // TODO: decide if we want to handle this error in a specific way. It generates a lot of logs.
                        return;
                    }
                    console.error(error.message)

                });

            });

            this.#swarm.join(this.#config.channel, { server: true, client: true });
            this.#swarm.flush();
        }
    }

    async initializeNetworkingKeyPair(store, wallet) {
        if (!this.#config.enableWallet) {
            return await store.createKeyPair(TRAC_NAMESPACE);
        } else {
            return {
                publicKey: wallet.publicKey,
                secretKey: wallet.secretKey
            };
        }
    }

    async tryConnect(publicKey, type = null) {
        if (this.#swarm === null) throw new Error('Network swarm is not initialized');

        const target = b4a.from(publicKey, 'hex');
        if (!this.#swarm.peers.has(publicKey)) {
            this.#swarm.joinPeer(target);
            let cnt = 0;
            while (!this.#swarm.peers.has(publicKey) && cnt < 1500) { // TODO: Get rid of the magic number and add a config option for this
                await sleep(10);
                cnt += 1;
            }
        }

        const peerInfo = this.#swarm.peers.get(publicKey);
        if (!peerInfo) return;

        // Wait for the swarm to establish the connection and for protomux to attach
        let stream = this.#swarm._allConnections.get(peerInfo.publicKey);
        let attempts = 0;
        while ((!stream || !stream.messenger) && attempts < 1500) { // TODO: Get rid of the magic number and add a config option
            await sleep(10);
            attempts += 1;
            stream = this.#swarm._allConnections.get(peerInfo.publicKey);
        }
        if (!stream || !stream.messenger) return;

        if (type === 'validator') {
            this.#validatorConnectionManager.addValidator(target, stream);
        }
        await this.#sendRequestByType(stream, type);
    }

    async isConnected(publicKey) {
        return this.#swarm.peers.has(publicKey) &&
            this.#swarm.peers.get(publicKey).connectedTime != -1
    }

    async #sendRequestByType(stream, type) {
        const waitFor = {
            validator: () => this.validatorConnectionManager.connectionCount(),
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
        await this.spinLock(() => !waitFor())
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

    #getNetworkWalletWrapper(wallet, keyPair) {
        if (!this.#identityProvider) {
            this.#identityProvider = NetworkWalletFactory.provide({
                enableWallet: this.#config.enableWallet,
                wallet,
                keyPair,
                networkPrefix: this.#config.addressPrefix
            });
        }
        return this.#identityProvider;
    }

}

export default Network;
