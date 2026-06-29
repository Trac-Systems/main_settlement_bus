import ReadyResource from 'ready-resource';
import Hyperswarm from 'hyperswarm';
import w from 'protomux-wakeup';
import b4a from 'b4a';
import TransactionPoolService from './services/TransactionPoolService.js';
import ValidatorObserverService from './services/ValidatorObserverService.js';
import NetworkMessages from './protocols/NetworkMessages.js';
import { publicKeyToAddress, sleep } from '../../utils/helpers.js';
import {
    TRAC_NAMESPACE,
    EventType,
    CONNECTION_STATUS
} from '../../utils/constants.js';
import ConnectionManager from './services/ConnectionManager.js';
import MessageOrchestrator from './services/MessageOrchestrator.js';
import TransactionRateLimiterService from './services/TransactionRateLimiterService.js';
import ValidatorPendingRequestService from './services/ValidatorPendingRequestService.js';
import TransactionCommitService from "./services/TransactionCommitService.js";
import ValidatorHealthCheckService from './services/ValidatorHealthCheckService.js';
import EpochProofProposalService from '../consensus/services/EpochProofProposalService.js';
import { Logger } from '../../utils/logger.js';
import { WalletProvider } from 'trac-wallet';
import { CustomEventType } from '../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api'
import ConsensusMessages from '../consensus/protocols/ConsensusMessages.js';
import IndexerConnectionManager from '../consensus/services/IndexerConnectionManager.js';
import IndexerPendingRequestService from '../consensus/services/IndexerPendingRequestService.js';

const wakeup = new w();

