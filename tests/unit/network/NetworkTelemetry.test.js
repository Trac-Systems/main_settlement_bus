import { test } from 'brittle';
import EventEmitter from 'bare-events';
import b4a from 'b4a';
import { EventType } from '../../../src/utils/constants.js';

const publicKey = '02'.repeat(32);

async function setupNetwork() {
    const { default: esmock } = await import('esmock');
    const events = [];
    class Swarm extends EventEmitter {
        peers = new Map();
        _allConnections = new Map();
        connections = new Set();
        joinPeer(key) { this.peers.set(b4a.toString(key, 'hex'), { publicKey: key }); }
        leavePeer() {}
        join() {}
        flush() {}
        async destroy() { this.removeAllListeners(); }
    }
    const { default: Network } = await esmock('../../../src/core/network/Network.js', {
        hyperswarm: Swarm,
        'protomux-wakeup': class { addStream() {} },
        '../../../src/core/network/protocols/NetworkMessages.js': { default: class { async setupProtomuxMessages() {} } },
        '../../../src/utils/helpers.js': { sleep: async () => {} }
    }, {
        '../../../src/utils/telemetry.js': {
            getTelemetry: () => ({ enabled: true, emit: (event, fields, level = 6) => events.push({ event, fields, level }) })
        }
    });
    const config = {
        enableWallet: true, enableValidatorObserver: false, addressPrefix: 'trac',
        maxValidators: 3, connectTimeoutMs: 1000, channel: b4a.alloc(32), maxPendingConnections: 5
    };
    const network = new Network({}, config);
    // Open only listeners; no observer/pool scheduling or network IO is needed.
    network.setupNetworkListeners();
    await network.replicate({}, { replicate: () => new EventEmitter() }, {
        publicKey: b4a.alloc(32, 1), secretKey: b4a.alloc(64, 1)
    });
    return { network, events };
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
            const socket = new EventEmitter();
            let protocolContext;
            socket.remotePublicKey = b4a.from(publicKey, 'hex');
            socket.end = () => socket.emit('close');
            socket.protocolSession = {
                setTelemetryContext: context => { protocolContext = context; },
                isProbed: () => false,
                probe: async () => { throw new TypeError('probe failed'); },
                isHealthCheckSupported: () => false,
                preferredProtocol: 'legacy'
            };
            network.emit(EventType.VALIDATOR_CONNECTION_READY, { publicKey, type: 'validator', connection: socket });
            await new Promise(resolve => setImmediate(resolve));
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

            const socket = new EventEmitter();
            socket.protocolSession = { preferredProtocol: 'v1' };
            socket.end = () => socket.emit('close');
            network.validatorConnectionManager.addValidator(publicKey, socket);
            network.disconnectValidatorPeer(publicKey, 'peer became unwritable');
            const removed = events.find(e => e.event === 'validator.removed');
            t.is(removed.fields.reason, 'role_changed');
            t.is(removed.fields.role_change_detail, 'peer became unwritable');
        } finally { await network._close(); }
    });
}
