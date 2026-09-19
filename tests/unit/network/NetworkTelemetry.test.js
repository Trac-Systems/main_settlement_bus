import { test } from 'brittle';
import EventEmitter from 'bare-events';
import b4a from 'b4a';
import { EventType, NetworkOperationType, ResultCode } from '../../../src/utils/constants.js';
import PendingRequestService from '../../../src/core/network/services/PendingRequestService.js';

const publicKey = '02'.repeat(32);

async function setupNetwork() {
    const { default: esmock } = await import('esmock');
    const events = [];
    let pendingRequests;
    class ObservedPendingRequestService extends PendingRequestService {
        constructor(config) {
            super(config);
            pendingRequests = this;
        }
    }
    class Swarm extends EventEmitter {
        peers = new Map();
        _allConnections = new Map();
        connections = new Set();
        leftPeers = [];
        joinPeer(key) { this.peers.set(b4a.toString(key, 'hex'), { publicKey: key }); }
        leavePeer(key) { this.leftPeers.push(key); }
        join() {}
        flush() {}
        async destroy() { this.removeAllListeners(); }
    }
    const { default: Network } = await esmock('../../../src/core/network/Network.js', {
        hyperswarm: Swarm,
        'protomux-wakeup': class { addStream() {} },
        '../../../src/core/network/protocols/NetworkMessages.js': { default: class { async setupProtomuxMessages() {} } },
        '../../../src/core/network/services/PendingRequestService.js': { default: ObservedPendingRequestService },
        '../../../src/utils/helpers.js': { sleep: async () => {} }
    }, {
        '../../../src/utils/telemetry.js': {
            getTelemetry: () => ({ enabled: true, emit: (event, fields, level = 6) => events.push({ event, fields, level }) })
        }
    });
    const config = {
        enableWallet: true, enableValidatorObserver: false, addressPrefix: 'trac',
        maxValidators: 3, connectTimeoutMs: 1000, channel: b4a.alloc(32), maxPendingConnections: 5,
        pendingRequestTimeout: 1000, maxPendingRequestsInPendingRequestsService: 10,
    };
    const network = new Network({}, config);
    // Open only listeners; no observer/pool scheduling or network IO is needed.
    network.setupNetworkListeners();
    await network.replicate({}, { replicate: () => new EventEmitter() }, {
        publicKey: b4a.alloc(32, 1), secretKey: b4a.alloc(64, 1)
    });
    return { network, events, pendingRequests };
}

function makeSocket(protocolOverrides = {}) {
    const socket = new EventEmitter();
    socket.remotePublicKey = b4a.from(publicKey, 'hex');
    socket.end = () => socket.emit('close');
    socket.protocolSession = {
        isProbed: () => true,
        probe: async () => {},
        isHealthCheckSupported: () => false,
        preferredProtocol: 'v1',
        close() {},
        ...protocolOverrides,
    };
    return socket;
}

async function receiveConnection(network, socket) {
    network.swarm.emit('connection', socket);
    await new Promise(resolve => setImmediate(resolve));
}

