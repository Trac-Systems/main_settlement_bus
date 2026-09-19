import { test } from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import EventEmitter from 'bare-events';
import { CONNECTION_STATUS, NetworkOperationType, ResultCode } from '../../../src/utils/constants.js';
import PendingRequestService from '../../../src/core/network/services/PendingRequestService.js';

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

    class PendingRequestServiceMock extends PendingRequestService {
        constructor(config) {
            super(config);
            pendingRequestServiceInstance = this;
            this.rejected = [];
        }

        isProbePending() { return false; }

        rejectPendingRequestsForConnection(connection, error) {
            this.rejected.push(connection);
            return super.rejectPendingRequestsForConnection(connection, error);
        }
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
        '../../../src/core/network/services/ConnectionManager.js': { default: ConnectionManagerMock },
        '../../../src/core/network/services/MessageOrchestrator.js': { default: MessageOrchestratorMock },
        '../../../src/core/network/services/TransactionRateLimiterService.js': { default: TransactionRateLimiterServiceMock },
        '../../../src/core/network/services/PendingRequestService.js': { default: PendingRequestServiceMock },
        '../../../src/core/network/services/TransactionCommitService.js': { default: TransactionCommitServiceMock },
        '../../../src/core/network/services/ValidatorHealthCheckService.js': { default: ValidatorHealthCheckServiceMock },
        '../../../src/core/network/protocols/NetworkMessages.js': { default: NetworkMessagesMock },
        '../../../src/utils/logger.js': { Logger: LoggerMock },
    });

    const Network = NetworkModule.default;
    const config = {
        addressPrefix: 'trac',
        pendingRequestTimeout: 10000,
        maxPendingRequestsInPendingRequestsService: 10,
        enableWallet: true,
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

    const network = new Network({}, config, wallet.address);
    const store = options.store ?? {
        replicate: sinon.stub().returns(new EventEmitter()),
    };
    await network.replicate({}, store, wallet);

    return { network, swarmInstance, connectionManagerInstance, pendingRequestServiceInstance, store, wallet };
}

