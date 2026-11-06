import ReadyResource from 'ready-resource';
import Hyperswarm from 'hyperswarm';
import w from 'protomux-wakeup';
import b4a from 'b4a';
import TransactionPoolService from './services/TransactionPoolService.js';
import ValidatorObserverService from './services/ValidatorObserverService.js';
import ValidatorMessages from './protocols/validators/ValidatorMessages.js';
import { sleep } from '../../utils/helpers.js';
import { TRAC_NAMESPACE, CONNECTION_STATUS } from '../../utils/constants.js';
import ValidatorConnectionManager from './services/ValidatorConnectionManager.js';
import ValidatorMessageOrchestrator from './services/ValidatorMessageOrchestrator.js';
import TransactionRateLimiterService from './services/TransactionRateLimiterService.js';
import ValidatorPendingRequestService from './protocols/validators/v1/ValidatorPendingRequestService.js';
import TransactionCommitService from "./services/TransactionCommitService.js";
import EpochCoordinatorService from '../consensus/services/EpochCoordinatorService.js';
import IndexerConnectionManager from './services/IndexerConnectionManager.js';
import { Logger } from '../../utils/logger.js';
import { WalletProvider } from 'trac-wallet';
import { CustomEventType } from '../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api'
import IndexerMessages from './protocols/consensus/IndexerMessages.js';
import IndexerPendingRequestService from './protocols/consensus/v1/IndexerPendingRequestService.js';
import { createEpochAppenderSelector } from '../consensus/epochAppenderSelection/createEpochAppenderSelector.js';

const wakeup = new w();

class Network extends ReadyResource {
    #swarm;
    #transactionPoolService;
    #validatorObserverService;
    #validatorConnectionManager;
    #validatorMessageOrchestrator;
    #config;
    #pendingConnections;
    #rateLimiter;
    #validatorPendingRequestService;
    #transactionCommitService;
    #wallet;
    #epochCoordinatorService;
    #logger;
    #state;
    #store;
    #indexerPendingRequestService;
    #validatorMessages;
    #indexerMessages;
    #indexerConnectionManager;
    #consensusPeerBanRequestedListener;
    #epochAppenderSelector;
    #closing = false;

