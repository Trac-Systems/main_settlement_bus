import { test } from 'brittle';
import sinon from 'sinon';
import ProtocolSession from '../../../src/core/network/protocols/ProtocolSession.js';
import { ResultCode } from '../../../src/utils/constants.js';
import { config, overrideConfig } from '../../helpers/config.js';
import { testKeyPair1 } from '../../fixtures/apply.fixtures.js';
import { WalletProvider } from 'trac-wallet';
import { getTelemetry } from '../../../src/utils/telemetry.js';

async function createWallet() {
    return await new WalletProvider(config).fromSecretKey(testKeyPair1.secretKey)
}

function makeProtocol(sendStub) {
    return {
        send: sendStub ?? sinon.stub().resolves(ResultCode.OK),
        sendAndForget: sinon.stub(),
        decode: sinon.stub(),
        close: sinon.stub()
    };
}

test('ProtocolSession', (t) => {
    t.teardown(() => sinon.restore());

    test('probe sets preferred protocol to v1 on OK', async (t) => {
        const v1Send = sinon.stub().resolves(ResultCode.OK);
        const session = new ProtocolSession(
            makeProtocol(),
            makeProtocol(v1Send),
            await createWallet(),
            config
        );

        await session.probe();
        t.is(session.preferredProtocol, session.supportedProtocols.V1);
        t.ok(v1Send.calledOnce);
    });

    test('probe sets preferred protocol to legacy on non-OK', async (t) => {
        const v1Send = sinon.stub().resolves(ResultCode.TIMEOUT);
        const session = new ProtocolSession(
            makeProtocol(),
            makeProtocol(v1Send),
            await createWallet(),
            config
        );

        await session.probe();
        t.is(session.preferredProtocol, session.supportedProtocols.LEGACY);
        t.ok(v1Send.calledOnce);
    });

    test('probe sets preferred protocol to legacy on rejection', async (t) => {
        const v1Send = sinon.stub().rejects(new Error('boom'));
        const session = new ProtocolSession(
            makeProtocol(),
            makeProtocol(v1Send),
            await createWallet(),
            config
        );

        await session.probe();
        t.is(session.preferredProtocol, session.supportedProtocols.LEGACY);
        t.ok(v1Send.calledOnce);
    });

    test('sendHealthCheck returns OK when preferred is v1', async (t) => {
        const v1Send = sinon.stub().resolves(ResultCode.OK);
        const session = new ProtocolSession(
            makeProtocol(),
            makeProtocol(v1Send),
            await createWallet(),
            config
        );

        session.setV1AsPreferredProtocol();
        const result = await session.sendHealthCheck();
        t.is(result, ResultCode.OK);
        t.ok(v1Send.calledOnce);
    });

    test('sendHealthCheck returns OK when preferred is legacy', async (t) => {
        const session = new ProtocolSession(
            makeProtocol(),
            makeProtocol(),
            await createWallet(),
            config
        );

        session.setLegacyAsPreferredProtocol();
        const result = await session.sendHealthCheck();
        t.is(result, ResultCode.OK);
    });

    test('sendHealthCheck returns UNSPECIFIED when not probed', async (t) => {
        const session = new ProtocolSession(
            makeProtocol(),
            makeProtocol(),
            await createWallet(),
            config
        );

        const result = await session.sendHealthCheck();
        t.is(result, ResultCode.UNSPECIFIED);
    });

    test('isHealthCheckSupported throws when not probed', async (t) => {
        const session = new ProtocolSession(
            makeProtocol(),
            makeProtocol(),
            await createWallet(),
            config
        );

        await t.exception.all(() => session.isHealthCheckSupported());
    });
});

test('ProtocolSession telemetry retains probe rejection cause and actual wire ID', async t => {
    const events = [];
    const cfg = overrideConfig({ graylog: { enabled: false } });
    const telemetry = getTelemetry(cfg);
    const emit = sinon.stub(telemetry, 'emit').callsFake((event, fields) => events.push({ event, fields }));
    t.teardown(() => emit.restore());
    const error = new Error('sensitive request payload must remain outside telemetry');
    error.name = 'PendingRequestServiceTimeoutError';
    error.code = 'ETIMEDOUT';
    const send = sinon.stub().rejects(error);
    const session = new ProtocolSession(makeProtocol(), makeProtocol(send), await createWallet(), cfg);
    session.setTelemetryContext({ validator: 'peer-a', connection_attempt_id: 'attempt-a' });
    await session.probe();
    const record = events.find(record => record.event === 'protocol.probe_failed');
    t.is(session.preferredProtocol, 'legacy', 'existing fallback behavior is preserved');
    t.is(record.fields.request_id, send.firstCall.args[0].id);
    t.is(record.fields.validator, 'peer-a');
    t.is(record.fields.connection_attempt_id, 'attempt-a');
    t.is(record.fields.error_type, 'PendingRequestServiceTimeoutError');
    t.is(record.fields.error_code, 'ETIMEDOUT');
    t.is(record.fields.fallback_allowed, true);
    t.absent(JSON.stringify(record).includes('sensitive request payload'));
});

