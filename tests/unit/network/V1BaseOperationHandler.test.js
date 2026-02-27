import test from 'brittle';
import V1BaseOperationHandler from '../../../src/core/network/protocols/v1/handlers/V1BaseOperationHandler.js';
import { V1UnexpectedError } from '../../../src/core/network/protocols/v1/V1ProtocolError.js';

class MockRateLimiter {
    constructor() { this.called = false; }
    v1HandleRateLimit(conn) {
        this.called = true;
        this.conn = conn;
    }
}

class MockPendingReqService {
    constructor() {
        this.entries = {};
        this.stopped = [];
        this.resolved = [];
        this.rejected = [];
        this.shouldReject = true;
    }
    getPendingRequest(id) { return this.entries[id]; }
    stopPendingRequestTimeout(id) { this.stopped.push(id); }
    resolvePendingRequest(id, code) { this.resolved.push({ id, code }); }
    rejectPendingRequest(id, err) {
        if (this.shouldReject) this.rejected.push({ id, err });
        return this.shouldReject;
    }
}

const mockConfig = { disableRateLimit: false };

test('V1BaseOperationHandler - constructor & config', async (t) => {
    const handler = new V1BaseOperationHandler(null, null, mockConfig);
    t.is(handler.config, mockConfig, 'Should return the config passed in the constructor');
});

test('V1BaseOperationHandler - applyRateLimit (enabled)', async (t) => {
    const rateLimiter = new MockRateLimiter();
    const handler = new V1BaseOperationHandler(rateLimiter, null, mockConfig);
    const conn = { id: 1 };

    handler.applyRateLimit(conn);

    t.ok(rateLimiter.called, 'Should call the rate limiter when enabled');
    t.is(rateLimiter.conn, conn, 'Should pass the connection to the rate limiter');
});

test('V1BaseOperationHandler - applyRateLimit (disabled)', async (t) => {
    const rateLimiter = new MockRateLimiter();
    const handler = new V1BaseOperationHandler(rateLimiter, null, { disableRateLimit: true });

    handler.applyRateLimit({});

    t.absent(rateLimiter.called, 'Should NOT call the rate limiter when disableRateLimit is true');
});

test('V1BaseOperationHandler - resolvePendingResponse (no entry)', async (t) => {
    const pendingReq = new MockPendingReqService();
    const handler = new V1BaseOperationHandler(null, pendingReq, mockConfig);

    const result = await handler.resolvePendingResponse({ id: 'msg-123' }, {}, {}, () => {}, {});

    t.is(result, false, 'Should return false if the pending request does not exist');
});

test('V1BaseOperationHandler - resolvePendingResponse (success)', async (t) => {
    const pendingReq = new MockPendingReqService();
    pendingReq.entries['msg-123'] = { id: 'msg-123' };

    const handler = new V1BaseOperationHandler(null, pendingReq, mockConfig);

    let validated = false;
    const validatorMock = { async validate() { validated = true; } };
    const extractCodeMock = () => 'SUCCESS';

    const result = await handler.resolvePendingResponse(
        { id: 'msg-123' },
        {},
        validatorMock,
        extractCodeMock,
        {}
    );

    t.is(result, true, 'Should return true after resolving the request');
    t.is(pendingReq.stopped[0], 'msg-123', 'Should stop the timeout');
    t.ok(validated, 'Should call validation');
    t.is(pendingReq.resolved[0].code, 'SUCCESS', 'Should extract resultCode and resolve');
});

test('V1BaseOperationHandler - resolvePendingResponse (validation failure)', async (t) => {
    const pendingReq = new MockPendingReqService();
    pendingReq.entries['msg-123'] = { id: 'msg-123' };

    const handler = new V1BaseOperationHandler(null, pendingReq, mockConfig);

    const validatorMock = {
        async validate() { throw new Error('Validation Failed'); }
    };

    await t.exception(async () => {
        await handler.resolvePendingResponse(
            { id: 'msg-123' },
            {},
            validatorMock,
            () => {},
            {}
        );
    }, /Validation Failed/, 'Should propagate the validation error');
});

test('V1BaseOperationHandler - handlePendingResponseError (already rejected)', async (t) => {
    const pendingReq = new MockPendingReqService();
    pendingReq.shouldReject = false;

    const handler = new V1BaseOperationHandler(null, pendingReq, mockConfig);

    let ended = false;
    const connMock = { end: () => { ended = true; } };

    handler.handlePendingResponseError('msg-123', connMock, new Error('test'), 'step');

    t.absent(ended, 'Should NOT end the connection if the request was already rejected');
});

