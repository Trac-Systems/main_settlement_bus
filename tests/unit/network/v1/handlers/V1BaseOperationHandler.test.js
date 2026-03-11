import test from 'brittle';
import RealV1BaseOperationHandler from '../../../../../src/core/network/protocols/v1/handlers/V1BaseOperationHandler.js';
import {V1ProtocolError, V1UnexpectedError} from '../../../../../src/core/network/protocols/v1/V1ProtocolError.js';

const canUseModuleMocks = typeof globalThis.Bare === 'undefined';
const handlerModulePath = '../../../../../src/core/network/protocols/v1/handlers/V1BaseOperationHandler.js';
const helpersModulePath = '../../../../../src/utils/helpers.js';
const mockConfig = {
    disableRateLimit: false,
    addressPrefix: 'trac'
};

async function loadHandlerClass(t, { publicKeyToAddress = () => 'trac1mocked' } = {}) {
    if (!canUseModuleMocks) {
        return RealV1BaseOperationHandler;
    }

    const { default: esmock } = await import('esmock');
    const V1BaseOperationHandler = await esmock(handlerModulePath, {
        [helpersModulePath]: { publicKeyToAddress }
    });

    t.teardown(() => {
        esmock.purge(V1BaseOperationHandler);
    });

    return V1BaseOperationHandler;
}

function createRateLimiter() {
    const calls = [];

    return {
        calls,
        service: {
            v1HandleRateLimit(connection) {
                calls.push(connection);
            }
        }
    };
}

function createPendingRequestService({ entries = {}, shouldReject = true } = {}) {
    const state = {
        entries,
        stopped: [],
        resolved: [],
        rejected: [],
        shouldReject
    };

    return {
        state,
        service: {
            getPendingRequest(id) {
                return state.entries[id];
            },
            stopPendingRequestTimeout(id) {
                state.stopped.push(id);
            },
            resolvePendingRequest(id, code) {
                state.resolved.push({ id, code });
            },
            rejectPendingRequest(id, err) {
                if (state.shouldReject) {
                    state.rejected.push({ id, err });
                }
                return state.shouldReject;
            }
        }
    };
}

function createConnection() {
    const state = {
        ended: false,
        flushed: false,
        sentPayloads: []
    };

    return {
        state,
        connection: {
            remotePublicKey: Buffer.alloc(32),
            protocolSession: {
                sendAndForget(payload) {
                    state.sentPayloads.push(payload);
                }
            },
            async flush() {
                state.flushed = true;
            },
            end() {
                state.ended = true;
            }
        }
    };
}

function captureConsoleError(t) {
    const calls = [];
    const originalConsoleError = console.error;

    console.error = (...args) => {
        calls.push(args);
    };

    t.teardown(() => {
        console.error = originalConsoleError;
    });

    return calls;
}

function assertLoggedError(t, logs, step, errorMessage) {
    t.is(logs.length, 1, 'Should log exactly once');
    t.ok(
        logs[0][0].startsWith(`V1BaseOperationHandler: ${step} `),
        'Should include handler name and step'
    );
    t.ok(
        logs[0][0].endsWith(`: ${errorMessage}`),
        'Should include the error message'
    );
}

test('constructor: stores provided config -> config getter returns same reference', async (t) => {
    const V1BaseOperationHandler = await loadHandlerClass(t);
    const handler = new V1BaseOperationHandler(null, null, mockConfig);

    t.is(handler.config, mockConfig, 'Should return the config passed in the constructor');
});

test('applyRateLimit: rate limit enabled -> calls rate limiter with connection', async (t) => {
    const V1BaseOperationHandler = await loadHandlerClass(t);
    const rateLimiter = createRateLimiter();
    const handler = new V1BaseOperationHandler(rateLimiter.service, null, mockConfig);
    const conn = { id: 1 };

    handler.applyRateLimit(conn);

    t.is(rateLimiter.calls.length, 1, 'Should call the rate limiter when enabled');
    t.is(rateLimiter.calls[0], conn, 'Should pass the connection to the rate limiter');
});