if (typeof globalThis.Bare !== 'undefined') {
    test('Network telemetry module mocks require Node', t => t.pass());
} else {
    test('Connection timeout and cancellation correlate to their own attempt IDs', async t => {
        const { network, events } = await setupNetwork();
        try {
            await network.tryConnect(publicKey, 'validator');
            t.is(network.diagnostics().pending_connections, 1);
            // Drive the timer event directly to avoid a wall-clock dependent test.
            network.emit(EventType.VALIDATOR_CONNECTION_TIMEOUT, { publicKey, type: 'validator', timeoutMs: 1000 });
            const first = events.find(e => e.event === 'validator.connect_started');
            const failed = events.find(e => e.event === 'validator.connect_failed');
            t.is(failed.fields.connection_attempt_id, first.fields.connection_attempt_id);
            t.is(failed.fields.reason, 'connection_timeout');
            t.is(network.diagnostics().pending_connections, 0);
            await network.tryConnect(publicKey, 'validator');
            network.disconnectValidatorPeer(publicKey, 'writer_removed');
            const second = events.filter(e => e.event === 'validator.connect_started')[1];
            const cancelled = events.find(e => e.event === 'validator.connect_cancelled');
            t.not(second.fields.connection_attempt_id, first.fields.connection_attempt_id);
            t.is(cancelled.fields.connection_attempt_id, second.fields.connection_attempt_id);
            t.is(cancelled.fields.reason, 'writer_removed');
        } finally { await network._close(); }
    });

    test('Probe failure is recorded while preserving legacy fallback and successful connection context', async t => {
        const { network, events } = await setupNetwork();
        try {
            await network.tryConnect(publicKey, 'validator');
            let protocolContext;
            const socket = makeSocket({
                setTelemetryContext: context => { protocolContext = context; },
                isProbed: () => false,
                probe: async () => { throw new TypeError('probe failed'); },
                isHealthCheckSupported: () => false,
                preferredProtocol: 'legacy'
            });
            await receiveConnection(network, socket);
            const start = events.find(e => e.event === 'validator.connect_started');
            const failure = events.find(e => e.event === 'validator.probe_failed');
            const connected = events.find(e => e.event === 'validator.connected');
            t.is(failure.fields.error_type, 'TypeError');
            t.is(failure.fields.fallback_allowed, true);
            t.is(connected.fields.connection_attempt_id, start.fields.connection_attempt_id);
            t.is(protocolContext.connection_attempt_id, start.fields.connection_attempt_id);
            t.ok(protocolContext.validator_address.startsWith('trac'));
            t.is(connected.fields.protocol, 'legacy');
            t.ok(connected.fields.duration_ms >= 0);
            t.is(network.diagnostics().validators_connected, 1);
            t.is(network.diagnostics().pending_requests, 0);
            t.is(network.diagnostics().pending_commits, 0);
            t.is(network.diagnostics().transaction_pool_size, 0);
            network.emit(EventType.VALIDATOR_CONNECTION_READY, { publicKey, type: 'validator', connection: socket });
            await new Promise(resolve => setImmediate(resolve));
            t.is(events.filter(e => e.event === 'validator.connected').length, 1, 'duplicate completion does not duplicate events');
        } finally { await network._close(); }
        t.is(events.find(e => e.event === 'validator.removed').fields.reason, 'shutdown');
    });

    test('Peer role invalidation uses a stable reason and retains the source detail', async t => {
        const { network, events } = await setupNetwork();
        try {
            await network.tryConnect(publicKey, 'validator');
            network.disconnectValidatorPeer(publicKey, 'peer promoted to indexer');
            const cancelled = events.find(e => e.event === 'validator.connect_cancelled');
            t.is(cancelled.fields.reason, 'role_changed');
            t.is(cancelled.fields.role_change_detail, 'peer promoted to indexer');

            await network.tryConnect(publicKey, 'validator');
            const socket = makeSocket();
            await receiveConnection(network, socket);
            network.disconnectValidatorPeer(publicKey, 'peer became unwritable');
            const removed = events.find(e => e.event === 'validator.removed');
            t.is(removed.fields.reason, 'role_changed');
            t.is(removed.fields.role_change_detail, 'peer became unwritable');
        } finally { await network._close(); }
    });

    test('An old socket error keeps its own telemetry identity and leaves replacement requests intact', async t => {
        const { network, events, pendingRequests } = await setupNetwork();
        try {
            await network.tryConnect(publicKey, 'validator');
            const oldSocket = makeSocket();
            await receiveConnection(network, oldSocket);
            const oldConnectionId = network.validatorConnectionManager.getConnectionDiagnostics(publicKey).connection_id;
            network.validatorConnectionManager.remove(publicKey, { endConnection: false, reason: 'role_changed' });

            await network.tryConnect(publicKey, 'validator');
            const replacement = makeSocket();
            await receiveConnection(network, replacement);
            const replacementId = network.validatorConnectionManager.getConnectionDiagnostics(publicKey).connection_id;
            t.not(replacementId, oldConnectionId, 'both sockets have distinct validator connection identities');

            const oldResponse = pendingRequests.registerPendingRequest(publicKey, {
                id: 'old-request', type: NetworkOperationType.LIVENESS_REQUEST,
            }, oldSocket).then(() => 'resolved', () => 'rejected');
            let replacementOutcome = 'pending';
            const replacementResponse = pendingRequests.registerPendingRequest(publicKey, {
                id: 'replacement-request', type: NetworkOperationType.LIVENESS_REQUEST,
            }, replacement).then(
                result => { replacementOutcome = 'resolved'; return result; },
                () => { replacementOutcome = 'rejected'; return null; }
            );

            oldSocket.emit('error', new TypeError('connection reset by peer'));
            t.is(await oldResponse, 'rejected', 'old socket error rejects only its owned request');
            const errorEvent = events.find(event => event.event === 'network.connection_error');
            t.is(errorEvent.fields.connection_id, oldConnectionId, 'error retains the failed socket identity');
            t.not(errorEvent.fields.connection_id, replacementId, 'replacement ID is never attached to old errors');
            t.is(errorEvent.fields.stale_connection, true);
            t.is(errorEvent.fields.connection_age_ms, undefined, 'current replacement age is not attributed to the old socket');
            t.is(errorEvent.fields.sent_count, undefined, 'current replacement counter is not attributed to the old socket');
            t.is(errorEvent.fields.error_type, 'TypeError');
            t.is(replacementOutcome, 'pending');
            t.ok(pendingRequests.has('replacement-request'));
            t.is(network.validatorConnectionManager.getConnection(publicKey), replacement);

            oldSocket.emit('close');
            t.is(network.swarm.leftPeers.length, 0, 'old close does not cancel discovery for the remaining socket');
            t.ok(pendingRequests.has('replacement-request'), 'old close also preserves replacement request');
            t.is(network.validatorConnectionManager.getConnection(publicKey), replacement);
            pendingRequests.resolvePendingRequest('replacement-request', ResultCode.OK);
            t.is(await replacementResponse, ResultCode.OK, 'replacement request can still complete successfully');
        } finally { await network._close(); }
    });
}
