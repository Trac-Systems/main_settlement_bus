import { test } from 'brittle';
import EventEmitter from 'bare-events';
import sinon from 'sinon';
import b4a from 'b4a';
import { handleBroadcastTransaction } from '../../../rpc/handlers.js';
import { getTelemetry } from '../../../src/utils/telemetry.js';
import { OperationType } from '../../../src/utils/constants.js';
import { BroadcastError } from '../../../src/utils/errors.js';

const transaction = {
    type: OperationType.TRANSFER,
    address: 'test-requester',
    tro: { tx: 'ab'.repeat(32), is: 'transaction-signature-must-not-be-logged' },
};
const validBody = () => JSON.stringify({ payload: b4a.toString(b4a.from(JSON.stringify(transaction)), 'base64') });

async function setup(t, broadcast = sinon.stub().resolves({ tx: transaction.tro.tx, signedLength: 1, unsignedLength: 1 })) {
    const config = {};
    const events = [];
    const emitter = sinon.stub(getTelemetry(config), 'emit').callsFake((event, fields, level) => {
        events.push({ event, fields: { ...fields }, level });
    });
    t.teardown(() => emitter.restore());
    const req = new EventEmitter();
    req.socket = new EventEmitter();
    req.resume = sinon.stub();
    const respond = sinon.stub();
    await handleBroadcastTransaction({ req, respond, msbInstance: { config, broadcastTransaction: broadcast } });
    return {
        req, respond, broadcast, events,
        find: event => events.filter(entry => entry.event === event),
        body: text => req.emit('data', b4a.from(text)),
        end: () => req.listeners('end')[0][0](),
    };
}

test('RPC telemetry correlates reception, decode, and successful response without payload contents', async t => {
    const { req, respond, body, end, events, find } = await setup(t);
    body(validBody());
    await end();
    t.is(respond.callCount, 1);
    t.is(respond.firstCall.args[0], 200);
    t.is(respond.firstCall.args[1].result.message, 'Transaction broadcasted successfully.');
    t.is(find('rpc.tx_received').length, 1);
    t.is(find('rpc.tx_received')[0].fields.tx_hash, undefined);
    t.is(find('rpc.tx_decoded')[0].fields.tx_hash, transaction.tro.tx);
    const finished = find('rpc.tx_finished');
    t.is(finished.length, 1);
    t.is(finished[0].fields.http_status, 200);
    t.is(finished[0].fields.broadcast_started, true);
    t.is(new Set(events.map(event => event.fields.rpc_request_id)).size, 1);
    t.absent(JSON.stringify(events).includes(transaction.tro.is));
    t.is(req.socket.listenerCount('close'), 0, 'socket listener removed on completion');
    req.emit('error', new Error('late request error'));
    req.emit('aborted');
    t.is(find('rpc.tx_finished').length, 1);
    t.is(respond.callCount, 1);
});

test('RPC telemetry reports invalid payload without calling broadcast or logging raw input', async t => {
    const { respond, broadcast, body, end, events, find } = await setup(t);
    body('invalid-request-body-secret');
    await end();
    t.is(respond.firstCall.args[0], 400);
    t.is(broadcast.callCount, 0);
    const finished = find('rpc.tx_finished')[0].fields;
    t.is(finished.reason, 'invalid_payload');
    t.is(finished.broadcast_started, false);
    t.is(finished.tx_hash, undefined);
    t.absent(JSON.stringify(events).includes('invalid-request-body-secret'));
});

test('RPC telemetry preserves BroadcastError HTTP status and records the transaction hash', async t => {
    const broadcast = sinon.stub().rejects(new BroadcastError('Failed to broadcast transaction after multiple attempts.'));
    const { respond, body, end, find } = await setup(t, broadcast);
    body(validBody());
    await end();
    t.is(respond.firstCall.args[0], 429);
    t.is(respond.firstCall.args[1].error, 'Failed to broadcast transaction after multiple attempts.');
    t.is(find('rpc.tx_finished').length, 1);
    const finished = find('rpc.tx_finished')[0].fields;
    t.is(finished.reason, 'broadcast_failed');
    t.is(finished.tx_hash, transaction.tro.tx);
    t.is(finished.error_type, 'BroadcastError');
});

