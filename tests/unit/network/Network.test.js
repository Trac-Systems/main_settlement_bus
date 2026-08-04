import { test } from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import EventEmitter from 'bare-events';
import { CONNECTION_STATUS, CustomEventType } from '../../../src/utils/constants.js';

const isBareRuntime = typeof globalThis.Bare !== 'undefined';

function normalizePublicKey(publicKey) {
    if (typeof publicKey === 'string') return publicKey;
    if (b4a.isBuffer(publicKey)) return b4a.toString(publicKey, 'hex');
    return null;
}

function createMockConnection(publicKeyHex, { withProtocolSession = true, withConsensusSession = false } = {}) {
    const remotePublicKey = b4a.from(publicKeyHex, 'hex');
    return {
        remotePublicKey,
        protocolSessions: {
            validator: withProtocolSession ? {
                isProbed: () => true,
                probe: sinon.stub().resolves(),
                isHealthCheckSupported: () => false,
                close: sinon.stub(),
            } : null,
            indexers: withConsensusSession ? { close: sinon.stub() } : null,
        },
        on: sinon.stub(),
    };
}

async function loadNetwork() {
    const { default: esmock } = await import('esmock');
    let swarmInstance = null;
    let validatorConnectionManagerInstance = null;

    class HyperswarmMock extends EventEmitter {
        constructor() {
            super();
            swarmInstance = this;
            this.peers = new Map();
            this._allConnections = new Map();
            this.joinPeer = sinon.stub().callsFake((target) => {
                const publicKeyHex = b4a.toString(target, 'hex');
                this.peers.set(publicKeyHex, { publicKey: target });
            });
            this.leavePeer = sinon.stub();
            this.join = sinon.stub();
            this.flush = sinon.stub();
            this.destroy = sinon.stub();
        }
    }

    class ValidatorConnectionManagerMock {
        constructor() {
            validatorConnectionManagerInstance = this;
            this.validators = new Set();
            this.removed = [];
        }

        exists(publicKey) {
            return this.validators.has(normalizePublicKey(publicKey));
        }

        remove(publicKey) {
            const publicKeyHex = normalizePublicKey(publicKey);
            this.removed.push({ publicKey: publicKeyHex });
            this.validators.delete(publicKeyHex);
        }

        add(publicKey) {
            this.validators.add(normalizePublicKey(publicKey));
            return true;
        }

        connected(publicKey) {
            return this.exists(publicKey);
        }

        connectedPeers() {
            return Array.from(this.validators);
        }

        connectionCount() {
            return this.validators.size;
        }

        maxConnectionsReached() {
            return false;
        }

        subscribeToHealthChecks() {}

        ready() {
            return true
        }

        async close() {}
    }

    class TransactionPoolServiceMock {
        start() {}
        async stop() {}
    }

    class ValidatorObserverServiceMock {
        start() {}
        async stop() {}
    }

    class MessageOrchestratorMock {
        setWallet() {}
    }

    class PendingRequestServiceMock {
        isProbePending() { return false; }
        rejectPendingRequestsForPeer() {}
        close() {}
    }

    class TransactionCommitServiceMock {
        close() {}
    }

    class ValidatorHealthCheckServiceMock extends EventEmitter {
        async ready() {}
        start() {}
        stop() {}
        has() { return false; }
        close() {}
    }

    class EpochCoordinatorServiceMock {
        async ready() {}
        start() {}
        async stop() {}
        async close() {}
    }

    class LoggerMock {
        info() {}
        debug() {}
        error() {}
    }

    class NetworkMessagesMock {
        createProtomux(connection) {
            return connection.protocolSessions?.validator ?? {
                isProbed: () => true,
                probe: sinon.stub().resolves(),
                isHealthCheckSupported: () => false,
                close: sinon.stub(),
            };
        }

        attachChannel(connection) {
            connection.protocolSessions ??= {};
            connection.protocolSessions.validator = this.createProtomux(connection);
        }

        prepareConnection(connection) {
            this.attachChannel(connection);
        }
    }

    class ConsensusMessagesMock {
        async setupProtomuxMessages() {}
        prepareConnection() {}
        attachChannel() {}
    }

    class WakeupMock {
        addStream() {}
    }

    class TransactionRateLimiterServiceMock {}

    class CorestoreMock {
        constructor() {
            this.replicate = sinon.stub();
            this.createKeyPair = sinon.stub();
        }
    }

    const NetworkModule = await esmock('../../../src/core/network/Network.js', {
        hyperswarm: HyperswarmMock,
        '../../../src/core/network/services/TransactionPoolService.js': { default: TransactionPoolServiceMock },
        '../../../src/core/network/services/ValidatorObserverService.js': { default: ValidatorObserverServiceMock },
        '../../../src/core/network/services/ValidatorConnectionManager.js': { default: ValidatorConnectionManagerMock },
        '../../../src/core/network/services/MessageOrchestrator.js': { default: MessageOrchestratorMock },
        '../../../src/core/network/services/TransactionRateLimiterService.js': { default: TransactionRateLimiterServiceMock },
        '../../../src/core/network/services/ValidatorPendingRequestService.js': { default: PendingRequestServiceMock },
        '../../../src/core/network/services/TransactionCommitService.js': { default: TransactionCommitServiceMock },
        '../../../src/core/network/services/ValidatorHealthCheckService.js': { default: ValidatorHealthCheckServiceMock },
        '../../../src/core/consensus/services/EpochCoordinatorService.js': { default: EpochCoordinatorServiceMock },
        '../../../src/core/network/protocols/NetworkMessages.js': { default: NetworkMessagesMock },
        '../../../src/core/consensus/protocols/ConsensusMessages.js': { default: ConsensusMessagesMock },
        'protomux-wakeup': { default: WakeupMock },
        '../../../src/utils/logger.js': { Logger: LoggerMock },
    });

    const Network = NetworkModule.default;
    const config = {
        enableWallet: true,
        addressPrefix: 'trac',
        connectTimeoutMs: 1_000,
        maxPendingConnections: 10,
        maxValidators: 5,
        maxPeers: 5,
        maxParallel: 1,
        maxServerConnections: 5,
        maxClientConnections: 5,
        dhtBootstrap: [],
        channel: b4a.alloc(32, 1),
    };

    const wallet = {
        publicKey: b4a.alloc(32, 2),
        secretKey: b4a.alloc(64, 3),
        address: 'trac_test',
    };

    const store = new CorestoreMock();
    const state = new EventEmitter();
    state.isAdmin = async () => false;
    state.isIndexer = () => false;
    state.indexerCount = async () => 0;
    state.isAdminAddress = async () => false;
    const network = new Network(state, store, config, wallet);
    await network.ready()

    return { network, store, swarmInstance, validatorConnectionManagerInstance, state };
}

