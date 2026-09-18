import { test } from 'brittle';
import sinon from 'sinon';
import { WalletProvider } from 'trac-wallet';
import MessageOrchestrator from '../../../../src/core/network/services/MessageOrchestrator.js';
import { ConnectionManagerError } from '../../../../src/core/network/services/ConnectionManager.js';
import { PendingRequestServiceTimeoutError } from '../../../../src/core/network/services/PendingRequestService.js';
import { OperationType, ResultCode } from '../../../../src/utils/constants.js';
import { publicKeyToAddress } from '../../../../src/utils/helpers.js';
import { getTelemetry } from '../../../../src/utils/telemetry.js';
import { overrideConfig } from '../../../helpers/config.js';
import { testKeyPair1, testKeyPair2 } from '../../../fixtures/apply.fixtures.js';

async function setup(t, options = {}) {
    const config = overrideConfig({ maxRetries: 1, ...options.config });
    const wallet = await new WalletProvider(config).fromSecretKey(testKeyPair1.secretKey);
    const events = [];
    const emit = sinon.stub(getTelemetry(config), 'emit').callsFake((event, fields = {}, level = 6) => {
        events.push({ event, fields: { ...fields }, level });
    });
    t.teardown(() => emit.restore());
    const manager = {
        poolVersion: 7,
        connectedValidators: sinon.stub().returns(options.empty ? [] : [testKeyPair2.publicKey]),
        pickRandomValidator: validators => validators[0] ?? null,
        getConnectionDiagnostics: () => ({ connection_id: 'connection-1', connection_age_ms: 100 }),
        getConnection: () => ({ protocolSession: {
            preferredProtocol: options.protocol ?? 'v1',
            supportedProtocols: { V1: 'v1', LEGACY: 'legacy' },
        } }),
        sendSingleMessage: options.send ?? sinon.stub().resolves(ResultCode.OK),
        incrementSentCount: sinon.stub(),
        getSentCount: () => options.sentCount ?? 0,
        remove: sinon.stub(),
    };
    const state = { waitForUnsigned: options.waitForUnsigned ?? sinon.stub().resolves(true) };
    const orchestrator = new MessageOrchestrator(manager, state, config);
    orchestrator.setWallet(wallet);
    const message = {
        type: OperationType.TRANSFER,
        address: wallet.address,
        tro: {
            tx: 'aa'.repeat(32),
            txv: 'bb'.repeat(32),
            in: 'cc'.repeat(32),
            to: publicKeyToAddress(testKeyPair2.publicKey, config),
            am: '00'.repeat(16),
            is: 'dd'.repeat(64),
        },
    };
    const find = event => events.filter(entry => entry.event === event);
    return { config, events, manager, message, orchestrator, find };
}

test('telemetry: empty validator pool reports one failed broadcast without a send attempt', async t => {
    const { orchestrator, message, manager, find } = await setup(t, { empty: true });
    t.is(await orchestrator.send(message), false);
    t.is(manager.sendSingleMessage.callCount, 0);
    t.is(find('tx.broadcast_started').length, 1);
    t.is(find('tx.broadcast_finished').length, 1);
    t.is(find('tx.send_started').length, 0);
    t.is(find('tx.send_failed')[0].fields.reason, 'no_validators');
    const finished = find('tx.broadcast_finished')[0].fields;
    t.is(finished.success, false);
    t.is(finished.attempts, 0);
    t.is(finished.tx_hash, message.tro.tx);
});

test('telemetry: normal threshold rotation includes reason and retains successful outcome', async t => {
    const { config, orchestrator, message, manager, find } = await setup(t);
    manager.getSentCount = () => config.messageThreshold;
    t.is(await orchestrator.send(message), true);
    const selected = find('validator.selected')[0].fields;
    t.is(selected.pool_version, 7);
    t.is(selected.connected_validators, 1);
    t.is(selected.connection_id, 'connection-1');
    t.is(selected.request_id, manager.sendSingleMessage.firstCall.args[0].id);
    const removal = manager.remove.firstCall.args[1];
    t.is(removal.reason, 'message_threshold');
    t.is(removal.sent_count, config.messageThreshold);
    t.is(removal.message_threshold, config.messageThreshold);
    t.is(removal.tx_hash, message.tro.tx);
    t.is(find('tx.broadcast_finished')[0].fields.success, true);
    t.is(find('tx.retry').length, 0);
});

test('telemetry: TIMEOUT response rotates without introducing a retry', async t => {
    const send = sinon.stub().resolves(ResultCode.TIMEOUT);
    const { orchestrator, message, manager, find } = await setup(t, { send });
    t.is(await orchestrator.send(message), false);
    t.is(send.callCount, 1);
    t.is(find('tx.retry').length, 0);
    t.is(find('tx.response')[0].fields.result_name, 'TIMEOUT');
    t.is(manager.remove.firstCall.args[1].reason, 'response_policy');
    t.is(manager.remove.firstCall.args[1].result_code, ResultCode.TIMEOUT);
    t.is(find('tx.broadcast_finished')[0].fields.reason, 'response_policy');
});