test('applyRateLimit: disableRateLimit=true -> skips rate limiter call', async (t) => {
    const V1BaseOperationHandler = await loadHandlerClass(t);
    const rateLimiter = createRateLimiter();
    const handler = new V1BaseOperationHandler(rateLimiter.service, null, { disableRateLimit: true });

    handler.applyRateLimit({});

    t.is(rateLimiter.calls.length, 0, 'Should NOT call the rate limiter when disableRateLimit is true');
});

test('resolvePendingResponse: pending request missing -> returns false', async (t) => {
    const V1BaseOperationHandler = await loadHandlerClass(t);
    const pendingReq = createPendingRequestService();
    const handler = new V1BaseOperationHandler(null, pendingReq.service, mockConfig);

    const result = await handler.resolvePendingResponse({ id: 'msg-123' }, {}, {}, () => {}, {});

    t.is(result, false, 'Should return false if the pending request does not exist');
});

test('resolvePendingResponse: valid pending response -> stops timeout and resolves request', async (t) => {
    const V1BaseOperationHandler = await loadHandlerClass(t);
    const pendingReq = createPendingRequestService({
        entries: { 'msg-123': { id: 'msg-123' } }
    });
    const handler = new V1BaseOperationHandler(null, pendingReq.service, mockConfig);

    let validated = false;
    const validatorMock = {
        async validate() {
            validated = true;
        }
    };
    const extractCodeMock = () => 'SUCCESS';

    const result = await handler.resolvePendingResponse(
        { id: 'msg-123' },
        {},
        validatorMock,
        extractCodeMock,
        {}
    );

    t.is(result, true, 'Should return true after resolving the request');
    t.is(pendingReq.state.stopped[0], 'msg-123', 'Should stop the timeout');
    t.ok(validated, 'Should call validation');
    t.is(pendingReq.state.resolved[0].code, 'SUCCESS', 'Should extract resultCode and resolve');
});

