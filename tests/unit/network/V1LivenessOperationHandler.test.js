import test from 'brittle';
import b4a from 'b4a';
import V1LivenessOperationHandler from '../../../src/core/network/protocols/v1/handlers/V1LivenessOperationHandler.js';
import V1LivenessRequest from '../../../src/core/network/protocols/v1/validators/V1LivenessRequest.js';
import V1LivenessResponse from '../../../src/core/network/protocols/v1/validators/V1LivenessResponse.js';
import { ResultCode } from '../../../src/utils/constants.js';

// Backup original validators
const originalReqValidate = V1LivenessRequest.prototype.validate;
const originalResValidate = V1LivenessResponse.prototype.validate;

const mockConfig = {
    hrp: 'trac',
    networkId: 1,
    disableRateLimit: true,
    network: { hrp: 'trac' }
};

// Minimal wallet required so constructor does not break
const mockWallet = {
    getPublicKey: () => b4a.alloc(33, 2),
    sign: async () => b4a.alloc(64),
    address: 'trac1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    networkId: 1
};

class MockConnection {
    constructor() {
        this.remotePublicKey = b4a.alloc(32);
        this.ended = false;
        this.sentPayload = null;
        this.protocolSession = {
            sendAndForget: () => {}
        };
    }

    end() {
        this.ended = true;
    }
}

const mockRateLimiter = {
    v1HandleRateLimit: () => {}
};

test('V1LivenessOperationHandler - handleRequest coverage', async (t) => {

    // -------- SUCCESS FLOW (does not validate real payload) --------
    {
        V1LivenessRequest.prototype.validate = async () => {};

        const handler = new V1LivenessOperationHandler(
            mockWallet,
            mockRateLimiter,
            {},
            mockConfig
        );

        handler.displayError = () => {};

        const conn = new MockConnection();

        await handler.handleRequest({ id: b4a.alloc(32) }, conn);

        // Real factory is not being asserted
        t.pass('Success path executed');
    }

    // -------- VALIDATION ERROR + endConnection true --------
    {
        V1LivenessRequest.prototype.validate = async () => {
            const err = new Error('Validation Fail');
            err.resultCode = ResultCode.INVALID_PAYLOAD;
            err.endConnection = true;
            throw err;
        };

        const handler = new V1LivenessOperationHandler(
            mockWallet,
            mockRateLimiter,
            {},
            mockConfig
        );

        handler.displayError = () => {};

        const conn = new MockConnection();

        await handler.handleRequest({ id: b4a.alloc(32) }, conn);

        t.ok(conn.ended);
    }

    // -------- VALIDATION ERROR without endConnection --------
    {
        V1LivenessRequest.prototype.validate = async () => {
            const err = new Error('Validation Fail No End');
            err.resultCode = ResultCode.INVALID_PAYLOAD;
            throw err;
        };

        const handler = new V1LivenessOperationHandler(
            mockWallet,
            mockRateLimiter,
            {},
            mockConfig
        );

        handler.displayError = () => {};

        const conn = new MockConnection();

        await handler.handleRequest({ id: b4a.alloc(32) }, conn);

        t.pass('Validation error without endConnection executed');
    }

    // -------- SEND FAILURE (second catch block) --------
    {
        V1LivenessRequest.prototype.validate = async () => {};

        const handler = new V1LivenessOperationHandler(
            mockWallet,
            mockRateLimiter,
            {},
            mockConfig
        );

        handler.displayError = () => {};

        const conn = new MockConnection();

        conn.protocolSession.sendAndForget = () => {
            throw new Error('send fail');
        };

        await handler.handleRequest({ id: b4a.alloc(32) }, conn);

        t.ok(conn.ended);
    }
});

test('V1LivenessOperationHandler - handleResponse coverage', async (t) => {

    const handler = new V1LivenessOperationHandler(
        mockWallet,
        mockRateLimiter,
        {},
        mockConfig
    );

    // resolvePendingResponse success path
    {
        let extractorCalled = false;

        handler.resolvePendingResponse = async (msg, conn, val, extractor) => {
            extractor({ liveness_response: { result: 1 } });
            extractorCalled = true;
        };

        await handler.handleResponse({ id: 'msg-1' }, new MockConnection());

        t.ok(extractorCalled);
    }

    // resolvePendingResponse error path
    {
        handler.resolvePendingResponse = async () => {
            throw new Error('Fail');
        };

        let handled = false;

        handler.handlePendingResponseError = () => {
            handled = true;
        };

        await handler.handleResponse({ id: 'msg-2' }, new MockConnection());

        t.ok(handled);
    }
});

test('Cleanup', async (t) => {
    V1LivenessRequest.prototype.validate = originalReqValidate;
    V1LivenessResponse.prototype.validate = originalResValidate;
    t.pass();
});