import { test } from 'brittle';
import EventEmitter from 'bare-events';
import b4a from 'b4a';
import { ResultCode } from '../../../../src/utils/constants.js';

const publicKey = '01'.repeat(32);
const config = { maxValidators: 2, addressPrefix: 'trac' };

function connection(sendHealthCheck = async () => ResultCode.OK) {
    const socket = new EventEmitter();
    socket.remotePublicKey = b4a.from(publicKey, 'hex');
    socket.protocolSession = { preferredProtocol: 'v1', sendHealthCheck };
    socket.ends = 0;
    socket.end = () => { socket.ends++; socket.emit('close'); };
    return socket;
}

async function loadManager() {
    const { default: esmock } = await import('esmock');
    const events = [];
    const { default: ConnectionManager } = await esmock('../../../../src/core/network/services/ConnectionManager.js', {
        '../../../../src/utils/telemetry.js': {
            getTelemetry: () => ({ enabled: true, emit: (event, fields, level = 6) => events.push({ event, fields, level }) })
        }
    });
    return { manager: new ConnectionManager(config), events };
}

function healthChecks(manager) {
    let handler;
    const stopped = [];
    manager.subscribeToHealthChecks({
        on: (_event, callback) => { handler = callback; }, off() {}, has: () => true,
        stop: key => stopped.push(key)
    });
    return { run: () => handler(publicKey, 'healthcheck-1'), stopped };
}

