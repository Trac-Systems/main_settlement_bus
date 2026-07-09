import ReadyResource from 'ready-resource';
import Hyperswarm from 'hyperswarm';
import w from 'protomux-wakeup';
import b4a from 'b4a';
import TransactionPoolService from './services/TransactionPoolService.js';
import ValidatorObserverService from './services/ValidatorObserverService.js';
import IndexerObserverService from '../consensus/services/IndexerObserverService.js';
import NetworkMessages from './protocols/NetworkMessages.js';
import { sleep } from '../../utils/helpers.js';
import { TRAC_NAMESPACE, CONNECTION_STATUS } from '../../utils/constants.js';
import ValidatorConnectionManager from './services/ValidatorConnectionManager.js';
import MessageOrchestrator from './services/MessageOrchestrator.js';
import TransactionRateLimiterService from './services/TransactionRateLimiterService.js';
import ValidatorPendingRequestService from './services/ValidatorPendingRequestService.js';
import TransactionCommitService from "./services/TransactionCommitService.js";
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
    #swarm;
    #transactionPoolService;
    #validatorObserverService;
    #indexerObserverService;
    #validatorConnectionManager;
    #validatorMessageOrchestrator;
    #config;
    #pendingConnections;
    #rateLimiter;
    #validatorPendingRequestService;
    #transactionCommitService;
    #wallet;
    #epochProofProposalService;
    #logger;
    #state;
    #store;
    #indexerConnectionManager;
    #indexerPendingRequestService;
    #networkMessages;

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
        this.#indexerObserverService = new IndexerObserverService(this, state, wallet?.address, this.#config);
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
        this.transactionPoolService.start();

        const { wallet: wrappedWallet, keyPair } = await this.#getOrGenerateWallet();
        this.#wallet = wrappedWallet

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

        this.#validatorConnectionManager = new ValidatorConnectionManager(this.#config.maxValidators, this.#config, this.#logger, this.#networkMessages);
        await this.#validatorConnectionManager.ready();

        this.#validatorMessageOrchestrator = new MessageOrchestrator(this.#validatorConnectionManager, this.#state, this.#config, this.#wallet);

        const consensusMessages = new ConsensusMessages(this.#state, this.#wallet, this.#config, this.#indexerPendingRequestService);
        const indexersCount = await this.#state.indexerCount()
        
        this.#indexerConnectionManager = new IndexerConnectionManager(indexersCount, this.#config, this.#logger, consensusMessages);
        await this.#indexerConnectionManager.ready();

        this.#epochProofProposalService = new EpochProofProposalService(this.#state, this.#indexerConnectionManager, this.#wallet, this.#config);
        await this.#epochProofProposalService.ready();

        this.#logger.info(`Channel: ${b4a.toString(this.#config.channel)}`);
        this.#listerners();

        this.#swarm.join(this.#config.channel, { server: true, client: true });
        this.#swarm.flush();
        this.validatorObserverService.start();
        
        const isAdmin = await this.#state.isAdmin();
        if (this.#state.isIndexer() && !isAdmin) {
            this.#indexerObserverService.start();
            await sleep(10000)
            this.#epochProofProposalService.start();
        }
    }

    async _close() {
        this.#logger.info('Network: closing gracefully...');
        await this.transactionPoolService.stop();
        await sleep(100);
        await this.#validatorObserverService.stop();
        await this.#indexerObserverService.stop();

        this.cleanupPendingConnections();
        await this.#epochProofProposalService.close();
        this.#validatorPendingRequestService.close();
        this.#transactionCommitService.close();
        this.#indexerPendingRequestService.close();

        await this.#swarm.destroy();
    }

    #listerners() {
        this.#state.on(CustomEventType.IS_INDEXER, async (publicKey) => {
            const indexersCount = await this.#state.indexerCount()
            this.#indexerConnectionManager.setMax(indexersCount);
            this.disconnectValidatorPeer(publicKey, 'peer promoted to indexer');
            await this.addIndexerPeer(publicKey);
        });

        this.#state.on(CustomEventType.IS_NON_INDEXER, async (publicKey) => {
            const indexersCount = await this.#state.indexerCount()
            this.#indexerConnectionManager.setMax(indexersCount);
            this.disconnectIndexerPeer(publicKey, 'peer demoted from indexer');
        });

        this.#state.on(CustomEventType.UNWRITABLE, (publicKey) => {
            this.disconnectValidatorPeer(publicKey, 'peer became unwritable');
        });

        this.#state.on(CustomEventType.IS_INDEXER, (bufferAddress) => {
            const address = tracCryptoApi.address.encode(this.#config.addressPrefix, bufferAddress);
            if (address === this.#wallet.address) {
                this.#indexerObserverService.start();
                this.#epochProofProposalService.start();
            }
        });

        this.#state.on(CustomEventType.IS_NON_INDEXER, (bufferAddress) => {
            const address = tracCryptoApi.address.encode(this.#config.addressPrefix, bufferAddress);
            if (address === this.#wallet.address) {
                this.#indexerObserverService.stop();
                this.#epochProofProposalService.stop();
                this.#indexerConnectionManager.clear();
            }
        });

        this.#swarm.prependListener('connection', async (connection) => {
            /*
             Here is the issue:
             
             The current session is supposed to be attached as soon as possible (mostly to respond to probe since there is no connection ready signal on this level)
             Since the connection was started from the other side, this havent gone through "qualification" which happens on tryConnect.
             Becuase of that, we need to assume the current connection is that of a validator (who responds to probe) and later override it if necessary.
             This is leaky for two reasons: first we need to keep a reference to messages and disclose the connection structure in this class.
             second is that the protocol itself doesnt fit the connection life-cycle (this is a bigger problem that also touched on DHT factory structure being "swallowed by swarm")
             */
            connection.protocolSession = this.#networkMessages.createProtomux(connection);
        })
        this.#swarm.on('connection', async (connection) => {
            // ATTENTION: Must be called AFTER the protomux init above
            const stream = this.#store.replicate(connection);
            wakeup.addStream(stream);

            const publicKey = b4a.toString(connection.remotePublicKey, 'hex');
            // This function will ignore connections that havent been triggered by the observer. In this case, the promotion will happen during tryConnect when the connection entity will be qualified.
            await this.#promotePendingConnection(publicKey, connection);

            connection.on('close', () => {
                this.#rejectAllPendingRequests(publicKey, new Error('Connection closed before response'));
                this.#swarm.leavePeer(connection.remotePublicKey);
                this.#validatorConnectionManager.remove(publicKey);
                this.#indexerConnectionManager.remove(publicKey);
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

    async addIndexerPeer(publicKey) {
        const publicKeyHex = this.#normalizePublicKey(publicKey);

        // If swarm does not have the register public key, means that it emits a connection event
        if (this.#swarm?.peers?.has(publicKeyHex)) {
            const peerInfo = this.#swarm.peers.get(publicKeyHex);
            const connection = this.#swarm._allConnections.get(peerInfo.publicKey);
            await this.#indexerConnectionManager.add(peerInfo.publicKey, connection);
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

    async tryConnect(publicKey, type) {
        if (!this.#swarm) throw new Error('Network swarm is not initialized');
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
        if (!this.#swarm.peers.has(publicKey)) {
            // if the connection is not managed by the swarm, we actively connect and the flow will be managed by the on('connection') subscriber
            this.#swarm.joinPeer(target);
            return CONNECTION_STATUS.PENDING;
        } 

        const peerInfo = this.#swarm.peers.get(publicKey);
        if (!peerInfo) return;

        const connection = this.#swarm._allConnections.get(peerInfo.publicKey);
        if (!connection) return CONNECTION_STATUS.PENDING;

        const isConnectionReady = (type === 'validator' && !this.#validatorPendingRequestService.isProbePending(connection.remotePublicKey.toString('hex'))) || type === 'indexer'
        if (isConnectionReady) {
            await this.#promotePendingConnection(publicKey, connection);
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
}

export default Network;