    /**
     * @param {State} state
     * @param {object} store
     * @param {Config} config
     * @param {object} address
     **/
    constructor(state, store, config, wallet = null) {
        super();

        this.#config = config
        this.#state = state
        this.#store = store
        this.#wallet = wallet
        this.#pendingConnections = new Map();
        this.#transactionCommitService = new TransactionCommitService(this.#config);
        this.#transactionPoolService = new TransactionPoolService(state, wallet?.address, this.#transactionCommitService ,this.#config);
        this.#validatorObserverService = new ValidatorObserverService(this, state, wallet?.address, this.#config);
        this.#validatorPendingRequestService = new ValidatorPendingRequestService(this.#config);
        this.#indexerPendingRequestService = new IndexerPendingRequestService(this.#config);
        this.#logger = new Logger(this.#config);
        this.#consensusPeerBanRequestedListener = this.#handleConsensusPeerBanRequested.bind(this);
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

    get indexerConnectionManager() {
        return this.#indexerConnectionManager;
    }

    async _open() {
        this.#logger.info('Network initialization...');        

        this.#assertCanReplicate();
        const { wallet: wrappedWallet, keyPair } = await this.#getOrGenerateWallet();
        this.#assertCanReplicate();
        this.#wallet = wrappedWallet

        // Recover durable votes before starting network resources.
        this.#epochAppenderSelector = createEpochAppenderSelector(
            this.#state,
            this.#wallet,
            this.#config,
            () => this.#indexerConnectionManager,
            this.#logger,
            this.#indexerPendingRequestService
        );
        await this.#epochAppenderSelector.open();
        this.#assertCanReplicate();
        this.transactionPoolService.start();

        this.#swarm = new Hyperswarm({
            keyPair,
            bootstrap: this.#config.dhtBootstrap,
            maxPeers: this.#config.maxPeers,
            maxParallel: this.#config.maxParallel,
            maxServerConnections: this.#config.maxServerConnections,
            maxClientConnections: this.#config.maxClientConnections
        });

        this.#rateLimiter = new TransactionRateLimiterService(this.#swarm, this.#config);
        this.#validatorMessages = new ValidatorMessages(
            this.#state,
            this.#wallet,
            this.#rateLimiter,
            this.#transactionPoolService,
            this.#validatorPendingRequestService,
            this.#transactionCommitService,
            this.#config
        );

        this.#validatorConnectionManager = new ValidatorConnectionManager(this.#config.maxValidators, this.#config, this.#logger, this.#validatorMessages);
        await this.#validatorConnectionManager.ready();

        this.#validatorMessageOrchestrator = new ValidatorMessageOrchestrator(this.#validatorConnectionManager, this.#state, this.#config, this.#wallet);

        this.#indexerMessages = new IndexerMessages(
            this.#state, this.#wallet, this.#config, this.#indexerPendingRequestService,
            this.#handleConsensusSessionClosed.bind(this), this.#epochAppenderSelector,
        );

        const indexerCount = await this.#state.indexerCount();
        this.#indexerConnectionManager = new IndexerConnectionManager(
            indexerCount,
            this.#config,
            this.#logger,
            this.#indexerMessages,
            this.#state,
            this,
            this.#wallet,
        );
        await this.#indexerConnectionManager.ready();

        this.#epochCoordinatorService = new EpochCoordinatorService(
            this.#state, this.#wallet, this.#config, this.#indexerConnectionManager, this.#epochAppenderSelector,
        );
        await this.#epochCoordinatorService.ready();
        this.#assertCanReplicate();

        this.#logger.info(`Channel: ${b4a.toString(this.#config.channel)}`);
        this.#listeners();

        this.#swarm.join(this.#config.channel, { server: true, client: true });
        this.#swarm.flush();
        this.validatorObserverService.start();

        if (this.#state.isIndexer()) {
            if (await this.#state.getCurrentEpoch() !== null) {
                this.#epochCoordinatorService.start();
            }
        }
    }

    async _close() {
        this.#logger.info('Network: closing gracefully...');
        this.#closing = true;
        this.#state.off(CustomEventType.CONSENSUS_PEER_BAN_REQUESTED, this.#consensusPeerBanRequestedListener);
        await this.#epochCoordinatorService.close();
        await this.#epochAppenderSelector.close();
        await this.transactionPoolService.stop();
        await sleep(100);
        await this.#validatorObserverService.stop();

        this.cleanupPendingConnections();
        this.#validatorPendingRequestService.close();
        this.#transactionCommitService.close();
        this.#indexerPendingRequestService.close();
        await this.#indexerConnectionManager.close();
        await this.#validatorConnectionManager.close()
        const swarm = this.#swarm;
        if (swarm) {
            swarm.removeAllListeners('connection');
            await swarm.destroy();
            if (this.#swarm === swarm) this.#swarm = null;
        }
    }

    #handleConsensusSessionClosed(connection) {
        this.#indexerConnectionManager.remove(connection.remotePublicKey, connection);
    }

    #prepareConnection(connection) {
        this.#assertCanReplicate();
        connection.protocolSessions = {};
        const stream = this.#store.replicate(connection);
        wakeup.addStream(stream);
    }

    #listeners() {
        this.#state.on(CustomEventType.CONSENSUS_PEER_BAN_REQUESTED, this.#consensusPeerBanRequestedListener);
        this.#state.on(CustomEventType.IS_INDEXER, async (publicKey) => {
            const publicKeyHex = this.#normalizePublicKey(publicKey);
            this.#validatorConnectionManager.remove(publicKeyHex);
            const indexerCount = await this.#state.indexerCount();
            this.#indexerConnectionManager.setMax(indexerCount - 1);
        });

        this.#state.on(CustomEventType.UNWRITABLE, (publicKey) => {
            this.disconnectValidatorPeer(publicKey, 'peer became unwritable');
        });

        this.#state.on(CustomEventType.IS_INDEXER, async bufferAddress => {
            const address = tracCryptoApi.address.encode(this.#config.addressPrefix, bufferAddress);
            if (address === this.#wallet.address) {
                if (await this.#state.getCurrentEpoch() !== null) {
                    this.#epochCoordinatorService.start();
                }
            }
        });

        this.#state.on(CustomEventType.IS_NON_INDEXER, async (bufferAddress) => {
            const address = tracCryptoApi.address.encode(this.#config.addressPrefix, bufferAddress);
            if (address === this.#wallet.address) {
                await this.#epochCoordinatorService.stop();
            } else {
                this.#indexerConnectionManager.remove(bufferAddress);
                const indexerCount = await this.#state.indexerCount();
                this.#indexerConnectionManager.setMax(indexerCount - 1);
            }
        });

        this.#state.on(CustomEventType.GENESIS_EPOCH_CREATED, () => {
            if (this.#state.isIndexer()) {
                this.#epochCoordinatorService.start();
            }
        });

        this.#swarm.prependListener('connection', async (connection) => {
            if (this.#closing || this.closed) {
                this.#destroyConnection(connection);
                return;
            }
            // A handshake accepted before a ban can finish after the ban was applied.
            if (this.#isPeerBanned(connection.remotePublicKey)) {
                connection.destroy();
                return;
            }

            /*
             Here is the issue:
             
             The current session is supposed to be attached as soon as possible (mostly to respond to probe since there is no connection ready signal on this level)
             Since the connection was started from the other side, this havent gone through "qualification" which happens on tryConnect.
             Because of that, we need to assume the current connection is that of a validator (who responds to probe) and later override it if necessary.
             This is leaky for two reasons: first we need to keep a reference to messages and disclose the connection structure in this class.
             second is that the protocol itself doesnt fit the connection life-cycle (this is a bigger problem that also touched on DHT factory structure being "swallowed by swarm")
             */
            const publicKey = b4a.toString(connection.remotePublicKey, 'hex');

            connection.on('close', () => {
                this.#rejectAllPendingRequests(publicKey, new Error('Connection closed before response'));
                this.#swarm?.leavePeer(connection.remotePublicKey);
                this.#validatorConnectionManager.remove(publicKey, connection);
                this.#closeProtocolSessions(connection);
            });

            connection.on('error', (error) => {
                this.#rejectAllPendingRequests(publicKey, error ?? new Error('Connection error before response'));
                if (
                    error && error.message && (
                        error.message.includes('connection reset by peer') ||
                        error.message.includes('Duplicate connection') ||
                        error.message.includes('connection timed out'))
                ) {
                    // TODO: decide if we want to handle this error in a specific way. It generates a lot of logs.
                    return;
                }
                this.#logger.error(error?.message ?? 'Unknown network connection error');
            });

            try {
                this.#prepareConnection(connection);
                this.#validatorMessages.prepareConnection(connection);
                this.#indexerMessages.prepareConnection(connection);
                await this.#promotePendingConnection(publicKey, connection);
                if (this.#closing || this.closed) {
                    this.#validatorConnectionManager.remove(publicKey, connection);
                    this.#indexerConnectionManager.remove(publicKey, connection);
                    this.#destroyConnection(connection);
                }
            } catch (error) {
                this.#rejectAllPendingRequests(publicKey, error ?? new Error('Connection setup failed'));
                this.#destroyConnection(connection);
                if (!this.#closing) {
                    this.#logger.error(error?.message ?? 'Unknown network connection setup error');
                }
            }
        });
    }

    cleanupPendingConnections() {
        for (const { timeoutId } of this.#pendingConnections.values()) {
            clearTimeout(timeoutId);
        }
        this.#pendingConnections.clear();
    }

    isConnectionPending(publicKey) {
        return this.#pendingConnections.has(publicKey);
    }

    pendingConnectionsCount() {
        return this.#pendingConnections.size;
    }

    /** Executes a ban requested by the consensus connection policy. */
    #handleConsensusPeerBanRequested({ connection, error } = {}) {
        if (this.closing !== null || this.closed) return;

        const publicKey = this.#normalizePublicKey(connection?.remotePublicKey);
        if (!publicKey) return;

        // Hyperswarm retains the ban for this swarm's lifetime, but does not close the socket.
        const peerInfo = this.#swarm.peers.get(publicKey);
        peerInfo?.ban(true);
        const connections = new Set([connection]);
        for (const activeConnection of this.#swarm.connections) {
            if (this.#normalizePublicKey(activeConnection.remotePublicKey) === publicKey) {
                connections.add(activeConnection);
            }
        }
        const pending = this.#pendingConnections.get(publicKey);
        if (pending) {
            clearTimeout(pending.timeoutId);
            this.#pendingConnections.delete(publicKey);
        }
        try {
            this.#rejectAllPendingRequests(publicKey, error);
            this.#validatorConnectionManager.remove(publicKey);
            this.#indexerConnectionManager.remove(publicKey);
        } finally {
            for (const activeConnection of connections) activeConnection.destroy();
        }
        this.#logger.info(`Network: ${peerInfo?.banned ? 'banned' : 'disconnected'} consensus peer ${publicKey}: ${error.message}`);
    }

    #isPeerBanned(publicKey) {
        const key = this.#normalizePublicKey(publicKey);
        return this.#swarm.peers.get(key)?.banned === true;
    }

    disconnectValidatorPeer(publicKey, reason = 'validator peer invalidated') {
        const publicKeyHex = this.#normalizePublicKey(publicKey);
        if (!publicKeyHex) return false;

        const hadPendingValidatorConnection = this.#clearPendingValidatorConnection(publicKeyHex);
        const isTrackedValidator = this.#validatorConnectionManager.exists(publicKeyHex);

        const shouldLeavePeer = hadPendingValidatorConnection || isTrackedValidator;

        if (shouldLeavePeer && this.#swarm?.peers?.has(publicKeyHex)) {
            this.#logger.debug(`Network.disconnectValidatorPeer: leaving peer ${publicKeyHex}. Reason: ${reason}`);
            this.#swarm.leavePeer(b4a.from(publicKeyHex, 'hex'));
        }

        if (isTrackedValidator) {
            this.#logger.debug(`Network.disconnectValidatorPeer: detaching tracked validator ${publicKeyHex}. Reason: ${reason}`);
            this.#validatorConnectionManager.remove(publicKeyHex);
        }

        return hadPendingValidatorConnection || isTrackedValidator;
    }

    async #getOrGenerateWallet() {
        if (this.#config.enableWallet) {
            const keyPair = { publicKey: this.#wallet.publicKey, secretKey: this.#wallet.secretKey }
            return { keyPair, wallet: this.#wallet }
        } else {
            // This creates an ephemeral private key via holepunch facilities
            const keyPair = await this.#store.createKeyPair(TRAC_NAMESPACE);
            const wallet = await new WalletProvider(this.#config).fromSecretKey(keyPair.secretKey)
            return { keyPair, wallet }
        }
    }

    async tryConnect(publicKey, type) {
        this.#assertCanReplicate();
        if (!this.#swarm) throw new Error('Network swarm is not initialized');
        if (this.#isPeerBanned(publicKey)) return CONNECTION_STATUS.IGNORED;
        if (this.#pendingConnections.has(publicKey) || this.#pendingConnections.size >= this.#config.maxPendingConnections) {
            this.#logger.debug(`Network.tryConnect: Connection to peer: ${publicKey} as type: ${type} is already pending or max pending connections reached.`);
            return CONNECTION_STATUS.IGNORED;
        }

        const timeoutId = setTimeout(() => {
            // timeout is here to manage the scenario which we will join peer and estabilish a connection (a bit more overhead for validators)
            if (this.#pendingConnections.has(publicKey)) {
                this.#pendingConnections.delete(publicKey)
            }
        }, this.#config.connectTimeoutMs);

        this.#pendingConnections.set(publicKey, { type, timeoutId });

        const target = b4a.from(publicKey, 'hex');
        // A retained peer may have lost explicit retries after leavePeer().
        if (!this.#swarm.peers.get(publicKey)?.explicit) {
            this.#swarm.joinPeer(target);
        } 

        const peerInfo = this.#swarm.peers.get(publicKey);
        if (!peerInfo) return CONNECTION_STATUS.PENDING;

        const connection = this.#swarm._allConnections.get(peerInfo.publicKey);
        // _allConnections also contains transports whose handshake is still in progress.
        if (!connection || !this.#swarm.connections.has(connection)) return CONNECTION_STATUS.PENDING;

        const isConnectionReady = (type === 'validator' && !this.#validatorPendingRequestService.isProbePending(connection.remotePublicKey.toString('hex'))) || type === 'indexer'
        if (isConnectionReady) {
            await this.#promotePendingConnection(publicKey, connection);
            if (this.#closing || this.closed) return CONNECTION_STATUS.IGNORED;
            if (this.#isPeerBanned(publicKey)) return CONNECTION_STATUS.IGNORED;
            if (type === 'indexer' && !this.#indexerConnectionManager.connected(publicKey)) {
                return CONNECTION_STATUS.IGNORED;
            }
            return CONNECTION_STATUS.CONNECTED;
        } 
        
        return CONNECTION_STATUS.PENDING;
    }

    async #promotePendingConnection(publicKey, connection) {
        const pending = this.#pendingConnections.get(publicKey);
        if (pending) {
            clearTimeout(pending.timeoutId);
            this.#pendingConnections.delete(publicKey);

            if (pending.type === 'indexer') {
                await this.#indexerConnectionManager.add(connection.remotePublicKey, connection);
            } else if (pending.type === 'validator') {
                await this.#validatorConnectionManager.add(publicKey, connection);
                // A pending probe may settle after its peer has been banned.
                if (this.#closing || this.closed || this.#isPeerBanned(publicKey)) {
                    this.#validatorConnectionManager.remove(publicKey, connection);
                }
            }
        }
    }

    #normalizePublicKey(publicKey) {
        if (typeof publicKey === 'string') return publicKey;
        if (b4a.isBuffer(publicKey)) return b4a.toString(publicKey, 'hex');
        return null;
    }

    #rejectAllPendingRequests(publicKey, error) {
        this.#validatorPendingRequestService.rejectPendingRequestsForPeer(publicKey, error);
        this.#indexerPendingRequestService.rejectPendingRequestsForPeer(publicKey, error);
    }

    #clearPendingValidatorConnection(publicKeyHex) {
        if (!this.#pendingConnections.has(publicKeyHex)) return false;

        const { timeoutId, type } = this.#pendingConnections.get(publicKeyHex);
        if (type !== 'validator') return false;

        clearTimeout(timeoutId);
        this.#pendingConnections.delete(publicKeyHex);
        return true;
    }

    #assertCanReplicate() {
        if (this.#closing || this.closed) {
            throw new Error('Network is closing or already closed');
        }
    }

    #closeProtocolSessions(connection) {
        for (const session of Object.values(connection.protocolSessions ?? {})) {
            try {
                session?.close();
            } catch {}
        }
    }

    #destroyConnection(connection) {
        if (!connection) return;
        this.#closeProtocolSessions(connection);
        if (typeof connection.destroy === 'function') connection.destroy();
        else if (typeof connection.end === 'function') connection.end();
    }
}

export default Network;