test('RPC telemetry reports oversized requests once despite later stream events', async t => {
    const { req, respond, broadcast, body, end, find } = await setup(t);
    body('x'.repeat(2_000_001));
    await end();
    req.emit('error', new Error('request terminated'));
    req.emit('aborted');
    t.is(respond.callCount, 1);
    t.is(respond.firstCall.args[0], 413);
    t.is(broadcast.callCount, 0);
    t.is(req.resume.callCount, 1);
    t.is(find('rpc.tx_finished').length, 1);
    t.is(find('rpc.tx_finished')[0].fields.reason, 'body_too_large');
});

test('RPC telemetry reports request stream error and stops processing the incomplete body', async t => {
    const { req, respond, broadcast, body, end, find } = await setup(t);
    body(validBody());
    req.emit('error', new Error('stream failed'));
    await end();
    t.is(respond.callCount, 1);
    t.is(respond.firstCall.args[0], 500);
    t.is(broadcast.callCount, 0);
    t.is(find('rpc.tx_finished').length, 1);
    t.is(find('rpc.tx_finished')[0].fields.reason, 'request_error');
});

test('RPC telemetry handles client abort before submission without attempting an HTTP response', async t => {
    const { req, respond, broadcast, body, end, find } = await setup(t);
    body(validBody());
    req.emit('aborted');
    req.emit('error', new Error('socket reset'));
    await end();
    t.is(respond.callCount, 0);
    t.is(broadcast.callCount, 0);
    const finished = find('rpc.tx_finished');
    t.is(finished.length, 1);
    t.is(finished[0].fields.reason, 'client_aborted');
    t.is(finished[0].fields.http_status, null);
    t.is(finished[0].fields.broadcast_outcome, 'not_started');
});

test('RPC telemetry does not label an in-flight transaction failed when the client disconnects', async t => {
    let completeBroadcast;
    const broadcast = sinon.stub().returns(new Promise(resolve => { completeBroadcast = resolve; }));
    const { req, respond, body, end, find } = await setup(t, broadcast);
    body(validBody());
    const processing = end();
    t.is(broadcast.callCount, 1);
    req.socket.emit('close');
    completeBroadcast({ tx: transaction.tro.tx, signedLength: 1, unsignedLength: 1 });
    await processing;
    const finished = find('rpc.tx_finished');
    t.is(finished.length, 1);
    t.is(finished[0].fields.reason, 'client_aborted');
    t.is(finished[0].fields.broadcast_started, true);
    t.is(finished[0].fields.broadcast_outcome, 'unknown');
    t.is(respond.callCount, 0);
});

test('RPC telemetry reports internal failure without arbitrary exception text', async t => {
    const broadcast = sinon.stub().rejects(new Error('unexpected secret from external request'));
    const { respond, body, end, events, find } = await setup(t, broadcast);
    body(validBody());
    await end();
    t.is(respond.firstCall.args[0], 500);
    t.is(find('rpc.tx_finished')[0].fields.reason, 'internal_error');
    t.absent(JSON.stringify(events).includes('unexpected secret'));
});

test('RPC telemetry permits existing MSB test doubles without a config', async t => {
    const req = new EventEmitter();
    req.resume = () => {};
    const respond = sinon.stub();
    await handleBroadcastTransaction({
        req, respond, msbInstance: { broadcastTransaction: async () => ({ tx: transaction.tro.tx }) },
    });
    req.emit('data', b4a.from(validBody()));
    await req.listeners('end')[0][0]();
    t.is(respond.firstCall.args[0], 200);
});
