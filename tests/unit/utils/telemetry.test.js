import test from 'brittle';
import http from 'http';
import b4a from 'b4a';
import { Telemetry, getTelemetry } from '../../../src/utils/telemetry.js';
import { createGraylogConfig } from '../../../src/config/graylog.js';
import { createConfig, ENV } from '../../../src/config/env.js';

function logger(settings = {}) {
    const instance = new Telemetry({ environment: 'test', allowInTests: true, ...settings });
    instance.warn = () => {};
    return instance;
}

async function collector(t, handler) {
    const sockets = new Set();
    const server = http.createServer(handler);
    server.on('connection', socket => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    t.teardown(async () => {
        for (const socket of sockets) socket.destroy();
        await new Promise(resolve => server.close(resolve));
    });
    return `http://127.0.0.1:${server.address().port}/gelf`;
}

test('Graylog config: environment mapping, explicit opt-in for tests and per-config snapshot', t => {
    const env = {
        NODE_ENV: 'test', GRAYLOG_URL: 'http://collector.example/gelf', GRAYLOG_TOKEN: 'secret',
        GRAYLOG_APP: 'msb-explorer-rpc', GRAYLOG_HOST: 'node-one', GRAYLOG_RELEASE: 'commit-one',
        GRAYLOG_TIMEOUT_MS: '200', GRAYLOG_MAX_QUEUE_SIZE: '-1', GRAYLOG_INTERVAL_MS: '15000',
    };
    const settings = createGraylogConfig({}, env);
    t.is(settings.enabled, false);
    t.is(settings.host, 'node-one');
    t.is(settings.app, 'msb-explorer-rpc');
    t.is(settings.release, 'commit-one');
    t.is(settings.timeoutMs, 200);
    t.is(settings.maxQueueSize, 1000);
    t.is(settings.intervalMs, 15000);
    t.is(createGraylogConfig({ allowInTests: true }, env).enabled, true);
    t.is(createGraylogConfig({ url: '' }, env).enabled, false);
    const override = { ...settings, allowInTests: true, enabled: true };
    const config = createConfig(ENV.MAINNET, { graylog: override });
    override.host = 'changed';
    t.is(config.graylog.host, 'node-one', 'config captures settings rather than retaining the override');
    t.is(getTelemetry(config), getTelemetry(config), 'all components share one telemetry instance');
    t.not(getTelemetry(config), getTelemetry({ graylog: config.graylog }), 'different configs are isolated');
});

test('Graylog disabled: no serialization, observer callbacks or network work', async t => {
    const instance = logger({ url: '' });
    let called = false;
    instance.onEvent(() => { called = true; });
    instance.emit('tx.received', new Proxy({}, { ownKeys() { throw new Error('must not inspect'); } }));
    t.is(instance.enabled, false);
    t.is(called, false);
    t.is(instance.stats().emitted, 0);
    t.is(await instance.flush(), true);
    await instance.close();
    t.is(getTelemetry({}).enabled, false, 'test doubles without settings stay disabled');
});

test('Graylog HTTP: valid GELF, safe fields, protected metadata and credential isolation', async t => {
    const received = [];
    const url = await collector(t, (request, response) => {
        const chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
            received.push({ headers: request.headers, body: JSON.parse(b4a.concat(chunks).toString()) });
            response.statusCode = 202;
            response.end();
        });
    });
    const instance = logger({ url, token: 'test-credential', host: 'node-a', app: 'msb-explorer-rpc', release: 'abc123' });
    t.teardown(() => instance.close());
    const circular = { amount: 10n, secret: 'do-not-send' };
    circular.self = circular;
    let getterCalls = 0;
    const fields = {
        tx_hash: 'abc', attempt: 2, success: true, circular,
        error: new Error(`failed sending test-credential to ${url}`),
        note: `value test-credential and ${url}`,
        _app: 'attacker', host: 'attacker', _event: 'attacker', timestamp: 0,
        token: 'hidden', payload: { arbitrary: 'hidden' },
        get dangerous() { getterCalls++; throw new Error('getter'); },
    };
    instance.setContext({ node_id: 'one', token: 'hidden' });
    let observed;
    const unsubscribe = instance.onEvent(record => { observed = record; });
    instance.onEvent(() => { throw new Error('observer failed'); });
    instance.emit('tx.received', fields, 6);
    unsubscribe();
    t.is(await instance.flush(), true);
    t.is(received.length, 1);
    const { headers, body } = received[0];
    t.is(headers['x-graylog-token'], 'test-credential');
    t.is(body.version, '1.1');
    t.is(body.host, 'node-a');
    t.is(body._app, 'msb-explorer-rpc');
    t.is(body._event, 'tx.received');
    t.is(body._git_sha, 'abc123');
    t.is(body._node_id, 'one');
    t.is(body._success, 'true');
    t.is(body._attempt, 2);
    t.is(JSON.parse(body._circular).amount, '10');
    t.is(JSON.parse(body._circular).self, '[Circular]');
    t.is(JSON.parse(body._circular).secret, '[REDACTED]');
    t.is(body._token, undefined);
    t.is(body._payload, undefined);
    t.is(getterCalls, 0);
    t.absent(JSON.stringify(body).includes('test-credential'));
    t.absent(JSON.stringify(body).includes(url));
    t.is(observed.event, 'tx.received');
    t.is(observed.fields.tx_hash, 'abc');
    t.is(instance.stats().sent, 1);
});