function deferred() {
    let resolve;
    const promise = new Promise((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

function makeConnection(publicKey) {
    const connection = new EventEmitter();
    connection.remotePublicKey = b4a.from(publicKey, 'hex');
    connection.protocolSession = { close: sinon.stub() };
    connection.destroy = sinon.stub().callsFake(() => connection.emit('close'));
    return connection;
}

function pendingRequest(service, publicKey, id, connection) {
    const promise = service.registerPendingRequest(publicKey, {
        id,
        type: NetworkOperationType.BROADCAST_TRANSACTION_REQUEST,
    }, connection);
    promise.catch(() => {});
    return promise;
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
    });

    test('Network#disconnectValidatorPeer removes tracked validators from the pool', async t => {
        const publicKey = 'b'.repeat(64);
        const { network, swarmInstance, connectionManagerInstance } = await loadNetwork();

        connectionManagerInstance.addValidator(publicKey);
        swarmInstance.peers.set(publicKey, { publicKey: b4a.from(publicKey, 'hex') });

        const disconnected = network.disconnectValidatorPeer(publicKey, 'peer no longer valid validator');

        t.ok(disconnected, 'disconnect should report tracked validator removal');
        t.absent(connectionManagerInstance.exists(publicKey), 'validator should be removed from connection manager');
        t.alike(connectionManagerInstance.removed, [{ publicKey, options: { endConnection: false, reason: 'peer no longer valid validator' } }], 'tracked validator should be detached without ending the socket and retain the initiating reason');
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

        swarmInstance.emit('connection', connection);
        await new Promise(resolve => setTimeout(resolve, 0));

        connectionManagerInstance.addValidator(publicKey, connection);
        connection.emit('close');

        t.absent(connectionManagerInstance.exists(publicKey), 'tracked validator should be removed');
        t.alike(
            connectionManagerInstance.removed,
            [{ publicKey, options: {
                endConnection: false,
                expectedConnection: connection,
                reason: 'connection_closed',
                error_type: undefined,
            } }],
            'removal should be requested once for the tracked validator'
        );
        t.alike(pendingRequestServiceInstance.rejected, [connection], 'only requests for the closed connection should be rejected');
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
        t.teardown(() => pendingRequestServiceInstance.close());
        const oldRequest = pendingRequest(pendingRequestServiceInstance, publicKey, 'old-close', first);
        const newRequest = pendingRequest(pendingRequestServiceInstance, publicKey, 'new-close', second);
        first.emit('close');

        t.ok(connectionManagerInstance.exists(publicKey), 'tracked validator should stay in the pool');
        t.alike(connectionManagerInstance.removed, [], 'no removal should be requested');
        t.ok(connectionManagerInstance.isCurrent(publicKey, second), 'the tracked connection should stay unchanged');
        t.alike(pendingRequestServiceInstance.rejected, [first], 'only requests on the old connection are rejected');
        await t.exception(oldRequest, /Connection closed before response/);
        t.ok(pendingRequestServiceInstance.has('new-close'), 'replacement request remains pending');
        pendingRequestServiceInstance.resolvePendingRequest('new-close', ResultCode.OK);
        t.is(await newRequest, ResultCode.OK, 'replacement can still complete its request');
        t.is(swarmInstance.leavePeer.callCount, 0, 'discovery stays active while a replacement socket exists');

        second.emit('close');
        t.alike(
            connectionManagerInstance.removed,
            [{ publicKey, options: {
                endConnection: false,
                expectedConnection: second,
                reason: 'connection_closed',
                error_type: undefined,
            } }],
            'the tracked connection closing should remove the validator'
        );
        t.is(swarmInstance.leavePeer.callCount, 1, 'discovery is cancelled only after the last socket closes');
    });

    test('Network keeps replacement requests pending when an old connection emits an error', async t => {
        const publicKey = 'f'.repeat(64);
        const { swarmInstance, connectionManagerInstance, pendingRequestServiceInstance } = await loadNetwork();
        t.teardown(() => pendingRequestServiceInstance.close());
        const first = makeConnection(publicKey);
        const second = makeConnection(publicKey);
        swarmInstance.emit('connection', first);
        swarmInstance.emit('connection', second);
        await new Promise(resolve => setTimeout(resolve, 0));
        connectionManagerInstance.addValidator(publicKey, second);
        const oldRequest = pendingRequest(pendingRequestServiceInstance, publicKey, 'old-error', first);
        const newRequest = pendingRequest(pendingRequestServiceInstance, publicKey, 'new-error', second);

        first.emit('error', new Error('old socket failed'));

        await t.exception(oldRequest, /old socket failed/);
        t.ok(pendingRequestServiceInstance.has('new-error'), 'replacement request survives the old error');
        t.ok(connectionManagerInstance.isCurrent(publicKey, second));
        t.is(swarmInstance.leavePeer.callCount, 0);
        pendingRequestServiceInstance.resolvePendingRequest('new-error', ResultCode.OK);
        t.is(await newRequest, ResultCode.OK);
    });

    test('Network preserves a replacement when an older connection fails asynchronous setup', async t => {
        const publicKey = '1'.repeat(64);
        const first = makeConnection(publicKey);
        const second = makeConnection(publicKey);
        const setupEntered = deferred();
        const resumeSetup = deferred();
        const { swarmInstance, connectionManagerInstance, pendingRequestServiceInstance } = await loadNetwork({
            async setupProtomuxMessages(connection) {
                if (connection === first) {
                    setupEntered.resolve();
                    await resumeSetup.promise;
                    throw new Error('old setup failed');
                }
            },
        });
        t.teardown(() => pendingRequestServiceInstance.close());
        swarmInstance.emit('connection', first);
        await setupEntered.promise;
        swarmInstance.emit('connection', second);
        await new Promise(resolve => setTimeout(resolve, 0));
        connectionManagerInstance.addValidator(publicKey, second);
        const oldRequest = pendingRequest(pendingRequestServiceInstance, publicKey, 'old-setup', first);
        const newRequest = pendingRequest(pendingRequestServiceInstance, publicKey, 'new-setup', second);

        resumeSetup.resolve();
        await t.exception(oldRequest, /old setup failed/);
        await new Promise(resolve => setTimeout(resolve, 0));
        t.is(first.destroy.callCount, 1);
        t.ok(connectionManagerInstance.isCurrent(publicKey, second));
        t.ok(pendingRequestServiceInstance.has('new-setup'));
        t.is(swarmInstance.leavePeer.callCount, 0, 'old setup failure does not cancel replacement discovery');
        pendingRequestServiceInstance.resolvePendingRequest('new-setup', ResultCode.OK);
        t.is(await newRequest, ResultCode.OK);
    });

    test('Network preserves discovery for a replacement still initializing when an old socket closes', async t => {
        const publicKey = '2'.repeat(64);
        const first = makeConnection(publicKey);
        const second = makeConnection(publicKey);
        const setupEntered = deferred();
        const resumeSetup = deferred();
        const { swarmInstance, store } = await loadNetwork({
            async setupProtomuxMessages(connection) {
                if (connection === second) {
                    setupEntered.resolve();
                    await resumeSetup.promise;
                }
            },
        });
        swarmInstance.emit('connection', first);
        await new Promise(resolve => setTimeout(resolve, 0));
        swarmInstance.emit('connection', second);
        await setupEntered.promise;

        first.emit('close');
        t.is(swarmInstance.leavePeer.callCount, 0);
        resumeSetup.resolve();
        await new Promise(resolve => setTimeout(resolve, 0));
        t.is(store.replicate.callCount, 2, 'replacement can complete initialization');
        second.emit('close');
        t.is(swarmInstance.leavePeer.callCount, 1);
    });

    test('Network does not replicate a socket that closes during initialization', async t => {
        const publicKey = '3'.repeat(64);
        const connection = makeConnection(publicKey);
        const setupEntered = deferred();
        const resumeSetup = deferred();
        const { swarmInstance, store } = await loadNetwork({
            async setupProtomuxMessages() {
                setupEntered.resolve();
                await resumeSetup.promise;
            },
        });
        swarmInstance.emit('connection', connection);
        await setupEntered.promise;
        connection.emit('close');
        resumeSetup.resolve();
        await new Promise(resolve => setTimeout(resolve, 0));
        t.is(store.replicate.callCount, 0);
        t.is(swarmInstance.leavePeer.callCount, 1, 'close cleanup runs once even if destroy emits close again');
    });

    test('Network does not re-add a closed validator after its probe finishes', async t => {
        const publicKey = '4'.repeat(64);
        const connection = makeConnection(publicKey);
        const probeEntered = deferred();
        const finishProbe = deferred();
        connection.protocolSession.isProbed = () => false;
        connection.protocolSession.probe = async () => {
            probeEntered.resolve();
            await finishProbe.promise;
        };
        connection.protocolSession.isHealthCheckSupported = () => true;
        const { network, swarmInstance, connectionManagerInstance } = await loadNetwork();
        network.setupNetworkListeners();
        t.teardown(() => network.cleanupNetworkListeners());
        t.teardown(() => network.cleanupPendingConnections());
        await network.tryConnect(publicKey, 'validator');
        swarmInstance.emit('connection', connection);
        await probeEntered.promise;

        connection.emit('close');
        finishProbe.resolve();
        await new Promise(resolve => setTimeout(resolve, 0));
        t.absent(connectionManagerInstance.exists(publicKey), 'late probe result cannot restore the closed socket');
        t.is(swarmInstance.leavePeer.callCount, 1);
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