test('ProtocolSession telemetry preserves peer result codes for probe and healthcheck', async t => {
    const events = [];
    const cfg = overrideConfig({ graylog: { enabled: false } });
    const emit = sinon.stub(getTelemetry(cfg), 'emit').callsFake((event, fields) => events.push({ event, fields }));
    t.teardown(() => emit.restore());
    const rejectedProbe = new ProtocolSession(makeProtocol(), makeProtocol(sinon.stub().resolves(ResultCode.TIMEOUT)), await createWallet(), cfg);
    await rejectedProbe.probe();
    t.is(events[0].event, 'protocol.probe_failed');
    t.is(events[0].fields.result_code, ResultCode.TIMEOUT);
    t.is(rejectedProbe.preferredProtocol, 'legacy');

    const send = sinon.stub().resolves(ResultCode.TIMEOUT);
    const session = new ProtocolSession(makeProtocol(), makeProtocol(send), await createWallet(), cfg);
    session.setV1AsPreferredProtocol();
    t.is(await session.sendHealthCheck(), ResultCode.TIMEOUT, 'returned code remains unchanged');
    const record = events.find(record => record.event === 'protocol.healthcheck_failed');
    t.is(record.fields.result_code, ResultCode.TIMEOUT);
    t.is(record.fields.request_id, send.firstCall.args[0].id);
    t.is(record.fields.reason, 'peer_response');
});

test('ProtocolSession telemetry retains swallowed healthcheck errors with distinct local and wire IDs', async t => {
    const events = [];
    const cfg = overrideConfig({ graylog: { enabled: false } });
    const emit = sinon.stub(getTelemetry(cfg), 'emit').callsFake((event, fields) => events.push({ event, fields }));
    t.teardown(() => emit.restore());
    const error = new TypeError('never send this arbitrary message');
    const send = sinon.stub().rejects(error);
    const session = new ProtocolSession(makeProtocol(), makeProtocol(send), await createWallet(), cfg);
    session.setTelemetryContext({ validator: 'peer-a', connection_id: 'connection-a', healthcheck_id: 'local-check-a' });
    session.setV1AsPreferredProtocol();
    t.is(await session.sendHealthCheck(), ResultCode.UNEXPECTED_ERROR, 'existing exception mapping remains unchanged');
    const record = events.find(record => record.event === 'protocol.healthcheck_failed');
    t.is(record.fields.error_type, 'TypeError');
    t.is(record.fields.result_code, ResultCode.UNEXPECTED_ERROR);
    t.is(record.fields.healthcheck_id, 'local-check-a');
    t.is(record.fields.request_id, send.firstCall.args[0].id);
    t.not(record.fields.request_id, record.fields.healthcheck_id);
    t.is(record.fields.connection_id, 'connection-a');
    t.ok(record.fields.duration_ms >= 0);
    t.absent(JSON.stringify(record).includes('never send this arbitrary message'));
});

test('ProtocolSession request-build failure has no invented wire ID; healthy checks emit no failure', async t => {
    const events = [];
    const cfg = overrideConfig({ graylog: { enabled: false } });
    const emit = sinon.stub(getTelemetry(cfg), 'emit').callsFake((event, fields) => events.push({ event, fields }));
    t.teardown(() => emit.restore());
    const session = new ProtocolSession(makeProtocol(), makeProtocol(), null, cfg);
    session.setV1AsPreferredProtocol();
    t.is(await session.sendHealthCheck(), ResultCode.UNEXPECTED_ERROR);
    t.is(events[0].fields.stage, 'request_build');
    t.absent(events[0].fields.request_id);
    events.length = 0;
    const healthy = new ProtocolSession(makeProtocol(), makeProtocol(), await createWallet(), cfg);
    await healthy.probe();
    t.is(await healthy.sendHealthCheck(), ResultCode.OK);
    t.is(events.length, 0);
});

test('ProtocolSession concurrent healthchecks keep the context captured before awaiting message construction', async t => {
    const events = [];
    const cfg = overrideConfig({ graylog: { enabled: false } });
    const emit = sinon.stub(getTelemetry(cfg), 'emit').callsFake((event, fields) => events.push({ event, fields }));
    t.teardown(() => emit.restore());
    const session = new ProtocolSession(makeProtocol(), makeProtocol(sinon.stub().resolves(ResultCode.TIMEOUT)), await createWallet(), cfg);
    session.setV1AsPreferredProtocol();
    session.setTelemetryContext({ validator_address: 'validator-a', healthcheck_id: 'check-a' });
    const first = session.sendHealthCheck();
    session.setTelemetryContext({ healthcheck_id: 'check-b' });
    const second = session.sendHealthCheck();
    await Promise.all([first, second]);
    t.alike(events.map(record => record.fields.healthcheck_id).sort(), ['check-a', 'check-b']);
    t.ok(events.every(record => record.fields.validator_address === 'validator-a'));
    t.not(events[0].fields.request_id, events[1].fields.request_id);
});