test('telemetry: transport timeout retries correlate broadcast and distinct actual request IDs', async t => {
    const send = sinon.stub();
    send.onFirstCall().rejects(new PendingRequestServiceTimeoutError('old', 'peer', 100));
    send.onSecondCall().resolves(ResultCode.OK);
    const { orchestrator, message, events, manager, find } = await setup(t, { send });
    t.is(await orchestrator.send(message), true);
    t.is(find('tx.broadcast_started').length, 1);
    t.is(find('tx.broadcast_finished').length, 1);
    const attempts = find('tx.send_started');
    t.alike(attempts.map(entry => entry.fields.attempt), [1, 2]);
    t.is(attempts[0].fields.request_id, send.firstCall.args[0].id);
    t.is(attempts[1].fields.request_id, send.secondCall.args[0].id);
    t.not(attempts[0].fields.request_id, attempts[1].fields.request_id);
    t.is(new Set(events.map(entry => entry.fields.broadcast_id)).size, 1);
    t.is(find('tx.send_failed')[0].fields.error_type, 'PendingRequestServiceTimeoutError');
    t.is(find('tx.retry').length, 1);
    t.is(manager.remove.firstCall.args[1].reason, 'send_error');
    t.is(find('tx.broadcast_finished')[0].fields.attempts, 2);
    t.is(find('tx.broadcast_finished')[0].fields.success, true);
    const serialized = JSON.stringify(events);
    t.absent(serialized.includes(message.tro.is), 'transaction signature is excluded');
    t.absent(serialized.includes(message.tro.in), 'transaction payload fields are excluded');
});

test('telemetry: connection race retries without changing removal policy', async t => {
    const send = sinon.stub();
    send.onFirstCall().rejects(new ConnectionManagerError('disconnected'));
    send.onSecondCall().resolves(ResultCode.OK);
    const { orchestrator, message, manager, find } = await setup(t, { send });
    t.is(await orchestrator.send(message), true);
    t.is(manager.remove.callCount, 0);
    t.is(find('tx.retry')[0].fields.reason, 'connection_unavailable');
    t.is(find('tx.broadcast_finished')[0].fields.attempts, 2);
});

test('telemetry: retry exhaustion reports the actual send count and one final failure', async t => {
    const send = sinon.stub().rejects(new Error('failure with potentially sensitive text'));
    const { orchestrator, message, events, find } = await setup(t, { send });
    t.is(await orchestrator.send(message), false);
    t.is(send.callCount, 2);
    t.is(find('tx.broadcast_finished').length, 1);
    t.is(find('tx.broadcast_finished')[0].fields.attempts, 2);
    t.is(find('tx.broadcast_finished')[0].fields.reason, 'max_retries');
    t.is(find('tx.retry').at(-1).fields.next_attempt_allowed, false);
    t.absent(JSON.stringify(events).includes('potentially sensitive text'));
});

test('telemetry: message preparation errors preserve rejection and close the broadcast', async t => {
    const { orchestrator, message, find } = await setup(t);
    orchestrator.setWallet(null);
    await t.exception(() => orchestrator.send(message));
    t.is(find('tx.send_started').length, 0);
    t.is(find('tx.broadcast_finished').length, 1);
    t.is(find('tx.broadcast_finished')[0].fields.success, false);
    t.is(find('tx.broadcast_finished')[0].fields.reason, 'exception');
});

test('telemetry: legacy unsigned timeout retries with no invented protocol request ID', async t => {
    const waitForUnsigned = sinon.stub();
    waitForUnsigned.onFirstCall().resolves(false);
    waitForUnsigned.onSecondCall().resolves(true);
    const { orchestrator, message, manager, find } = await setup(t, {
        protocol: 'legacy',
        send: sinon.stub().resolves(true),
        waitForUnsigned,
    });
    t.is(await orchestrator.send(message), true);
    t.is(find('tx.broadcast_started').length, 1);
    t.is(find('tx.broadcast_finished').length, 1);
    t.is(manager.remove.firstCall.args[1].reason, 'unsigned_timeout');
    t.is(find('tx.retry')[0].fields.reason, 'unsigned_timeout');
    t.is(find('tx.response')[0].fields.response_source, 'local_unsigned_state');
    t.is(find('tx.send_started')[0].fields.request_id, undefined);
    t.is(find('tx.broadcast_finished')[0].fields.attempts, 2);
});

test('telemetry: legacy catch and fallback retain their existing separate retry paths', async t => {
    const send = sinon.stub().resolves(true);
    send.onFirstCall().rejects(new Error('legacy send failed'));
    const waitForUnsigned = sinon.stub();
    waitForUnsigned.onFirstCall().resolves(false);
    waitForUnsigned.onSecondCall().resolves(true);
    const { orchestrator, message, find } = await setup(t, { protocol: 'legacy', send, waitForUnsigned });
    t.is(await orchestrator.send(message), true);
    t.is(send.callCount, 3, 'existing legacy fallback can send again after a failed nested retry');
    t.is(find('tx.broadcast_started').length, 1);
    t.is(find('tx.broadcast_finished').length, 1);
    t.alike(find('tx.send_started').map(entry => entry.fields.attempt), [1, 2, 3]);
    t.is(find('tx.broadcast_finished')[0].fields.attempts, 3);
    t.is(find('tx.broadcast_finished')[0].fields.reason, 'unsigned_observed');
});