test('V1BaseOperationHandler - handlePendingResponseError (fallback mapping)', async (t) => {
    const pendingReq = new MockPendingReqService();
    const handler = new V1BaseOperationHandler(null, pendingReq, mockConfig);

    // Bypass display logic for isolation
    handler.displayError = () => {};

    let ended = false;
    const connMock = {
        end: () => { ended = true; },
        remotePublicKey: Buffer.alloc(32)
    };

    handler.handlePendingResponseError(
        'msg-123',
        connMock,
        new Error('Random native error'),
        'test-step'
    );

    t.is(pendingReq.rejected.length, 1, 'Should reject the pending request');

    const capturedError = pendingReq.rejected[0].err;

    t.ok(capturedError instanceof V1UnexpectedError, 'Should map to V1UnexpectedError');
    t.is(capturedError.message, 'Random native error', 'Should preserve original message');
    t.absent(ended, 'V1UnexpectedError should not close the connection by default');
});

test('V1BaseOperationHandler - handlePendingResponseError (protocol error + endConnection)', async (t) => {
    const pendingReq = new MockPendingReqService();
    const handler = new V1BaseOperationHandler(null, pendingReq, mockConfig);

    handler.displayError = () => {};

    let ended = false;
    const connMock = {
        end: () => { ended = true; },
        remotePublicKey: Buffer.alloc(32)
    };

    const protocolError = { resultCode: 'FATAL_ERROR', endConnection: true };

    handler.handlePendingResponseError(
        'msg-123',
        connMock,
        protocolError,
        'test-step'
    );

    t.is(
        pendingReq.rejected[0].err,
        protocolError,
        'Should pass protocol error without wrapping'
    );

    t.ok(ended, 'Should call connection.end() when error dictates it');
});

test('displayError is called', async (t) => {
    const pendingReq = new MockPendingReqService();
    const handler = new V1BaseOperationHandler(null, pendingReq, { hrp: 'trac' });

    let called = false;
    handler.displayError = () => { called = true; };

    handler.handlePendingResponseError(
        'msg-1',
        { end() {}, remotePublicKey: Buffer.alloc(32) },
        new Error('boom'),
        'step'
    );

    t.ok(called);
});

test('Protocol error remains untouched', async (t) => {
    const pendingReq = new MockPendingReqService();
    const handler = new V1BaseOperationHandler(null, pendingReq, mockConfig);

    const protocolError = { resultCode: 123 };

    handler.displayError = () => {};

    handler.handlePendingResponseError(
        'msg-1',
        { end() {}, remotePublicKey: Buffer.alloc(32) },
        protocolError,
        'step'
    );

    t.is(
        pendingReq.rejected[0].err,
        protocolError,
        'Should not wrap protocol error'
    );
});

test('handlePendingResponseError - undefined error fallback', async (t) => {
    const pendingReq = new MockPendingReqService();
    const handler = new V1BaseOperationHandler(null, pendingReq, mockConfig);

    handler.displayError = () => {};

    handler.handlePendingResponseError(
        'msg-123',
        { end() {}, remotePublicKey: Buffer.alloc(32) },
        undefined,
        'step'
    );

    const captured = pendingReq.rejected[0].err;

    t.ok(captured instanceof V1UnexpectedError);
    t.is(captured.message, 'Unexpected error');
});

test('displayError executes real implementation (throws due to crypto config)', async (t) => {
    const pendingReq = new MockPendingReqService();

    const handler = new V1BaseOperationHandler(
        null,
        pendingReq,
        {} // intentionally invalid config
    );

    const originalConsoleError = console.error;
    console.error = () => {};

    await t.exception(() => {
        handler.displayError(
            'step',
            Buffer.alloc(33, 1),
            new Error('boom')
        );
    });

    console.error = originalConsoleError;

    t.pass();
});

test('handlePendingResponseError - primitive error fallback', async (t) => {
    const pendingReq = new MockPendingReqService();
    const handler = new V1BaseOperationHandler(null, pendingReq, mockConfig);

    handler.displayError = () => {};

    handler.handlePendingResponseError(
        'msg-123',
        { end() {}, remotePublicKey: Buffer.alloc(32) },
        'string error',
        'step'
    );

    const captured = pendingReq.rejected[0].err;

    t.ok(captured instanceof V1UnexpectedError);
    t.is(captured.message, 'Unexpected error');
});