if (typeof globalThis.Bare !== 'undefined') {
    test('Connection telemetry module mocks require Node', t => t.pass());
} else {
    test('Connection telemetry records one rotation even when end emits close synchronously', async t => {
        const { manager, events } = await loadManager();
        const socket = connection();
        manager.addValidator(publicKey, socket, { connection_attempt_id: 'attempt-1', duration_ms: 25 });
        const originalId = manager.getConnectionDiagnostics(publicKey).connection_id;
        manager.incrementSentCount(publicKey);
        manager.incrementSentCount(publicKey);
        manager.remove(publicKey, { reason: 'message_threshold', message_threshold: 2 });
        manager.remove(publicKey, { reason: 'connection_closed' });

        const removed = events.filter(e => e.event === 'validator.removed');
        t.is(removed.length, 1);
        t.is(removed[0].fields.reason, 'message_threshold');
        t.is(removed[0].fields.sent_count, 2);
        t.is(removed[0].fields.message_threshold, 2);
        t.is(removed[0].fields.connection_id, originalId);
        t.is(removed[0].fields.pool_before, 1);
        t.is(removed[0].fields.pool_after, 0);
        t.is(removed[0].level, 6, 'planned rotation is informational');
        t.is(socket.ends, 1, 'close callback must not end the socket again');
        t.is(manager.poolVersion, 2, 'only actual pool changes increment version');
        t.is(events.filter(e => e.event === 'validator.pool_empty').length, 1);
        manager.addValidator(publicKey, connection());
        const restored = events.filter(e => e.event === 'validator.pool_restored').at(-1);
        t.is(restored.fields.initial_connection, false);
        t.ok(restored.fields.duration_ms >= 0);
        t.not(manager.getConnectionDiagnostics(publicKey).connection_id, originalId);
    });

    test('Late close of a detached socket does not remove its replacement', async t => {
        const { manager, events } = await loadManager();
        const oldSocket = connection();
        manager.addValidator(publicKey, oldSocket);
        manager.remove(publicKey, { endConnection: false, reason: 'role_changed' });
        const replacement = connection();
        manager.addValidator(publicKey, replacement);
        const version = manager.poolVersion;
        oldSocket.emit('close');
        t.is(oldSocket.ends, 0, 'detachment keeps the original socket open');
        t.is(manager.getConnection(publicKey), replacement);
        t.is(manager.poolVersion, version);
        t.is(events.filter(e => e.event === 'validator.removed').length, 1);
    });

    test('Healthcheck timeout retains the result code, request and connection identity', async t => {
        const { manager, events } = await loadManager();
        const socket = connection(async () => ResultCode.TIMEOUT);
        let protocolContext;
        socket.protocolSession.setTelemetryContext = context => { protocolContext = context; };
        manager.addValidator(publicKey, socket);
        const checks = healthChecks(manager);
        for (let attempt = 1; attempt <= 2; attempt++) {
            await checks.run();
            t.ok(manager.connected(publicKey), 'isolated failures keep the validator connected');
            t.is(events.filter(e => e.event === 'validator.removed').length, 0);
        }
        await checks.run();
        const failures = events.filter(e => e.event === 'validator.healthcheck_failed');
        t.is(failures.length, 3, 'every failed check is logged before the threshold removes the validator');
        t.alike(failures.map(event => event.fields.consecutive_failures), [1, 2, 3]);
        const failure = failures.at(-1);
        const removed = events.find(e => e.event === 'validator.removed');
        t.is(failure.fields.reason, 'healthcheck_timeout');
        t.is(failure.fields.result_code, ResultCode.TIMEOUT);
        t.is(failure.fields.healthcheck_id, 'healthcheck-1');
        t.absent(failure.fields.request_id, 'scheduler ID is not represented as the wire request ID');
        t.is(removed.fields.result_code, ResultCode.TIMEOUT);
        t.is(removed.fields.connection_id, failure.fields.connection_id);
        t.is(protocolContext.healthcheck_id, 'healthcheck-1');
        t.is(protocolContext.connection_id, failure.fields.connection_id);
        t.ok(protocolContext.validator_address.startsWith('trac'));
        t.absent(manager.connected(publicKey));
    });

    test('Rejected healthcheck includes error type; late failure cannot remove new connection', async t => {
        const { manager, events } = await loadManager();
        let rejectHealthcheck;
        const oldSocket = connection(() => new Promise((resolve, reject) => { rejectHealthcheck = reject; }));
        manager.addValidator(publicKey, oldSocket);
        const checks = healthChecks(manager);
        const pending = checks.run();
        manager.remove(publicKey, { endConnection: false, reason: 'message_threshold' });
        const replacement = connection();
        manager.addValidator(publicKey, replacement);
        const stoppedBeforeResult = checks.stopped.length;
        rejectHealthcheck(new TypeError('untrusted error details'));
        await pending;
        const failure = events.find(e => e.event === 'validator.healthcheck_failed');
        t.is(failure.fields.error_type, 'TypeError');
        t.is(failure.fields.reason, 'healthcheck_rejected');
        t.is(manager.getConnection(publicKey), replacement);
        t.is(checks.stopped.length, stoppedBeforeResult, 'late result cannot stop replacement health checks');
    });

    test('Socket errors are preserved as the eventual removal reason', async t => {
        const { manager, events } = await loadManager();
        const socket = connection();
        manager.addValidator(publicKey, socket);
        socket.emit('error', new TypeError('connection reset by peer'));
        socket.emit('close');
        const removed = events.find(e => e.event === 'validator.removed');
        t.is(removed.fields.reason, 'connection_error');
        t.is(removed.fields.error_type, 'TypeError');
        t.is(socket.ends, 0);
    });

    test('Remote close of the last socket emits pool empty even after its connected flag is cleared', async t => {
        const { manager, events } = await loadManager();
        const socket = connection();
        socket.connected = true;
        manager.addValidator(publicKey, socket);
        socket.connected = false;
        socket.emit('close');
        socket.emit('close');
        const emptied = events.filter(e => e.event === 'validator.pool_empty');
        t.is(emptied.length, 1, 'tracked pool transition emits once despite duplicate close');
        t.is(emptied[0].fields.reason, 'connection_closed');
        t.is(emptied[0].level, 4);
        manager.addValidator(publicKey, connection());
        manager.remove(publicKey, { endConnection: false, reason: 'shutdown' });
        t.is(events.filter(e => e.event === 'validator.pool_empty').at(-1).level, 6, 'graceful shutdown is informational');
    });
}
