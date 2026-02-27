import { test } from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import { config } from '../../helpers/config.js';
import { NetworkOperationType, V1_PROTOCOL_PAYLOAD_MAX_SIZE } from '../../../src/utils/constants.js';
import { encodeV1networkOperation } from '../../../src/utils/protobuf/operationHelpers.js';
import NetworkMessageRouterV1 from '../../../src/core/network/protocols/v1/NetworkMessageRouter.js';
import V1LivenessOperationHandler from '../../../src/core/network/protocols/v1/handlers/V1LivenessOperationHandler.js';
import V1BroadcastTransactionOperationHandler from '../../../src/core/network/protocols/v1/handlers/V1BroadcastTransactionOperationHandler.js';

const makeConnection = (sandbox) => ({
    remotePublicKey: b4a.alloc(32, 0x01),
    protocolSession: {
        setV1AsPreferredProtocol: sandbox.stub()
    },
    end: sandbox.stub()
});

const buildRouter = (t) => {
    const sandbox = sinon.createSandbox();
    t.teardown(() => sandbox.restore());
    sandbox.stub(console, 'error');

    const handlerStubs = {
        livenessRequest: sandbox.stub(V1LivenessOperationHandler.prototype, 'handleRequest').resolves(),
        livenessResponse: sandbox.stub(V1LivenessOperationHandler.prototype, 'handleResponse').resolves(),
        broadcastRequest: sandbox.stub(V1BroadcastTransactionOperationHandler.prototype, 'handleRequest').resolves(),
        broadcastResponse: sandbox.stub(V1BroadcastTransactionOperationHandler.prototype, 'handleResponse').resolves()
    };

    const router = new NetworkMessageRouterV1(
        {},
        { address: 'test-wallet' },
        {},
        {},
        {},
        {},
        config
    );

    return { router, handlerStubs, sandbox };
};

const buildMessage = (type, extra = {}) => encodeV1networkOperation({
    type,
    id: '1',
    ...extra
});

const buildMaxSizeMessage = () => {
    const basePayload = {
        type: NetworkOperationType.LIVENESS_REQUEST,
        id: '1',
        capabilities: ['']
    };
    const baseLength = encodeV1networkOperation(basePayload).length;
    let fillerLength = Math.max(0, V1_PROTOCOL_PAYLOAD_MAX_SIZE - baseLength - 1);
    let buffer = encodeV1networkOperation({
        ...basePayload,
        capabilities: ['a'.repeat(fillerLength)]
    });

    if (buffer.length !== V1_PROTOCOL_PAYLOAD_MAX_SIZE) {
        const delta = V1_PROTOCOL_PAYLOAD_MAX_SIZE - buffer.length;
        fillerLength = Math.max(0, fillerLength + delta);
        buffer = encodeV1networkOperation({
            ...basePayload,
            capabilities: ['a'.repeat(fillerLength)]
        });
    }

    if (buffer.length !== V1_PROTOCOL_PAYLOAD_MAX_SIZE) {
        throw new Error(
            `Failed to build payload of size ${V1_PROTOCOL_PAYLOAD_MAX_SIZE}, got ${buffer.length}`
        );
    }

    return buffer;
};

const getUnsupportedType = () => {
    const values = Object.values(NetworkOperationType).map(Number);
    return Math.max(...values) + 1;
};

