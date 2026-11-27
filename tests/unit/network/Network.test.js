import { test } from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import EventEmitter from 'bare-events';
import { CONNECTION_STATUS, EventType } from '../../../src/utils/constants.js';
import ConnectionManager from '../../../src/core/network/services/ConnectionManager.js';

const isBareRuntime = typeof globalThis.Bare !== 'undefined';

function normalizePublicKey(publicKey) {
    if (typeof publicKey === 'string') return publicKey;
    if (b4a.isBuffer(publicKey)) return b4a.toString(publicKey, 'hex');
    return null;
}

async function loadNetwork(options = {}) {
    const { default: esmock } = await import('esmock');
    let swarmInstance = null;
    let connectionManagerInstance = null;
    let pendingRequestServiceInstance = null;
    const startHealthCheck = sinon.spy();

    class HyperswarmMock extends EventEmitter {
        constructor() {
            super();
            swarmInstance = this;
            this.peers = new Map();
            this._allConnections = new Map();
            this.joinPeer = sinon.stub().callsFake((target) => {
                const publicKeyHex = b4a.toString(target, 'hex');
                this.peers.set(publicKeyHex, { publicKey: target, explicit: true });
            });
            this.leavePeer = sinon.stub();
            this.join = sinon.stub();
            this.flush = sinon.stub();
            this.destroy = sinon.stub().callsFake(async () => {
                this.removeAllListeners();
            });
        }
    }

    class ConnectionManagerMock {
        constructor() {
            connectionManagerInstance = this;
            this.validators = new Map();
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

        addValidator(publicKey, connection = null) {
            this.validators.set(normalizePublicKey(publicKey), connection);
            return true;
        }

        isCurrent(publicKey, connection) {
            const publicKeyHex = normalizePublicKey(publicKey);
            return this.validators.has(publicKeyHex) && this.validators.get(publicKeyHex) === connection;
        }

        connected(publicKey) {
            return this.exists(publicKey);
        }

        connectedValidators() {
            return Array.from(this.validators.keys());
        }

        connectionCount() {
            return this.validators.size;
        }

        maxConnectionsReached() {
            return false;
        }

        subscribeToHealthChecks() {}
        close() { this.validators.clear(); }
    }

    class TransactionPoolServiceMock {
        start() {}
        async stopPool() {}
    }

    class ValidatorObserverServiceMock {
        start() {}
        async stopValidatorObserver() {}
    }

    class MessageOrchestratorMock {
        setWallet() {}
    }

    class PendingRequestServiceMock {
        constructor() {
            pendingRequestServiceInstance = this;
            this.rejected = [];
        }

        isProbePending() { return false; }

        rejectPendingRequestsForPeer(publicKey) {
            this.rejected.push(normalizePublicKey(publicKey));
        }

        close() {}
    }

    class TransactionCommitServiceMock {
        close() {}
    }

    class ValidatorHealthCheckServiceMock extends EventEmitter {
        async ready() {}
        start = startHealthCheck;
        stop() {}
        has() { return false; }
        close() {}
    }

    class LoggerMock {
        info() {}
        debug() {}
        error() {}
    }

    class NetworkMessagesMock {
        async setupProtomuxMessages(connection) {
            if (options.setupProtomuxMessages) {
                return options.setupProtomuxMessages(connection);
            }
        }
    }

    class TransactionRateLimiterServiceMock {}

    const NetworkModule = await esmock('../../../src/core/network/Network.js', {
        hyperswarm: HyperswarmMock,
        '../../../src/core/network/services/TransactionPoolService.js': { default: TransactionPoolServiceMock },
        '../../../src/core/network/services/ValidatorObserverService.js': { default: ValidatorObserverServiceMock },
        '../../../src/core/network/services/ConnectionManager.js': { default: options.useRealManager ? ConnectionManager : ConnectionManagerMock },
        '../../../src/core/network/services/MessageOrchestrator.js': { default: MessageOrchestratorMock },
        '../../../src/core/network/services/TransactionRateLimiterService.js': { default: TransactionRateLimiterServiceMock },
        '../../../src/core/network/services/PendingRequestService.js': { default: PendingRequestServiceMock },
        '../../../src/core/network/services/TransactionCommitService.js': { default: TransactionCommitServiceMock },
        '../../../src/core/network/services/ValidatorHealthCheckService.js': { default: ValidatorHealthCheckServiceMock },
        '../../../src/core/network/protocols/NetworkMessages.js': { default: NetworkMessagesMock },
        '../../../src/utils/logger.js': { Logger: LoggerMock },
        '../../../src/utils/helpers.js': { sleep: sinon.stub().resolves() },
    });

    const Network = NetworkModule.default;
    const config = {
        enableWallet: true,
        connectTimeoutMs: 1_000,
        maxPendingConnections: 10,
        maxValidators: options.maxValidators ?? 5,
        addressPrefix: 'trac',
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

    const network = new Network({}, config, wallet.address);
    const store = options.store ?? {
        replicate: sinon.stub().returns(new EventEmitter()),
    };
    await network.replicate({}, store, wallet);

    return { network, swarmInstance, connectionManagerInstance, pendingRequestServiceInstance, startHealthCheck, store, wallet };
}

function deferred() {
    let resolve;
    const promise = new Promise((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

if (isBareRuntime) {
    test('Network#disconnectValidatorPeer coverage is Node-only', t => {
        t.pass('skipped in Bare because esmock depends on node:module');
    });
} else {
    test('Network releases only its own network and swarm listeners', async t => {
        const { network, swarmInstance } = await loadNetwork();
        await network.ready();
        const otherListener = sinon.spy();
        const events = [EventType.VALIDATOR_CONNECTION_READY, EventType.VALIDATOR_CONNECTION_TIMEOUT];
        for (const event of events) network.on(event, otherListener);
        swarmInstance.on('connection', otherListener);
        network.setupNetworkListeners();
        for (const event of events) t.is(network.listenerCount(event), 2);
        swarmInstance.destroy.callsFake(async () => {
            t.alike(swarmInstance.rawListeners('connection'), [otherListener]);
        });
        const closing = network.close();
        for (const event of events) t.alike(network.rawListeners(event), [otherListener]);
        await closing;
    });

    for (const interruption of ['transport closes', 'network closes', 'pool is full']) {
        test(`Network skips validator admission and health checks when ${interruption} during a probe`, async t => {
            const { network, swarmInstance, startHealthCheck } = await loadNetwork({
                useRealManager: true,
                maxValidators: interruption === 'pool is full' ? 0 : 1,
            });
            await network.ready();
            t.teardown(() => network.close());
            const publicKey = 'a'.repeat(64);
            const target = b4a.from(publicKey, 'hex');
            const connection = new EventEmitter();
            const probe = deferred();
            connection.remotePublicKey = target;
            connection.protocolSession = {
                isProbed: () => false,
                probe: sinon.stub().returns(probe.promise),
                isHealthCheckSupported: () => true,
            };
            swarmInstance.peers.set(publicKey, { publicKey: target, explicit: true });
            swarmInstance._allConnections.set(target, connection);
            await network.tryConnect(publicKey, 'validator');
            t.ok(connection.protocolSession.probe.calledOnce);

            if (interruption === 'transport closes') {
                connection.destroyed = true;
                connection.emit('close');
            } else if (interruption === 'network closes') {
                await network.close();
            }
            probe.resolve();
            await probe.promise;
            t.absent(network.validatorConnectionManager.exists(publicKey));
            t.is(connection.listenerCount('close'), 0);
            t.absent(startHealthCheck.called);
        });
    }

    test('Network#tryConnect rejoins a retained peer without explicit retries', async t => {
        const { network, swarmInstance } = await loadNetwork();
        t.teardown(() => network.cleanupPendingConnections());
        const publicKey = 'd'.repeat(64);
        const target = b4a.from(publicKey, 'hex');
        swarmInstance.peers.set(publicKey, { publicKey: target, explicit: false, waiting: false });

        t.is(await network.tryConnect(publicKey, 'validator'), CONNECTION_STATUS.PENDING);
        t.is(swarmInstance.joinPeer.callCount, 1, 'retained peer is explicitly joined again');
        t.alike(swarmInstance.joinPeer.firstCall?.args, [target]);
        t.is(await network.tryConnect(publicKey, 'validator'), CONNECTION_STATUS.IGNORED);
        t.is(swarmInstance.joinPeer.callCount, 1, 'pending attempts remain deduplicated');
    });

    test('Network#tryConnect preserves backoff for an already explicit peer', async t => {
        const { network, swarmInstance } = await loadNetwork();
        t.teardown(() => network.cleanupPendingConnections());
        const publicKey = 'd'.repeat(64);
        swarmInstance.peers.set(publicKey, {
            publicKey: b4a.from(publicKey, 'hex'), explicit: true, waiting: true,
        });

        t.is(await network.tryConnect(publicKey, 'validator'), CONNECTION_STATUS.PENDING);
        t.is(swarmInstance.joinPeer.callCount, 0, 'existing retry timer is left to Hyperswarm');
    });

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
    });

    test('Network removes a validator when its tracked connection closes', async t => {
        const publicKey = 'd'.repeat(64);
        const { swarmInstance, connectionManagerInstance, pendingRequestServiceInstance } = await loadNetwork();
        const connection = new EventEmitter();
        connection.remotePublicKey = b4a.from(publicKey, 'hex');
        connection.destroy = sinon.stub();
        const onError = sinon.spy();
        connection.on('error', onError);

        swarmInstance.emit('connection', connection);
        await new Promise(resolve => setTimeout(resolve, 0));

        connectionManagerInstance.addValidator(publicKey, connection);
        connection.emit('close');

        t.alike(connection.rawListeners('error'), [onError]);
        t.is(connection.listenerCount('close'), 0);
        t.absent(connectionManagerInstance.exists(publicKey), 'tracked validator should be removed');
        t.alike(
            connectionManagerInstance.removed,
            [{ publicKey, options: {} }],
            'removal should be requested once for the tracked validator'
        );
        t.alike(pendingRequestServiceInstance.rejected, [publicKey], 'pending requests for the peer should be rejected');
        t.is(swarmInstance.leavePeer.callCount, 1, 'peer discovery should be cancelled');
    });

    test('Network keeps a validator when a connection other than the tracked one closes', async t => {
        const publicKey = 'e'.repeat(64);
        const { swarmInstance, connectionManagerInstance, pendingRequestServiceInstance } = await loadNetwork();
        const first = new EventEmitter();
        first.remotePublicKey = b4a.from(publicKey, 'hex');
        first.destroy = sinon.stub();
        const second = new EventEmitter();
        second.remotePublicKey = b4a.from(publicKey, 'hex');
        second.destroy = sinon.stub();

        swarmInstance.emit('connection', first);
        await new Promise(resolve => setTimeout(resolve, 0));
        swarmInstance.emit('connection', second);
        await new Promise(resolve => setTimeout(resolve, 0));

        connectionManagerInstance.addValidator(publicKey, second);
        first.emit('close');

        t.ok(connectionManagerInstance.exists(publicKey), 'tracked validator should stay in the pool');
        t.alike(connectionManagerInstance.removed, [], 'no removal should be requested');
        t.ok(connectionManagerInstance.isCurrent(publicKey, second), 'the tracked connection should stay unchanged');
        t.alike(pendingRequestServiceInstance.rejected, [publicKey], 'pending requests for the peer should be rejected');
        t.is(swarmInstance.leavePeer.callCount, 1, 'peer discovery should be cancelled');

        second.emit('close');
        t.alike(
            connectionManagerInstance.removed,
            [{ publicKey, options: {} }],
            'the tracked connection closing should remove the validator'
        );
    });

    test('Network#close prevents late connection setup from replicating a closed Corestore', async t => {
        const setupEntered = deferred();
        const resumeSetup = deferred();
        const store = {
            replicate: sinon.stub().throws(new Error('Corestore is closed')),
        };
        const setupProtomuxMessages = sinon.stub().callsFake(async (connection) => {
            connection.protocolSession = {
                close: sinon.stub(),
            };
            setupEntered.resolve();
            await resumeSetup.promise;
        });
        const { network, swarmInstance, wallet } = await loadNetwork({ store, setupProtomuxMessages });
        const connection = new EventEmitter();
        connection.remotePublicKey = b4a.alloc(32, 4);
        connection.destroy = sinon.stub();

        swarmInstance.emit('connection', connection);
        await setupEntered.promise;

        const closePromise = network.close();
        resumeSetup.resolve();
        await closePromise;
        await new Promise(resolve => setTimeout(resolve, 0));

        t.is(store.replicate.callCount, 0, 'late connection should not replicate after network close begins');
        t.is(connection.destroy.callCount, 1, 'late connection should be destroyed');
        await t.exception(
            () => network.replicate({}, store, wallet),
            /Network is closing or already closed/,
            'replication should reject after network close'
        );
        t.is(network.swarm, null, 'closed network should not create a new swarm');
        t.is(swarmInstance.destroy.callCount, 1, 'only the original swarm should be destroyed');
    });
}