test('resolvePendingResponse: validator throws -> propagates validation error', async (t) => {
    const V1BaseOperationHandler = await loadHandlerClass(t);
    const pendingReq = createPendingRequestService({
        entries: { 'msg-123': { id: 'msg-123' } }
    });
    const handler = new V1BaseOperationHandler(null, pendingReq.service, mockConfig);

    const validatorMock = {
        async validate() {
            throw new Error('Validation Failed');
        }
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

test('handlePendingResponseError: request already rejected -> does not log or close connection', async (t) => {
    const logs = captureConsoleError(t);
    const V1BaseOperationHandler = await loadHandlerClass(t);
    const pendingReq = createPendingRequestService({ shouldReject: false });
    const handler = new V1BaseOperationHandler(null, pendingReq.service, mockConfig);
    const conn = createConnection();

    handler.handlePendingResponseError('msg-123', conn.connection, new Error('test'), 'step');

    t.absent(conn.state.ended, 'Should NOT end the connection if the request was already rejected');
    t.is(logs.length, 0, 'Should NOT log if the request was already rejected');
});

test('handlePendingResponseError: unknown native error -> maps to V1UnexpectedError', async (t) => {
    captureConsoleError(t);
    const V1BaseOperationHandler = await loadHandlerClass(t);
    const pendingReq = createPendingRequestService();
    const handler = new V1BaseOperationHandler(null, pendingReq.service, mockConfig);
    const conn = createConnection();

    handler.handlePendingResponseError(
        'msg-123',
        conn.connection,
        new Error('Random native error'),
        'test-step'
    );

    t.is(pendingReq.state.rejected.length, 1, 'Should reject the pending request');

    const capturedError = pendingReq.state.rejected[0].err;

    t.ok(capturedError instanceof V1UnexpectedError, 'Should map to V1UnexpectedError');
    t.is(capturedError.message, 'Random native error', 'Should preserve original message');
    t.absent(conn.state.ended, 'V1UnexpectedError should not close the connection by default');
});

test('handlePendingResponseError: protocol error with endConnection=true -> does not close connection directly', async (t) => {
    captureConsoleError(t);
    const V1BaseOperationHandler = await loadHandlerClass(t);
    const pendingReq = createPendingRequestService();
    const handler = new V1BaseOperationHandler(null, pendingReq.service, mockConfig);
    const conn = createConnection();

    const protocolError = new V1ProtocolError(999, 'FATAL_ERROR', true);

    handler.handlePendingResponseError(
        'msg-123',
        conn.connection,
        protocolError,
        'test-step'
    );

    t.is(
        pendingReq.state.rejected[0].err,
        protocolError,
        'Should pass protocol error without wrapping'
    );

    t.absent(conn.state.ended, 'Connection closing is delegated to ConnectionManager');
});

test('handlePendingResponseError: delegates logging -> logs mapped error details', async (t) => {
    const logs = captureConsoleError(t);
    const V1BaseOperationHandler = await loadHandlerClass(t);
    const pendingReq = createPendingRequestService();
    const handler = new V1BaseOperationHandler(null, pendingReq.service, mockConfig);
    const conn = createConnection();

    handler.handlePendingResponseError(
        'msg-1',
        conn.connection,
        new Error('boom'),
        'step'
    );

    assertLoggedError(t, logs, 'step', 'boom');
});

test('handlePendingResponseError: protocol-shaped error -> keeps original error instance', async (t) => {
    captureConsoleError(t);
    const V1BaseOperationHandler = await loadHandlerClass(t);
    const pendingReq = createPendingRequestService();
    const handler = new V1BaseOperationHandler(null, pendingReq.service, mockConfig);
    const conn = createConnection();

    const protocolError = new V1ProtocolError(123, 'protocol-shaped', false);

    handler.handlePendingResponseError(
        'msg-1',
        conn.connection,
        protocolError,
        'step'
    );

    t.is(
        pendingReq.state.rejected[0].err,
        protocolError,
        'Should not wrap protocol error'
    );
});

test('handlePendingResponseError: undefined error -> uses Unexpected error fallback', async (t) => {
    const logs = captureConsoleError(t);
    const V1BaseOperationHandler = await loadHandlerClass(t);
    const pendingReq = createPendingRequestService();
    const handler = new V1BaseOperationHandler(null, pendingReq.service, mockConfig);
    const conn = createConnection();

    handler.handlePendingResponseError(
        'msg-123',
        conn.connection,
        undefined,
        'step'
    );

    const captured = pendingReq.state.rejected[0].err;

    t.ok(captured instanceof V1UnexpectedError);
    t.is(captured.message, 'Unexpected error');
    assertLoggedError(t, logs, 'step', 'Unexpected error');
});

test('displayError: real implementation with invalid config -> throws', async (t) => {
    const logs = captureConsoleError(t);
    const handler = new RealV1BaseOperationHandler(
        null,
        null,
        {} // intentionally invalid config
    );

    await t.exception(() => {
        handler.displayError(
            'step',
            Buffer.alloc(33, 1),
            new Error('boom')
        );
    });

    t.is(logs.length, 0, 'Should not reach console.error when address formatting throws');
});

test('displayError: esmocked helper -> logs formatted message', async (t) => {
    if (!canUseModuleMocks) {
        t.pass('esmock is not available in bare/pear runtimes');
        return;
    }

    const logs = captureConsoleError(t);
    const V1BaseOperationHandler = await loadHandlerClass(t, {
        publicKeyToAddress: () => 'trac1display'
    });
    const handler = new V1BaseOperationHandler(null, null, mockConfig);

    handler.displayError(
        'step',
        Buffer.alloc(32, 1),
        new Error('boom')
    );

    t.alike(logs, [
        ['V1BaseOperationHandler: step trac1display: boom']
    ]);
});

test('handlePendingResponseError: primitive error value -> uses Unexpected error fallback', async (t) => {
    const logs = captureConsoleError(t);
    const V1BaseOperationHandler = await loadHandlerClass(t);
    const pendingReq = createPendingRequestService();
    const handler = new V1BaseOperationHandler(null, pendingReq.service, mockConfig);
    const conn = createConnection();

    handler.handlePendingResponseError(
        'msg-123',
        conn.connection,
        'string error',
        'step'
    );

    const captured = pendingReq.state.rejected[0].err;

    t.ok(captured instanceof V1UnexpectedError);
    t.is(captured.message, 'Unexpected error');
    assertLoggedError(t, logs, 'step', 'Unexpected error');
});
