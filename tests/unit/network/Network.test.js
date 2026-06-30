import { test } from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import EventEmitter from 'bare-events';
import { CONNECTION_STATUS, CustomEventType, EventType } from '../../../src/utils/constants.js';

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
        protocolSession: withProtocolSession ? {
            isProbed: () => true,
            probe: sinon.stub().resolves(),
            isHealthCheckSupported: () => false,
            close: sinon.stub(),
        } : null,
        consensusProtocolSession: withConsensusSession ? { close: sinon.stub() } : null,
        on: sinon.stub(),
    };
}

async function loadNetwork() {
    const { default: esmock } = await import('esmock');
    let swarmInstance = null;
    let connectionManagerInstance = null;

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

    class ConnectionManagerMock {
        constructor() {
            connectionManagerInstance = this;
            this.validators = new Set();
            this.removed = [];
        }

        exists(publicKey) {
            return this.validators.has(normalizePublicKey(publicKey));
        }

        remove(publicKey, options = {}) {
            const publicKeyHex = normalizePublicKey(publicKey);
            this.removed.push({ publicKey: publicKeyHex, options });
            this.validators.delete(publicKeyHex);
        }

        addValidator(publicKey) {
            this.validators.add(normalizePublicKey(publicKey));
            return true;
        }

        connected(publicKey) {
            return this.exists(publicKey);
        }

        connectedValidators() {
            return Array.from(this.validators);
        }

        connectionCount() {
            return this.validators.size;
        }

        maxConnectionsReached() {
            return false;
        }

        subscribeToHealthChecks() {}
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

    class EpochProofProposalServiceMock {
        async ready() {}
        start() {}
        async close() {}
    }

    class LoggerMock {
        info() {}
        debug() {}
        error() {}
    }

    class NetworkMessagesMock {
        async setupProtomuxMessages() {}
    }

    class ConsensusMessagesMock {
        async setupProtomuxMessages() {}
    }

    class IndexerConnectionManagerMock {
        constructor(max = 0) {
            this.max = max;
            this.indexers = new Set();
        }

        setMax(max) {
            this.max = max;
        }

        add(publicKey) {
            this.indexers.add(normalizePublicKey(publicKey));
            return true;
        }

        remove(publicKey) {
            this.indexers.delete(normalizePublicKey(publicKey));
        }

        exists(publicKey) {
            return this.indexers.has(normalizePublicKey(publicKey));
        }

        connected(publicKey) {
            return this.exists(publicKey);
        }

        clear() {
            this.indexers.clear();
        }
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
        '../../../src/core/network/services/ConnectionManager.js': { default: ConnectionManagerMock },
        '../../../src/core/network/services/MessageOrchestrator.js': { default: MessageOrchestratorMock },
        '../../../src/core/network/services/TransactionRateLimiterService.js': { default: TransactionRateLimiterServiceMock },
        '../../../src/core/network/services/ValidatorPendingRequestService.js': { default: PendingRequestServiceMock },
        '../../../src/core/network/services/TransactionCommitService.js': { default: TransactionCommitServiceMock },
        '../../../src/core/network/services/ValidatorHealthCheckService.js': { default: ValidatorHealthCheckServiceMock },
        '../../../src/core/consensus/services/EpochProofProposalService.js': { default: EpochProofProposalServiceMock },
        '../../../src/core/network/protocols/NetworkMessages.js': { default: NetworkMessagesMock },
        '../../../src/core/consensus/protocols/ConsensusMessages.js': { default: ConsensusMessagesMock },
        '../../../src/core/consensus/services/IndexerConnectionManager.js': { default: IndexerConnectionManagerMock },
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
    state.isIndexerAddress = async () => false;
    state.isAdminAddress = async () => false;
    const network = new Network(state, store, config, wallet);
    await network.ready()

    return { network, store, swarmInstance, connectionManagerInstance, state };
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
        const { network, swarmInstance, connectionManagerInstance } = await loadNetwork();

        connectionManagerInstance.addValidator(publicKey);
        swarmInstance.peers.set(publicKey, { publicKey: b4a.from(publicKey, 'hex') });
        
        const disconnected = network.disconnectValidatorPeer(publicKey, 'peer no longer valid validator');
        
        t.ok(disconnected, 'disconnect should report tracked validator removal');
        t.absent(connectionManagerInstance.exists(publicKey), 'validator should be removed from connection manager');
        t.alike(connectionManagerInstance.removed, [{ publicKey, options: { endConnection: false } }], 'tracked validator should be detached without ending the socket');
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
        const { network, swarmInstance, connectionManagerInstance } = await loadNetwork();

        const publicKeyBuffer = b4a.from(publicKey, 'hex');
        const connection = createMockConnection(publicKey);
        swarmInstance.peers.set(publicKey, { publicKey: publicKeyBuffer });
        swarmInstance._allConnections.set(publicKeyBuffer, connection);

        const status = await network.tryConnect(publicKey, 'validator');
        t.is(status, CONNECTION_STATUS.CONNECTED, 'returns CONNECTED for ready validator peer');
        t.ok(connectionManagerInstance.exists(publicKey), 'validator was added to connection manager');
        t.absent(network.isConnectionPending(publicKey), 'pending validator connection was cleared');
        t.teardown(async () => await network.close());
    });

    test('Network#tryConnect returns CONNECTED and tracks already-connected indexer', async t => {
        const publicKey = 'f'.repeat(64);
        const { network, swarmInstance } = await loadNetwork();

        const publicKeyBuffer = b4a.from(publicKey, 'hex');
        const connection = createMockConnection(publicKey);
        swarmInstance.peers.set(publicKey, { publicKey: publicKeyBuffer });
        swarmInstance._allConnections.set(publicKeyBuffer, connection);

        const status = await network.tryConnect(publicKey, 'indexer');
        t.is(status, CONNECTION_STATUS.CONNECTED, 'returns CONNECTED for ready indexer peer');
        t.ok(network.indexerConnectionManager.connected(publicKey), 'indexer was added to connection manager');
        t.absent(network.isConnectionPending(publicKey), 'pending indexer connection was cleared');
        t.teardown(async () => await network.close());
    });

    test('Network VALIDATOR_CONNECTION_TIMEOUT clears pending connection', async t => {
        const publicKey = 'g'.repeat(64);
        const { network } = await loadNetwork();

        const status = await network.tryConnect(publicKey, 'validator');
        t.is(status, CONNECTION_STATUS.PENDING, 'connection is initially pending');
        t.ok(network.isConnectionPending(publicKey), 'pending is tracked');

        network.emit(EventType.VALIDATOR_CONNECTION_TIMEOUT, { publicKey, type: 'validator', timeoutMs: 1000 });

        t.absent(network.isConnectionPending(publicKey), 'pending is cleared after timeout event');
        t.teardown(async () => await network.close());
    });

    test('Network swarm connection event promotes pending connection', async t => {
        const publicKey = '12'.repeat(32);
        const { network, swarmInstance, connectionManagerInstance } = await loadNetwork();

        const status = await network.tryConnect(publicKey, 'validator');
        t.is(status, CONNECTION_STATUS.PENDING, 'connection is pending after joinPeer');

        const connection = createMockConnection(publicKey);
        await swarmInstance.emit('connection', connection);

        t.ok(connectionManagerInstance.exists(publicKey), 'validator was added after swarm connection');
        t.absent(network.isConnectionPending(publicKey), 'pending validator connection was cleared');
        t.teardown(async () => await network.close());
    });

    test('Network disconnects validator peers when state role events invalidate them', async t => {
        const publicKey = 'd'.repeat(64);
        const publicKeyBuffer = b4a.from(publicKey, 'hex');
        const { network, swarmInstance, connectionManagerInstance, state } = await loadNetwork();

        connectionManagerInstance.addValidator(publicKey);
        swarmInstance.peers.set(publicKey, { publicKey: publicKeyBuffer });

        state.emit(CustomEventType.UNWRITABLE, publicKeyBuffer);
        t.absent(connectionManagerInstance.exists(publicKey), 'unwritable peer should be removed from validator pool');
        t.is(swarmInstance.leavePeer.callCount, 1, 'unwritable peer should be removed from explicit peer tracking');

        connectionManagerInstance.addValidator(publicKey);
        swarmInstance.peers.set(publicKey, { publicKey: publicKeyBuffer });

        state.emit(CustomEventType.IS_INDEXER, publicKeyBuffer);
        await Promise.resolve(); // IS_INDEXER handler is async (awaits indexerCount), must yield
        t.absent(connectionManagerInstance.exists(publicKey), 'promoted indexer should be removed from validator pool');
        t.is(swarmInstance.leavePeer.callCount, 2, 'promoted indexer should be removed from explicit peer tracking');
        t.teardown(async () => await network.close());
    });

    test('Network#disconnectIndexerPeer removes a tracked indexer', async t => {
        const publicKey = 'e'.repeat(64);
        const publicKeyBuffer = b4a.from(publicKey, 'hex');
        const { network, swarmInstance } = await loadNetwork();

        // indexerCount() returns 0 in mock, so we bump the max before adding
        network.indexerConnectionManager.setMax(10);
        network.indexerConnectionManager.add(publicKeyBuffer, {});
        t.ok(network.indexerConnectionManager.connected(publicKeyBuffer), 'indexer is tracked');

        swarmInstance.peers.set(publicKey, { publicKey: publicKeyBuffer });

        const disconnected = network.disconnectIndexerPeer(publicKeyBuffer, 'demoted from indexer');
        t.ok(disconnected, 'disconnect reports work done');
        t.absent(network.indexerConnectionManager.connected(publicKeyBuffer), 'indexer removed from manager');
        t.teardown(async () => await network.close());
    });

    test('Network#disconnectIndexerPeer returns false when indexer not tracked', async t => {
        const publicKey = 'f'.repeat(64);
        const publicKeyBuffer = b4a.from(publicKey, 'hex');
        const { network } = await loadNetwork();

        const disconnected = network.disconnectIndexerPeer(publicKeyBuffer, 'never tracked');
        t.absent(disconnected, 'returns false when not tracked');
        t.teardown(async () => await network.close());
    });

    test('Network IS_NON_INDEXER event removes demoted indexer peer', async t => {
        const publicKey = '1'.repeat(64);
        const publicKeyBuffer = b4a.from(publicKey, 'hex');
        const { network, state } = await loadNetwork();

        // indexerCount() returns 0 in mock, so we bump the max before adding
        network.indexerConnectionManager.setMax(10);
        network.indexerConnectionManager.add(publicKeyBuffer, {});
        t.ok(network.indexerConnectionManager.connected(publicKeyBuffer), 'indexer tracked before demotion');

        state.emit(CustomEventType.IS_NON_INDEXER, publicKeyBuffer);
        await Promise.resolve(); // IS_NON_INDEXER handler is async (awaits indexerCount)

        t.absent(network.indexerConnectionManager.connected(publicKeyBuffer), 'indexer removed after IS_NON_INDEXER');
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