test('Graylog serialization errors and oversized records never interrupt application work', async t => {
    const instance = logger({ url: 'http://127.0.0.1:1/gelf', maxMessageBytes: 1024 });
    instance.emit('bad.proxy', new Proxy({}, { ownKeys() { throw new Error('bad object'); } }));
    instance.emit('too.large', { text: 'x'.repeat(3000) });
    t.is(instance.stats().dropped, 2);
    t.is(instance.stats().queueSize, 0);
    t.is(await instance.flush(), true);
    await instance.close();
});

test('Graylog HTTP error status is a failure and response content is not retained', async t => {
    const url = await collector(t, (request, response) => {
        request.on('data', () => {});
        request.on('end', () => {
            response.statusCode = 401;
            response.end('arbitrary secret server response');
        });
    });
    const instance = logger({ url });
    t.teardown(() => instance.close());
    instance.emit('test.event');
    await instance.flush();
    t.is(instance.stats().sent, 0);
    t.is(instance.stats().failed, 1);
    t.is(instance.stats().lastError, 'HTTP_401');
    t.absent(JSON.stringify(instance.stats()).includes('secret'));
});

test('Graylog queue, concurrency and hung requests are bounded', async t => {
    let requests = 0;
    const url = await collector(t, request => {
        requests++;
        request.on('data', () => {});
    });
    const instance = logger({ url, maxQueueSize: 2, concurrency: 1, timeoutMs: 50 });
    t.teardown(() => instance.close());
    for (let i = 0; i < 5; i++) instance.emit('test.event', { i });
    t.is(instance.stats().dropped, 3);
    await Promise.resolve();
    t.is(instance.stats().inFlight, 1);
    t.is(instance.stats().queueSize, 1);
    t.is(await instance.flush(1500), true);
    t.is(instance.stats().timeouts, 2);
    t.is(instance.stats().inFlight, 0);
    t.is(requests, 2);
    await instance.close();
    instance.emit('after.close');
    t.is(instance.stats().emitted, 5);
});

test('Graylog flush deadline does not wait indefinitely and close drains', async t => {
    const url = await collector(t, request => request.on('data', () => {}));
    const instance = logger({ url, timeoutMs: 60 });
    instance.emit('test.event');
    t.is(await instance.flush(5), false);
    await instance.close();
    t.is(instance.stats().closed, true);
    t.is(instance.stats().inFlight, 0);
    t.is(instance.stats().queueSize, 0);
});

test('Graylog invalid destinations fail without leaking the configured URL', async t => {
    const instance = logger({ url: 'http://secret:credential@127.0.0.1/gelf' });
    instance.emit('test.event');
    await instance.flush();
    t.is(instance.stats().lastError, 'INVALID_URL');
    t.is(instance.stats().failed, 1);
    await instance.close();
});

test('Graylog local transport warnings are rate limited and omit credentials', async t => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = message => warnings.push(message);
    t.teardown(() => { console.warn = originalWarn; });
    const instance = new Telemetry({ url: 'invalid-secret-url', token: 'private-credential' });
    for (let i = 0; i < 4; i++) instance.emit('test.event');
    await instance.flush();
    t.is(instance.stats().failed, 4);
    t.is(warnings.length, 1);
    t.ok(warnings[0].includes('INVALID_URL'));
    t.absent(warnings[0].includes('secret'));
    t.absent(warnings[0].includes('credential'));
    await instance.close();
});

if (typeof globalThis.Bare !== 'undefined') {
    test('Graylog Bare: HTTPS fails explicitly rather than using unverified TLS', async t => {
        const instance = logger({ url: 'https://collector.invalid/gelf' });
        instance.emit('test.event');
        await instance.flush();
        t.is(instance.stats().lastError, 'HTTPS_REQUIRES_NODE');
        t.is(instance.stats().failed, 1);
        await instance.close();
    });
}