test('NetworkMessageRouterV1', async (t) => {
    await t.test('pre-validation failures', async (t) => {
        await t.test('rejects null message', async (t) => {
            const { router, handlerStubs, sandbox } = buildRouter(t);
            const connection = makeConnection(sandbox);

            await router.route(null, connection);

            t.ok(connection.end.calledOnce, 'should end connection');
            t.ok(connection.protocolSession.setV1AsPreferredProtocol.notCalled, 'should not set preferred protocol');
            t.ok(handlerStubs.livenessRequest.notCalled, 'liveness handler not called');
            t.ok(handlerStubs.broadcastRequest.notCalled, 'broadcast handler not called');
        });

        await t.test('rejects non-buffer message', async (t) => {
            const { router, handlerStubs, sandbox } = buildRouter(t);
            const connection = makeConnection(sandbox);

            await router.route('not-a-buffer', connection);

            t.ok(connection.end.calledOnce, 'should end connection');
            t.ok(connection.protocolSession.setV1AsPreferredProtocol.notCalled, 'should not set preferred protocol');
            t.ok(handlerStubs.livenessRequest.notCalled, 'liveness handler not called');
            t.ok(handlerStubs.broadcastRequest.notCalled, 'broadcast handler not called');
        });

        await t.test('rejects empty buffer', async (t) => {
            const { router, handlerStubs, sandbox } = buildRouter(t);
            const connection = makeConnection(sandbox);

            await router.route(b4a.alloc(0), connection);

            t.ok(connection.end.calledOnce, 'should end connection');
            t.ok(connection.protocolSession.setV1AsPreferredProtocol.notCalled, 'should not set preferred protocol');
            t.ok(handlerStubs.livenessRequest.notCalled, 'liveness handler not called');
            t.ok(handlerStubs.broadcastRequest.notCalled, 'broadcast handler not called');
        });

        await t.test('rejects oversized buffer', async (t) => {
            const { router, handlerStubs, sandbox } = buildRouter(t);
            const connection = makeConnection(sandbox);
            const oversized = b4a.alloc(V1_PROTOCOL_PAYLOAD_MAX_SIZE + 1, 0x01);

            await router.route(oversized, connection);

            t.ok(connection.end.calledOnce, 'should end connection');
            t.ok(connection.protocolSession.setV1AsPreferredProtocol.notCalled, 'should not set preferred protocol');
            t.ok(handlerStubs.livenessRequest.notCalled, 'liveness handler not called');
            t.ok(handlerStubs.broadcastRequest.notCalled, 'broadcast handler not called');
        });
    });

    await t.test('pre-validation accepts max size payload', async (t) => {
        const { router, handlerStubs, sandbox } = buildRouter(t);
        const connection = makeConnection(sandbox);
        const maxSizePayload = buildMaxSizeMessage();

        await router.route(maxSizePayload, connection);

        t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
        t.ok(connection.end.notCalled, 'should not end connection');
        t.ok(handlerStubs.livenessRequest.calledOnce, 'liveness handler called');
    });

    await t.test('decode failure disconnects', async (t) => {
        const { router, handlerStubs, sandbox } = buildRouter(t);
        const connection = makeConnection(sandbox);

        await router.route(b4a.from([0x07]), connection);

        t.ok(connection.end.calledOnce, 'should end connection');
        t.ok(connection.protocolSession.setV1AsPreferredProtocol.notCalled, 'should not set preferred protocol');
        t.ok(handlerStubs.livenessRequest.notCalled, 'liveness handler not called');
        t.ok(handlerStubs.broadcastRequest.notCalled, 'broadcast handler not called');
    });

    await t.test('invalid message type disconnects', async (t) => {
        const { router, handlerStubs, sandbox } = buildRouter(t);
        const connection = makeConnection(sandbox);
        const invalidMessage = buildMessage(0);

        await router.route(invalidMessage, connection);

        t.ok(connection.end.calledOnce, 'should end connection');
        t.ok(connection.protocolSession.setV1AsPreferredProtocol.notCalled, 'should not set preferred protocol');
        t.ok(handlerStubs.livenessRequest.notCalled, 'liveness handler not called');
        t.ok(handlerStubs.broadcastRequest.notCalled, 'broadcast handler not called');
    });

    await t.test('unsupported type disconnects after setting preferred protocol', async (t) => {
        const { router, handlerStubs, sandbox } = buildRouter(t);
        const connection = makeConnection(sandbox);
        const unsupportedMessage = buildMessage(getUnsupportedType());

        await router.route(unsupportedMessage, connection);

        t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
        t.ok(connection.end.calledOnce, 'should end connection');
        t.ok(handlerStubs.livenessRequest.notCalled, 'liveness request not called');
        t.ok(handlerStubs.livenessResponse.notCalled, 'liveness response not called');
        t.ok(handlerStubs.broadcastRequest.notCalled, 'broadcast request not called');
        t.ok(handlerStubs.broadcastResponse.notCalled, 'broadcast response not called');
    });

    await t.test('routes supported operation types', async (t) => {
        await t.test('LIVENESS_REQUEST -> liveness.handleRequest', async (t) => {
            const { router, handlerStubs, sandbox } = buildRouter(t);
            const connection = makeConnection(sandbox);

            await router.route(buildMessage(NetworkOperationType.LIVENESS_REQUEST), connection);

            t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
            t.ok(connection.end.notCalled, 'should not end connection');
            t.ok(handlerStubs.livenessRequest.calledOnce, 'liveness request called');
            t.is(handlerStubs.livenessRequest.firstCall.args[0].type, NetworkOperationType.LIVENESS_REQUEST);
            t.is(handlerStubs.livenessRequest.firstCall.args[1], connection, 'passes connection');
            t.ok(handlerStubs.livenessResponse.notCalled);
            t.ok(handlerStubs.broadcastRequest.notCalled);
            t.ok(handlerStubs.broadcastResponse.notCalled);
        });

        await t.test('LIVENESS_RESPONSE -> liveness.handleResponse', async (t) => {
            const { router, handlerStubs, sandbox } = buildRouter(t);
            const connection = makeConnection(sandbox);

            await router.route(buildMessage(NetworkOperationType.LIVENESS_RESPONSE), connection);

            t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
            t.ok(connection.end.notCalled, 'should not end connection');
            t.ok(handlerStubs.livenessResponse.calledOnce, 'liveness response called');
            t.is(handlerStubs.livenessResponse.firstCall.args[0].type, NetworkOperationType.LIVENESS_RESPONSE);
            t.is(handlerStubs.livenessResponse.firstCall.args[1], connection, 'passes connection');
            t.ok(handlerStubs.livenessRequest.notCalled);
            t.ok(handlerStubs.broadcastRequest.notCalled);
            t.ok(handlerStubs.broadcastResponse.notCalled);
        });

        await t.test('BROADCAST_TRANSACTION_REQUEST -> broadcast.handleRequest', async (t) => {
            const { router, handlerStubs, sandbox } = buildRouter(t);
            const connection = makeConnection(sandbox);

            await router.route(buildMessage(NetworkOperationType.BROADCAST_TRANSACTION_REQUEST), connection);

            t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
            t.ok(connection.end.notCalled, 'should not end connection');
            t.ok(handlerStubs.broadcastRequest.calledOnce, 'broadcast request called');
            t.is(handlerStubs.broadcastRequest.firstCall.args[0].type, NetworkOperationType.BROADCAST_TRANSACTION_REQUEST);
            t.is(handlerStubs.broadcastRequest.firstCall.args[1], connection, 'passes connection');
            t.ok(handlerStubs.broadcastResponse.notCalled);
            t.ok(handlerStubs.livenessRequest.notCalled);
            t.ok(handlerStubs.livenessResponse.notCalled);
        });

        await t.test('BROADCAST_TRANSACTION_RESPONSE -> broadcast.handleResponse', async (t) => {
            const { router, handlerStubs, sandbox } = buildRouter(t);
            const connection = makeConnection(sandbox);

            await router.route(buildMessage(NetworkOperationType.BROADCAST_TRANSACTION_RESPONSE), connection);

            t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
            t.ok(connection.end.notCalled, 'should not end connection');
            t.ok(handlerStubs.broadcastResponse.calledOnce, 'broadcast response called');
            t.is(handlerStubs.broadcastResponse.firstCall.args[0].type, NetworkOperationType.BROADCAST_TRANSACTION_RESPONSE);
            t.is(handlerStubs.broadcastResponse.firstCall.args[1], connection, 'passes connection');
            t.ok(handlerStubs.broadcastRequest.notCalled);
            t.ok(handlerStubs.livenessRequest.notCalled);
            t.ok(handlerStubs.livenessResponse.notCalled);
        });
    });

    await t.test('handler errors disconnect', async (t) => {
        const { router, handlerStubs, sandbox } = buildRouter(t);
        const connection = makeConnection(sandbox);

        handlerStubs.livenessRequest.rejects(new Error('handler-fail'));

        await router.route(buildMessage(NetworkOperationType.LIVENESS_REQUEST), connection);

        t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
        t.ok(handlerStubs.livenessRequest.calledOnce, 'handler called');
        t.ok(connection.end.calledOnce, 'should end connection');
    });

    await t.test('broadcast handler errors disconnect', async (t) => {
        await t.test('broadcast request handler throws', async (t) => {
            const { router, handlerStubs, sandbox } = buildRouter(t);
            const connection = makeConnection(sandbox);

            handlerStubs.broadcastRequest.rejects(new Error('broadcast-request-fail'));

            await router.route(buildMessage(NetworkOperationType.BROADCAST_TRANSACTION_REQUEST), connection);

            t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
            t.ok(handlerStubs.broadcastRequest.calledOnce, 'broadcast request handler called');
            t.ok(connection.end.calledOnce, 'should end connection');
        });

        await t.test('broadcast response handler throws', async (t) => {
            const { router, handlerStubs, sandbox } = buildRouter(t);
            const connection = makeConnection(sandbox);

            handlerStubs.broadcastResponse.rejects(new Error('broadcast-response-fail'));

            await router.route(buildMessage(NetworkOperationType.BROADCAST_TRANSACTION_RESPONSE), connection);

            t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
            t.ok(handlerStubs.broadcastResponse.calledOnce, 'broadcast response handler called');
            t.ok(connection.end.calledOnce, 'should end connection');
        });
    });
});
