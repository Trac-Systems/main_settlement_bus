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
import { EventType } from '../../utils/constants.js';

// -- Debug Mode --
// TODO: Implement a better debug system in the future. This is just temporary.
const DEBUG = false;
const debugLog = (...args) => {
    if (DEBUG) {
        console.log('DEBUG [Network] ==> ', ...args);
    }
};

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
    #pendingConnections;
    #connectTimeoutMs;
    #maxPendingConnections;

    /**
     * @param {State} state
     * @param {object} config
     * @param {string} address
     **/
    constructor(state, config, address = null) {
        super();
        this.#config = config
        this.#connectTimeoutMs = config.connectTimeoutMs || 5000;
        this.#maxPendingConnections = config.maxPendingConnections || 50;

        this.#pendingConnections = new Map();
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

        this.setupNetworkListeners();

        this.transactionPoolService.start();
        this.validatorObserverService.start();
    }

    async _close() {
        console.log('Network: closing gracefully...');
        this.transactionPoolService.stopPool();
        await sleep(100);
        this.#validatorObserverService.stopValidatorObserver();
        await sleep(5_000);

        this.cleanupNetworkListeners();
        this.cleanupPendingConnections();

        if (this.#swarm !== null) {
            this.#swarm.destroy();
        }
    }

    setupNetworkListeners() {
        // VALIDATOR_CONNECTION_TIMEOUT
        this.on(EventType.VALIDATOR_CONNECTION_TIMEOUT, ({ publicKey, type, timeoutMs }) => {
            debugLog(`Network Event: VALIDATOR_CONNECTION_TIMEOUT | PublicKey: ${publicKey} | Type: ${type} | TimeoutMs: ${timeoutMs}`);
            this.#pendingConnections.delete(publicKey);
        });

        // VALIDATOR_CONNECTION_READY
        this.on(EventType.VALIDATOR_CONNECTION_READY, ({ publicKey, type, connection }) => {
            debugLog(`Network Event: VALIDATOR_CONNECTION_READY | PublicKey: ${publicKey} | Type: ${type}`);
            const { timeoutId } = this.#pendingConnections.get(publicKey);
            if (!timeoutId) return;

            clearTimeout(timeoutId);
            this.#pendingConnections.delete(publicKey);

            if (type === 'validator') {
                const target = b4a.from(publicKey, 'hex');
                this.#validatorConnectionManager.addValidator(target, connection);
                this.#sendRequestByType(connection, type);
            }
        });
    }

    cleanupNetworkListeners() {
        // connect:timeout
        this.removeAllListeners('connect:timeout');

        // connect:ready
        this.removeAllListeners('connect:ready');
    }

    cleanupPendingConnections() {
        for (const { timeoutId } of this.#pendingConnections.values()) {
            clearTimeout(timeoutId);
        }
        this.#pendingConnections.clear();
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

                const publicKey = b4a.toString(connection.remotePublicKey, 'hex');
                if (this.#pendingConnections.has(publicKey)) {
                    const { type } = this.#pendingConnections.get(publicKey);
                    await this.#finalizeConnection(publicKey, type, connection);
                }

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

    isConnectionPending(publicKey) {
        return this.#pendingConnections.has(publicKey);
    }

    pendingConnectionsCount() {
        return this.#pendingConnections.size;
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
        if (this.#pendingConnections.has(publicKey) || this.#pendingConnections.size >= this.#maxPendingConnections) {
            debugLog(`Network.tryConnect: Connection to peer: ${publicKey} as type: ${type} is already pending or max pending connections reached.`);
            return;
        }

        const timeoutId = setTimeout(() => {
            if (!this.#pendingConnections.has(publicKey)) return;
            this.emit(EventType.VALIDATOR_CONNECTION_TIMEOUT, { publicKey, type, timeoutMs: this.#connectTimeoutMs });
        }, this.#connectTimeoutMs);
        this.#pendingConnections.set(publicKey, { type, timeoutId });

        const target = b4a.from(publicKey, 'hex');
        if (!this.#swarm.peers.has(publicKey)) {
            this.#swarm.joinPeer(target);
        }

        const peerInfo = this.#swarm.peers.get(publicKey);
        if (peerInfo) {
            const connection = this.#swarm._allConnections.get(peerInfo.publicKey);
            if (connection && connection.messenger) {
                await this.#finalizeConnection(publicKey, type, connection);
            }
        }
    }

    async isConnected(publicKey) {
        return this.#swarm.peers.has(publicKey) &&
            this.#swarm.peers.get(publicKey).connectedTime != -1
    }

    async #finalizeConnection(publicKey, type, connection) {
        if (!this.#pendingConnections.has(publicKey)) return;
        this.emit(EventType.VALIDATOR_CONNECTION_READY, { publicKey, type, connection });
        debugLog(`Network.finalizeConnection: Connected to peer: ${publicKey} as type: ${type}`);
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