if (isBareRuntime) {
    test('Network#disconnectValidatorPeer coverage is Node-only', t => {
        t.pass('skipped in Bare because esmock depends on node:module');
    });
} else {
    test('Network#disconnectValidatorPeer clears pending validator attempts', async t => {
        const publicKey = 'a'.repeat(64);
        const { network, swarmInstance } = await loadNetwork();

        const status = await network.tryConnect(publicKey, 'validator');
        t.is(status, CONNECTION_STATUS.PENDING, 'connection attempt should remain pending');
        t.ok(network.isConnectionPending(publicKey), 'pending connection should be tracked before invalidation');

        const disconnected = network.disconnectValidatorPeer(publicKey, 'peer invalidated by state event');

        t.ok(disconnected, 'disconnect should report work done');
        t.absent(network.isConnectionPending(publicKey), 'pending connection should be cleared');
        t.is(swarmInstance.leavePeer.callCount, 1, 'peer discovery should be cancelled');
        t.teardown(async () => await network.close());
    });

    test('Network#disconnectValidatorPeer removes tracked validators from the pool', async t => {
        const publicKey = 'b'.repeat(64);
        const { network, swarmInstance, validatorConnectionManagerInstance } = await loadNetwork();

        validatorConnectionManagerInstance.add(publicKey);
        swarmInstance.peers.set(publicKey, { publicKey: b4a.from(publicKey, 'hex') });
        
        const disconnected = network.disconnectValidatorPeer(publicKey, 'peer no longer valid validator');
        
        t.ok(disconnected, 'disconnect should report tracked validator removal');
        t.absent(validatorConnectionManagerInstance.exists(publicKey), 'validator should be removed from connection manager');
        t.alike(validatorConnectionManagerInstance.removed, [{ publicKey }], 'tracked validator should be detached without ending the socket');
        t.is(swarmInstance.leavePeer.callCount, 1, 'leavePeer should be called to clear explicit peer tracking without closing the socket');
        t.teardown(async () => await network.close());
    });

    test('Network#disconnectValidatorPeer ignores non-validator pending peers', async t => {
        const publicKey = 'c'.repeat(64);
        const { network, swarmInstance } = await loadNetwork();

        const status = await network.tryConnect(publicKey, 'rpc');
        t.is(status, CONNECTION_STATUS.PENDING, 'non-validator connection attempt should be pending');
        t.ok(network.isConnectionPending(publicKey), 'non-validator pending connection should be tracked');

        const disconnected = network.disconnectValidatorPeer(publicKey, 'state event should not affect generic peer');

        t.absent(disconnected, 'non-validator peer should be ignored by validator disconnect helper');
        t.ok(network.isConnectionPending(publicKey), 'non-validator pending connection should remain tracked');
        t.is(swarmInstance.leavePeer.callCount, 0, 'generic peer should not be left');
        t.teardown(async () => await network.close());
    });

    test('Network#tryConnect returns CONNECTED and tracks already-connected validator', async t => {
        const publicKey = 'e'.repeat(64);
        const { network, swarmInstance, validatorConnectionManagerInstance } = await loadNetwork();

        const publicKeyBuffer = b4a.from(publicKey, 'hex');
        const connection = createMockConnection(publicKey);
        swarmInstance.peers.set(publicKey, { publicKey: publicKeyBuffer });
        swarmInstance._allConnections.set(publicKeyBuffer, connection);

        const status = await network.tryConnect(publicKey, 'validator');
        t.is(status, CONNECTION_STATUS.CONNECTED, 'returns CONNECTED for ready validator peer');
        t.ok(validatorConnectionManagerInstance.exists(publicKey), 'validator was added to connection manager');
        t.absent(network.isConnectionPending(publicKey), 'pending validator connection was cleared');
        t.teardown(async () => await network.close());
    });

    test('Network#tryConnect returns CONNECTED and promotes into the network-owned indexer manager', async t => {
        const publicKey = 'f'.repeat(64);
        const { network, swarmInstance } = await loadNetwork();

        const publicKeyBuffer = b4a.from(publicKey, 'hex');
        const connection = createMockConnection(publicKey);
        swarmInstance.peers.set(publicKey, { publicKey: publicKeyBuffer });
        swarmInstance._allConnections.set(publicKeyBuffer, connection);

        // Indexer connections are promoted into the single indexer manager Network
        // owns for its lifetime (network.indexerConnectionManager), not a per-call one.
        const addSpy = sinon.spy(network.indexerConnectionManager, 'add');

        const status = await network.tryConnect(publicKey, 'indexer');
        t.is(status, CONNECTION_STATUS.CONNECTED, 'returns CONNECTED for ready indexer peer');
        t.ok(addSpy.calledWith(publicKeyBuffer, connection), 'connection was promoted into the network-owned indexer manager');
        t.absent(network.isConnectionPending(publicKey), 'pending indexer connection was cleared');
        t.teardown(async () => await network.close());
    });

    test('Network tryConnect timeout clears pending connection', async t => {
        const publicKey = 'g'.repeat(64);
        const { network } = await loadNetwork();

        const status = await network.tryConnect(publicKey, 'validator');
        t.is(status, CONNECTION_STATUS.PENDING, 'connection is initially pending');
        t.ok(network.isConnectionPending(publicKey), 'pending is tracked');

        await new Promise(resolve => setTimeout(resolve, 1_100));

        t.absent(network.isConnectionPending(publicKey), 'pending is cleared after timeout elapses');
        t.teardown(async () => await network.close());
    });

    test('Network swarm connection event promotes pending connection', async t => {
        const publicKey = '12'.repeat(32);
        const { network, swarmInstance, validatorConnectionManagerInstance } = await loadNetwork();

        const status = await network.tryConnect(publicKey, 'validator');
        t.is(status, CONNECTION_STATUS.PENDING, 'connection is pending after joinPeer');

        const connection = createMockConnection(publicKey);
        await swarmInstance.emit('connection', connection);

        t.ok(validatorConnectionManagerInstance.exists(publicKey), 'validator was added after swarm connection');
        t.absent(network.isConnectionPending(publicKey), 'pending validator connection was cleared');
        t.teardown(async () => await network.close());
    });

    test('Network disconnects validator peers when state role events invalidate them', async t => {
        const publicKey = 'd'.repeat(64);
        const publicKeyBuffer = b4a.from(publicKey, 'hex');
        const { network, swarmInstance, validatorConnectionManagerInstance, state } = await loadNetwork();

        validatorConnectionManagerInstance.add(publicKey);
        swarmInstance.peers.set(publicKey, { publicKey: publicKeyBuffer });

        state.emit(CustomEventType.UNWRITABLE, publicKeyBuffer);
        t.absent(validatorConnectionManagerInstance.exists(publicKey), 'unwritable peer should be removed from validator pool');
        t.is(swarmInstance.leavePeer.callCount, 1, 'unwritable peer should be removed from explicit peer tracking');

        validatorConnectionManagerInstance.add(publicKey);
        swarmInstance.peers.set(publicKey, { publicKey: publicKeyBuffer });

        state.emit(CustomEventType.IS_INDEXER, publicKeyBuffer);
        await Promise.resolve(); // IS_INDEXER handler is async (awaits indexerCount), must yield
        t.absent(validatorConnectionManagerInstance.exists(publicKey), 'promoted indexer should be removed from validator pool');
        // Promotion keeps the underlying connection alive (endConnection: false) so it can be
        // reused for the indexer role, so it must NOT leave the peer - unlike a hard disconnect.
        t.is(swarmInstance.leavePeer.callCount, 1, 'promoted indexer should not leave the peer, connection is reused');
        t.teardown(async () => await network.close());
    });

    test('Network#pendingConnectionsCount reflects active pending connections', async t => {
        const { network } = await loadNetwork();

        t.is(network.pendingConnectionsCount(), 0, 'starts at 0');

        await network.tryConnect('a'.repeat(64), 'validator');
        t.is(network.pendingConnectionsCount(), 1, 'increments after tryConnect');

        await network.tryConnect('b'.repeat(64), 'validator');
        t.is(network.pendingConnectionsCount(), 2, 'increments for each pending');

        t.teardown(async () => await network.close());
    });
}