class Network extends ReadyResource {
    #swarm = null;
    #networkMessages;
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
    #validatorHealthCheckService;
    #epochProofProposalService;
    #logger;
    #state;
    #store;
    #consensusMessages;
    #indexerConnectionManager;
    #indexerPendingRequestService;

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
        this.#validatorConnectionManager = new ConnectionManager(this.#config);
        this.#validatorMessageOrchestrator = new MessageOrchestrator(this.#validatorConnectionManager, state, this.#config);
        this.#validatorPendingRequestService = new ValidatorPendingRequestService(this.#config);
        this.#indexerPendingRequestService = new IndexerPendingRequestService(this.#config);
        this.#logger = new Logger(this.#config);
    }

    get swarm() {
        return this.#swarm;
    }

    get transactionPoolService() {
        return this.#transactionPoolService;
    }

    get indexerConnectionManager() {
        return this.#indexerConnectionManager
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
        this.#logger.info('Network initialization...');

        this.setupNetworkListeners();

        this.transactionPoolService.start();
        this.validatorObserverService.start();
        await this.#replicate();

        const isAdmin = await this.#state.isAdmin();

        if (this.#state.isIndexer() && !isAdmin) {
            this.#epochProofProposalService.start();
        }
    }

    async _close() {
        this.#logger.info('Network: closing gracefully...');
        await this.transactionPoolService.stop();
        await sleep(100);
        await this.#validatorObserverService.stop();

        this.cleanupNetworkListeners();
        this.cleanupPendingConnections();
        await this.#validatorHealthCheckService.close();
        await this.#epochProofProposalService.close();
        this.#validatorPendingRequestService.close();
        this.#transactionCommitService.close();
        this.#indexerPendingRequestService.close();

        await this.#swarm.destroy();
    }

    setupNetworkListeners() {
        this.#state.on(CustomEventType.IS_INDEXER, async (publicKey) => {
            const indexersCount = await this.#state.indexerCount()
            this.#indexerConnectionManager.setMax(indexersCount);
            this.disconnectValidatorPeer(publicKey, 'peer promoted to indexer');
            this.addIndexerPeer(publicKey);
            
        });

        this.#state.on(CustomEventType.IS_NON_INDEXER, async (publicKey) => {
            const indexersCount = await this.#state.indexerCount()
            this.#indexerConnectionManager.setMax(indexersCount);
            this.disconnectIndexerPeer(publicKey, 'peer demoted from indexer');
        });

        this.#state.on(CustomEventType.UNWRITABLE, (publicKey) => {
            this.disconnectValidatorPeer(publicKey, 'peer became unwritable');
        });

        this.on(EventType.VALIDATOR_CONNECTION_TIMEOUT, ({ publicKey, type, timeoutMs }) => {
            this.#logger.debug(`Network Event: VALIDATOR_CONNECTION_TIMEOUT | PublicKey: ${publicKey} | Type: ${type} | TimeoutMs: ${timeoutMs}`);
            this.#pendingConnections.delete(publicKey);
        });

        this.on(EventType.VALIDATOR_CONNECTION_READY, async ({ publicKey, type, connection }) => {
            this.#logger.debug(`Network Event: VALIDATOR_CONNECTION_READY | PublicKey: ${publicKey} | Type: ${type}`);
            const { timeoutId } = this.#pendingConnections.get(publicKey);

            if (!timeoutId) return;

            clearTimeout(timeoutId);
            this.#pendingConnections.delete(publicKey);

            if (type === 'validator') {
                try {
                    if (!connection.protocolSession.isProbed()) await connection.protocolSession.probe();
                } catch (err) {
                    this.#logger.debug(`failed to probe peer with publicKey ${publicKey}: ${err?.message ?? err}`);
                }

                this.#validatorConnectionManager.addValidator(publicKey, connection);

                let healthCheckSupported = false;
                try {
                    healthCheckSupported = connection.protocolSession.isHealthCheckSupported();
                } catch (err) {
                    this.#logger.debug(`health check support unknown for peer with publicKey ${publicKey}: ${err?.message ?? err}`);
                }

                if (healthCheckSupported) {
                    this.#validatorHealthCheckService.start(publicKey);
                } else {
                    this.#validatorHealthCheckService.stop(publicKey);
                }
            }

        });

        this.#state.on(CustomEventType.IS_INDEXER, (bufferAddress) => {
            const address = tracCryptoApi.address.encode(this.#config.addressPrefix, bufferAddress);
            if (address === this.#wallet.address) {
                this.#epochProofProposalService.start();
            }
        });

        this.#state.on(CustomEventType.IS_NON_INDEXER, (bufferAddress) => {
            const address = tracCryptoApi.address.encode(this.#config.addressPrefix, bufferAddress);
            if (address === this.#wallet.address) {
                this.#epochProofProposalService.stop();
            }
        });
    }

    cleanupNetworkListeners() {
        this.removeAllListeners(EventType.VALIDATOR_CONNECTION_TIMEOUT);
        this.removeAllListeners(EventType.VALIDATOR_CONNECTION_READY);
    }

    cleanupPendingConnections() {
        for (const { timeoutId } of this.#pendingConnections.values()) {
            clearTimeout(timeoutId);
        }
        this.#pendingConnections.clear();
    }

    async #replicate() {
        if (!this.#swarm) {
            const { wallet: wrappedWallet, keyPair } = await this.#getOrGenerateWallet();
            this.#wallet = wrappedWallet
            this.#validatorMessageOrchestrator.setWallet(this.#wallet);

            this.#swarm = new Hyperswarm({
                keyPair,
                bootstrap: this.#config.dhtBootstrap,
                maxPeers: this.#config.maxPeers,
                maxParallel: this.#config.maxParallel,
                maxServerConnections: this.#config.maxServerConnections,
                maxClientConnections: this.#config.maxClientConnections
            });

            this.#rateLimiter = new TransactionRateLimiterService(this.#swarm, this.#config);
            this.#networkMessages = new NetworkMessages(
                this.#state,
                this.#wallet,
                this.#rateLimiter,
                this.#transactionPoolService,
                this.#validatorPendingRequestService,
                this.#transactionCommitService,
                this.#config
            );
            this.#validatorHealthCheckService = new ValidatorHealthCheckService(this.#config);
            await this.#validatorHealthCheckService.ready();

            this.#consensusMessages = new ConsensusMessages(this.#state, this.#wallet, this.#config, this.#indexerPendingRequestService);
            const indexersCount = await this.#state.indexerCount()
            this.#indexerConnectionManager = new IndexerConnectionManager(indexersCount);

            this.#epochProofProposalService = new EpochProofProposalService(this.#state, this.#indexerConnectionManager, this.#wallet, this.#config);
            await this.#epochProofProposalService.ready();

            this.#validatorConnectionManager.subscribeToHealthChecks(this.#validatorHealthCheckService);

            this.#logger.info(`Channel: ${b4a.toString(this.#config.channel)}`);

            this.#swarm.prependListener('connection', async (connection) => {
                await this.#networkMessages.setupProtomuxMessages(connection);
                await this.#consensusMessages.setupProtomuxMessages(connection);
            });

            this.#swarm.on('connection', async (connection) => {
                // Per-peer connection initialization:
                // - attach Protomux (legacy + v1 channels/messages)
                // - attach connection.protocolSession (used later by tryConnect / orchestrators to send messages)

                // Adds indexers to consensus connection manager
                const address = publicKeyToAddress(connection.remotePublicKey, this.#config);
                if (await this.#state.isIndexerAddress(address) && !await this.#state.isAdminAddress(address)) {
                    this.#indexerConnectionManager.add(connection.remotePublicKey, connection);
                }

                // ATTENTION: Must be called AFTER the protomux init above
                const stream = this.#store.replicate(connection);
                wakeup.addStream(stream);

                const publicKey = b4a.toString(connection.remotePublicKey, 'hex');
                if (this.#pendingConnections.has(publicKey)) {
                    const { type } = this.#pendingConnections.get(publicKey);
                    await this.#finalizeConnection(publicKey, type, connection);
                }

                connection.on('close', () => {
                    this.#validatorPendingRequestService.rejectPendingRequestsForPeer(
                        publicKey,
                        new Error('Connection closed before response')
                    );
                    this.#indexerPendingRequestService.rejectPendingRequestsForPeer(
                        publicKey,
                        new Error('Connection closed before response')
                    );
                    this.#swarm.leavePeer(connection.remotePublicKey);
                    this.#validatorConnectionManager.remove(publicKey);
                    this.#indexerConnectionManager.remove(publicKey);
                    connection.protocolSession.close();
                    connection.consensusProtocolSession?.close();
                });

                connection.on('error', (error) => {
                    this.#validatorPendingRequestService.rejectPendingRequestsForPeer(
                        publicKey,
                        error ?? new Error('Connection error before response')
                    );
                    this.#indexerPendingRequestService.rejectPendingRequestsForPeer(
                        publicKey,
                        error ?? new Error('Connection error before response')
                    );
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

    addIndexerPeer(publicKey) {
        const publicKeyHex = this.#normalizePublicKey(publicKey);

        // If swarm does not have the register public key, means that it emits a connection event
        if (this.#swarm?.peers?.has(publicKeyHex)) {
            const peerInfo = this.#swarm.peers.get(publicKeyHex);
            const connection = this.#swarm._allConnections.get(peerInfo.publicKey);
            this.#indexerConnectionManager.add(peerInfo.publicKey, connection);
        }
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
            this.#validatorConnectionManager.remove(publicKeyHex, { endConnection: false });
        }

        return hadPendingValidatorConnection || isTrackedValidator;
    }

    disconnectIndexerPeer(publicKey, reason = 'validator peer invalidated') {
        const publicKeyHex = this.#normalizePublicKey(publicKey);
        if (!publicKeyHex) return false;

        const isTrackedIndexer = this.#indexerConnectionManager.exists(publicKeyHex);

        if (isTrackedIndexer) {
            this.#logger.debug(`Network.disconnectIndexerPeer: detaching tracked indexer ${publicKeyHex}. Reason: ${reason}`);
            this.#indexerConnectionManager.remove(publicKey);
        }

        return isTrackedIndexer;
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

    async tryConnect(publicKey, type = null) {
        if (this.#swarm === null) throw new Error('Network swarm is not initialized');
        if (this.#pendingConnections.has(publicKey) || this.#pendingConnections.size >= this.#config.maxPendingConnections) {
            this.#logger.debug(`Network.tryConnect: Connection to peer: ${publicKey} as type: ${type} is already pending or max pending connections reached.`);
            return CONNECTION_STATUS.IGNORED;
        }

        const timeoutId = setTimeout(() => {
            if (!this.#pendingConnections.has(publicKey)) return;
            this.emit(EventType.VALIDATOR_CONNECTION_TIMEOUT, { publicKey, type, timeoutMs: this.#config.connectTimeoutMs });
        }, this.#config.connectTimeoutMs);
        this.#pendingConnections.set(publicKey, { type, timeoutId });

        const target = b4a.from(publicKey, 'hex');
        if (!this.#swarm.peers.has(publicKey)) {
            this.#swarm.joinPeer(target);
        }

        const peerInfo = this.#swarm.peers.get(publicKey);
        if (peerInfo) {
            const connection = this.#swarm._allConnections.get(peerInfo.publicKey);

            if (connection &&
                connection.protocolSession &&
                !this.#validatorPendingRequestService.isProbePending(connection.remotePublicKey.toString('hex'))
            ) {
                await this.#finalizeConnection(publicKey, type, connection);
                return CONNECTION_STATUS.CONNECTED;
            }
        }
        
        return CONNECTION_STATUS.PENDING;
    }

    async #finalizeConnection(publicKey, type, connection) {
        if (!this.#pendingConnections.has(publicKey)) return;
        this.emit(EventType.VALIDATOR_CONNECTION_READY, { publicKey, type, connection });
        this.#logger.debug(`Network.finalizeConnection: Connected to peer: ${publicKey} as type: ${type}`);
    }

    #normalizePublicKey(publicKey) {
        if (typeof publicKey === 'string') return publicKey;
        if (b4a.isBuffer(publicKey)) return b4a.toString(publicKey, 'hex');
        return null;
    }

    #clearPendingValidatorConnection(publicKeyHex) {
        if (!this.#pendingConnections.has(publicKeyHex)) return false;

        const { timeoutId, type } = this.#pendingConnections.get(publicKeyHex);
        if (type !== 'validator') return false;

        clearTimeout(timeoutId);
        this.#pendingConnections.delete(publicKeyHex);
        return true;
    }
}

export default Network;
