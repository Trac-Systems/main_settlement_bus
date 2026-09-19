import ReadyResource from 'ready-resource';
import Hyperswarm from 'hyperswarm';
import w from 'protomux-wakeup';
import b4a from 'b4a';
import TransactionPoolService from './services/TransactionPoolService.js';
import ValidatorObserverService from './services/ValidatorObserverService.js';
import NetworkMessages from './protocols/NetworkMessages.js';
import { sleep, generateUUID, publicKeyToAddress } from '../../utils/helpers.js';
import {
    TRAC_NAMESPACE,
    EventType,
    CONNECTION_STATUS
} from '../../utils/constants.js';
import ConnectionManager from './services/ConnectionManager.js';
import MessageOrchestrator from './services/MessageOrchestrator.js';
import TransactionRateLimiterService from './services/TransactionRateLimiterService.js';
import PendingRequestService from './services/PendingRequestService.js';
import TransactionCommitService from "./services/TransactionCommitService.js";
import ValidatorHealthCheckService from './services/ValidatorHealthCheckService.js';
import { Logger } from '../../utils/logger.js';
import { getTelemetry } from '../../utils/telemetry.js';
import { WalletProvider } from 'trac-wallet';

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
    #connectTimeoutMs;
    #maxPendingConnections;
    #rateLimiter;
    #pendingRequestsService;
    #transactionCommitService;
    #wallet;
    #validatorHealthCheckService;
    #logger;
    #closing = false;
    #telemetry;

    /**
     * @param {State} state
     * @param {Config} config
     * @param {string} address
     **/
    constructor(state, config, address = null) {
        super();
        this.#config = config
        this.#connectTimeoutMs = config.connectTimeoutMs || 5000;
        this.#maxPendingConnections = config.maxPendingConnections || 50;
        this.#pendingConnections = new Map();
        this.#transactionCommitService = new TransactionCommitService(this.#config);
        this.#transactionPoolService = new TransactionPoolService(state, address, this.#transactionCommitService ,this.#config);
        this.#validatorObserverService = new ValidatorObserverService(this, state, address, this.#config);
        this.#validatorConnectionManager = new ConnectionManager(this.#config);
        this.#validatorMessageOrchestrator = new MessageOrchestrator(this.#validatorConnectionManager, state, this.#config);
        this.#pendingRequestsService = new PendingRequestService(this.#config);
        this.#logger = new Logger(this.#config);
        this.#telemetry = getTelemetry(this.#config);
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

    diagnostics() {
        return {
            replication_peers: this.#swarm?.connections?.size ?? this.#swarm?._allConnections?.size ?? 0,
            pending_connections: this.#pendingConnections.size,
            validators_connected: this.#validatorConnectionManager.connectionCount(),
            transaction_pool_size: this.#transactionPoolService.txPool?.size() ?? 0,
            pool_version: this.#validatorConnectionManager.poolVersion,
            observer_last_cycle_completed_at_ms: this.#validatorObserverService.lastCycleCompletedAt,
            ...this.#pendingRequestsService.diagnostics?.(),
            ...this.#transactionCommitService.diagnostics?.()
        };
    }

    async _open() {
        this.#logger.info('Network initialization...');
        this.#closing = false;

        this.setupNetworkListeners();

        this.transactionPoolService.start();
        this.validatorObserverService.start();
    }

    async _close() {
        this.#logger.info('Network: closing gracefully...');
        this.#closing = true;
        await this.transactionPoolService.stopPool();
        await sleep(100);
        await this.#validatorObserverService.stopValidatorObserver();
        await sleep(5_000);
        if (this.#validatorHealthCheckService) {
            await this.#validatorHealthCheckService.close();
        }

        this.cleanupNetworkListeners();
        this.cleanupPendingConnections();
        this.#pendingRequestsService.close();
        this.#transactionCommitService.close();

        for (const publicKey of this.#validatorConnectionManager.connectedValidators()) {
            this.#validatorConnectionManager.remove(publicKey, { endConnection: false, reason: 'shutdown' });
        }

        const swarm = this.#swarm;
        if (swarm !== null) {
            if (typeof swarm.removeAllListeners === 'function') {
                swarm.removeAllListeners('connection');
            }
            await swarm.destroy();
            if (this.#swarm === swarm) {
                this.#swarm = null;
            }
        }
    }

    setupNetworkListeners() {
        this.on(EventType.VALIDATOR_CONNECTION_TIMEOUT, ({ publicKey, type, timeoutMs }) => {
            this.#logger.debug(`Network Event: VALIDATOR_CONNECTION_TIMEOUT | PublicKey: ${publicKey} | Type: ${type} | TimeoutMs: ${timeoutMs}`);
            const pending = this.#pendingConnections.get(publicKey);
            if (pending) this.#telemetry.emit('validator.connect_failed', {
                ...this.#attemptContext(publicKey, pending), stage: 'connection', reason: 'connection_timeout', timeout_ms: timeoutMs
            }, 4);
            this.#pendingConnections.delete(publicKey);
        });

        this.on(EventType.VALIDATOR_CONNECTION_READY, async ({ publicKey, type, connection }) => {
            this.#logger.debug(`Network Event: VALIDATOR_CONNECTION_READY | PublicKey: ${publicKey} | Type: ${type}`);
            const pending = this.#pendingConnections.get(publicKey);
            const timeoutId = pending?.timeoutId;

            if (!timeoutId) return;

            clearTimeout(timeoutId);
            this.#pendingConnections.delete(publicKey);

            if (type === 'validator') {
                try {
                    connection.protocolSession.setTelemetryContext?.({
                        validator: publicKey, validator_address: publicKeyToAddress(publicKey, this.#config),
                        connection_attempt_id: pending.attemptId,
                    });
                    if (!connection.protocolSession.isProbed()) await connection.protocolSession.probe();
                } catch (err) {
                    this.#telemetry.emit('validator.probe_failed', {
                        ...this.#attemptContext(publicKey, pending), stage: 'probe', error_type: err?.name ?? 'Error',
                        fallback_allowed: true
                    }, 4);
                    this.#logger.debug(`failed to probe peer with publicKey ${publicKey}: ${err?.message ?? err}`);
                }

                const added = this.#validatorConnectionManager.addValidator(publicKey, connection, this.#attemptContext(publicKey, pending));
                if (!added) this.#telemetry.emit('validator.connect_ignored', {
                    ...this.#attemptContext(publicKey, pending), reason: this.#validatorConnectionManager.connected(publicKey)
                        ? 'already_connected' : 'pool_limit'
                });

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
    }

    cleanupNetworkListeners() {
        this.removeAllListeners(EventType.VALIDATOR_CONNECTION_TIMEOUT);
        this.removeAllListeners(EventType.VALIDATOR_CONNECTION_READY);
    }

    cleanupPendingConnections() {
        for (const [publicKey, pending] of this.#pendingConnections) {
            const { timeoutId } = pending;
            clearTimeout(timeoutId);
            this.#telemetry.emit('validator.connect_cancelled', { ...this.#attemptContext(publicKey, pending), reason: 'shutdown' });
        }
        this.#pendingConnections.clear();
    }

    async replicate(
        state,
        store,
        wallet,
    ) {
        this.#assertCanReplicate();

        if (!this.#swarm) {
            const { wallet: wrappedWallet, keyPair } = await this.#getOrGenerateWallet(store, wallet);
            this.#assertCanReplicate();

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
                state,
                this.#wallet,
                this.#rateLimiter,
                this.#transactionPoolService,
                this.#pendingRequestsService,
                this.#transactionCommitService,
                this.#config
            );
            this.#validatorHealthCheckService = new ValidatorHealthCheckService(this.#config);
            await this.#validatorHealthCheckService.ready();
            this.#assertCanReplicate();

            this.#validatorConnectionManager.subscribeToHealthChecks(this.#validatorHealthCheckService);

            this.#logger.info(`Channel: ${b4a.toString(this.#config.channel)}`);

            this.#swarm.on('connection', async (connection) => {
                if (this.#closing) {
                    this.#destroyConnection(connection);
                    return;
                }

                try {
                    // Per-peer connection initialization:
                    // - attach Protomux (legacy + v1 channels/messages)
                    // - attach connection.protocolSession (used later by tryConnect / orchestrators to send messages)
                    await this.#networkMessages.setupProtomuxMessages(connection);

                    // Pear v3 can deliver a late swarm connection while shutdown is
                    // already closing the Corestore. Do not replicate a connection
                    // after close has begun; store.replicate would otherwise throw.
                    if (this.#closing || this.#swarm === null) {
                        this.#destroyConnection(connection);
                        return;
                    }

                    // ATTENTION: Must be called AFTER the protomux init above
                    const stream = store.replicate(connection);
                    wakeup.addStream(stream);
                } catch (error) {
                    const publicKey = connection.remotePublicKey
                        ? b4a.toString(connection.remotePublicKey, 'hex')
                        : 'unknown';
                    this.#telemetry.emit('network.connection_setup_failed', {
                        ...this.#attemptContext(publicKey, this.#pendingConnections.get(publicKey)),
                        stage: 'protocol_setup', error_type: error?.name ?? 'Error'
                    }, 3);
                    this.#pendingRequestsService.rejectPendingRequestsForPeer(
                        publicKey,
                        error ?? new Error('Connection setup failed')
                    );
                    this.#destroyConnection(connection);
                    if (!this.#closing) {
                        this.#logger.error(error?.message ?? 'Unknown network connection setup error');
                    }
                    return;
                }

                const publicKey = b4a.toString(connection.remotePublicKey, 'hex');
                if (this.#pendingConnections.has(publicKey)) {
                    const { type } = this.#pendingConnections.get(publicKey);
                    await this.#finalizeConnection(publicKey, type, connection);
                }

                let connectionError;
                connection.on('close', () => {
                    this.#pendingRequestsService.rejectPendingRequestsForPeer(
                        publicKey,
                        new Error('Connection closed before response')
                    );
                    this.#swarm?.leavePeer(connection.remotePublicKey);
                    // only act on the connection this event belongs to
                    if (this.#validatorConnectionManager.isCurrent(publicKey, connection)) {
                        this.#validatorConnectionManager.remove(publicKey, {
                            endConnection: false,
                            expectedConnection: connection,
                            reason: this.#closing ? 'shutdown' : connectionError ? 'connection_error' : 'connection_closed',
                            error_type: connectionError,
                        });
                    }
                    if (connection.protocolSession) {
                        try {
                            connection.protocolSession.close();
                        } catch {}
                    }
                });

                connection.on('error', (error) => {
                    connectionError = error?.name ?? 'Error';
                    this.#telemetry.emit('network.connection_error', {
                        validator: publicKey, ...this.#validatorConnectionManager.getConnectionDiagnostics?.(publicKey),
                        error_type: connectionError, error_code: error?.code,
                        reason: error?.message?.includes('connection reset by peer') ? 'connection_reset'
                            : error?.message?.includes('Duplicate connection') ? 'duplicate_connection'
                                : error?.message?.includes('connection timed out') ? 'connection_timeout' : 'socket_error'
                    }, 4);
                    this.#pendingRequestsService.rejectPendingRequestsForPeer(
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

    disconnectValidatorPeer(publicKey, reason = 'role_changed') {
        const publicKeyHex = this.#normalizePublicKey(publicKey);
        if (!publicKeyHex) return false;

        const roleChange = reason === 'peer promoted to indexer' || reason === 'peer became unwritable';
        const context = roleChange ? { role_change_detail: reason } : {};
        if (roleChange) reason = 'role_changed';
        const hadPendingValidatorConnection = this.#clearPendingValidatorConnection(publicKeyHex, reason, context);
        const isTrackedValidator = this.#validatorConnectionManager.exists(publicKeyHex);

        const shouldLeavePeer = hadPendingValidatorConnection || isTrackedValidator;

        if (shouldLeavePeer && this.#swarm?.peers?.has(publicKeyHex)) {
            this.#logger.debug(`Network.disconnectValidatorPeer: leaving peer ${publicKeyHex}. Reason: ${reason}`);
            this.#swarm.leavePeer(b4a.from(publicKeyHex, 'hex'));
        }

        if (isTrackedValidator) {
            this.#logger.debug(`Network.disconnectValidatorPeer: detaching tracked validator ${publicKeyHex}. Reason: ${reason}`);
            this.#validatorConnectionManager.remove(publicKeyHex, { endConnection: false, reason, ...context });
        }

        return hadPendingValidatorConnection || isTrackedValidator;
    }

    async #getOrGenerateWallet(store, wallet) {
        if (!this.#config.enableWallet) {
            const keyPair = await store.createKeyPair(TRAC_NAMESPACE);
            const wallet = await new WalletProvider(this.#config).fromSecretKey(keyPair.secretKey)
            return { keyPair, wallet }
        } else {
            const keyPair = { publicKey: wallet.publicKey, secretKey: wallet.secretKey }
            return { keyPair, wallet }
        }
    }

    async tryConnect(publicKey, type = null) {
        if (this.#swarm === null) throw new Error('Network swarm is not initialized');
        if (this.#pendingConnections.has(publicKey) || this.#pendingConnections.size >= this.#maxPendingConnections) {
            this.#logger.debug(`Network.tryConnect: Connection to peer: ${publicKey} as type: ${type} is already pending or max pending connections reached.`);
            return CONNECTION_STATUS.IGNORED;
        }

        const timeoutId = setTimeout(() => {
            if (!this.#pendingConnections.has(publicKey)) return;
            this.emit(EventType.VALIDATOR_CONNECTION_TIMEOUT, { publicKey, type, timeoutMs: this.#connectTimeoutMs });
        }, this.#connectTimeoutMs);
        const pending = { type, timeoutId, attemptId: generateUUID(), startedAt: Date.now() };
        this.#pendingConnections.set(publicKey, pending);
        this.#telemetry.emit('validator.connect_started', { ...this.#attemptContext(publicKey, pending), timeout_ms: this.#connectTimeoutMs });

        const target = b4a.from(publicKey, 'hex');
        if (!this.#swarm.peers.has(publicKey)) {
            this.#swarm.joinPeer(target);
        }

        const peerInfo = this.#swarm.peers.get(publicKey);
        if (peerInfo) {
            const connection = this.#swarm._allConnections.get(peerInfo.publicKey);

            if (connection &&
                connection.protocolSession &&
                !this.#pendingRequestsService.isProbePending(connection.remotePublicKey.toString('hex'))
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

    #clearPendingValidatorConnection(publicKeyHex, reason, context = {}) {
        if (!this.#pendingConnections.has(publicKeyHex)) return false;

        const pending = this.#pendingConnections.get(publicKeyHex);
        const { timeoutId, type } = pending;
        if (type !== 'validator') return false;

        clearTimeout(timeoutId);
        this.#pendingConnections.delete(publicKeyHex);
        this.#telemetry.emit('validator.connect_cancelled', { ...this.#attemptContext(publicKeyHex, pending), reason, ...context });
        return true;
    }

    #attemptContext(publicKey, pending) {
        return {
            validator: publicKey, connection_type: pending?.type,
            connection_attempt_id: pending?.attemptId,
            duration_ms: pending ? Date.now() - pending.startedAt : undefined
        };
    }

    #assertCanReplicate() {
        if (this.#closing || this.closed) {
            throw new Error('Network is closing or already closed');
        }
    }

    #destroyConnection(connection) {
        if (!connection) return;
        if (connection.protocolSession) {
            try {
                connection.protocolSession.close();
            } catch {}
        }
        if (typeof connection.destroy === 'function') {
            connection.destroy();
        } else if (typeof connection.end === 'function') {
            connection.end();
        }
    }
}

export default Network;
