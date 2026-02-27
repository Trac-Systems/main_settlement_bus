import { test } from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import esmock from 'esmock';

import { config } from '../../helpers/config.js';
import { NetworkOperationType, V1_PROTOCOL_PAYLOAD_MAX_SIZE } from '../../../src/utils/constants.js';

const makeConnection = () => ({
    remotePublicKey: b4a.alloc(32, 0x01),
    protocolSession: {
        setV1AsPreferredProtocol: sinon.stub()
    },
    end: sinon.stub()
});

const buildRouter = async (overrides = {}) => {
    const decodeStub = overrides.decodeStub ?? sinon.stub();
    const livenessInstances = [];
    const broadcastInstances = [];

    class MockLivenessHandler {
        constructor() {
            this.handleRequest = sinon.stub();
            this.handleResponse = sinon.stub();
            livenessInstances.push(this);
        }
    }

    class MockBroadcastHandler {
        constructor() {
            this.handleRequest = sinon.stub();
            this.handleResponse = sinon.stub();
            broadcastInstances.push(this);
        }
    }

    const NetworkMessageRouterV1 = await esmock(
        '../../../src/core/network/protocols/v1/NetworkMessageRouter.js',
        {
            '../../../src/utils/protobuf/operationHelpers.js': {
                decodeV1networkOperation: decodeStub
            },
            '../../../src/core/network/protocols/v1/handlers/V1LivenessOperationHandler.js': MockLivenessHandler,
            '../../../src/core/network/protocols/v1/handlers/V1BroadcastTransactionOperationHandler.js': MockBroadcastHandler
        }
    );

    const router = new NetworkMessageRouterV1(
        {},
        {},
        {},
        {},
        {},
        {},
        config
    );

    return {
        router,
        decodeStub,
        livenessInstances,
        broadcastInstances
    };
};

const getUnsupportedType = () => {
    const values = Object.values(NetworkOperationType).map(Number);
    return Math.max(...values) + 1;
};

test('NetworkMessageRouterV1', (t) => {
    t.teardown(() => sinon.restore());
    sinon.stub(console, 'error');

    test('pre-validation failures', async (t) => {
        test('rejects null message', async (t) => {
            const { router, decodeStub } = await buildRouter();
            const connection = makeConnection();

            await router.route(null, connection);

            t.ok(connection.end.calledOnce, 'should end connection');
            t.ok(decodeStub.notCalled, 'should not attempt decode');
            t.ok(connection.protocolSession.setV1AsPreferredProtocol.notCalled, 'should not set preferred protocol');
        });

        test('rejects non-buffer message', async (t) => {
            const { router, decodeStub } = await buildRouter();
            const connection = makeConnection();

            await router.route('not-a-buffer', connection);

            t.ok(connection.end.calledOnce, 'should end connection');
            t.ok(decodeStub.notCalled, 'should not attempt decode');
            t.ok(connection.protocolSession.setV1AsPreferredProtocol.notCalled, 'should not set preferred protocol');
        });

        test('rejects empty buffer', async (t) => {
            const { router, decodeStub } = await buildRouter();
            const connection = makeConnection();

            await router.route(b4a.alloc(0), connection);

            t.ok(connection.end.calledOnce, 'should end connection');
            t.ok(decodeStub.notCalled, 'should not attempt decode');
            t.ok(connection.protocolSession.setV1AsPreferredProtocol.notCalled, 'should not set preferred protocol');
        });

        test('rejects oversized buffer', async (t) => {
            const { router, decodeStub } = await buildRouter();
            const connection = makeConnection();
            const oversized = b4a.alloc(V1_PROTOCOL_PAYLOAD_MAX_SIZE + 1, 0x01);

            await router.route(oversized, connection);

            t.ok(connection.end.calledOnce, 'should end connection');
            t.ok(decodeStub.notCalled, 'should not attempt decode');
            t.ok(connection.protocolSession.setV1AsPreferredProtocol.notCalled, 'should not set preferred protocol');
        });
    });

    test('pre-validation accepts max size payload', async (t) => {
        const decoded = { type: NetworkOperationType.LIVENESS_REQUEST, id: 0 };
        const decodeStub = sinon.stub().returns(decoded);
        const { router, livenessInstances } = await buildRouter({ decodeStub });
        const connection = makeConnection();
        const maxSize = b4a.alloc(V1_PROTOCOL_PAYLOAD_MAX_SIZE, 0x01);

        await router.route(maxSize, connection);

        t.ok(decodeStub.calledOnce, 'decode attempted once');
        t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
        t.ok(connection.end.notCalled, 'should not end connection');
        t.ok(livenessInstances[0].handleRequest.calledOnce, 'liveness handler called');
    });

    test('decode failure disconnects', async (t) => {
        const decodeStub = sinon.stub().throws(new Error('boom'));
        const { router } = await buildRouter({ decodeStub });
        const connection = makeConnection();

        await router.route(b4a.alloc(1, 0x01), connection);

        t.ok(decodeStub.calledOnce, 'decode attempted once');
        t.ok(connection.end.calledOnce, 'should end connection');
        t.ok(connection.protocolSession.setV1AsPreferredProtocol.notCalled, 'should not set preferred protocol');
    });

    test('invalid message type disconnects', async (t) => {
        test('missing decoded message', async (t) => {
            const decodeStub = sinon.stub().returns(null);
            const { router } = await buildRouter({ decodeStub });
            const connection = makeConnection();

            await router.route(b4a.alloc(1, 0x01), connection);

            t.ok(decodeStub.calledOnce, 'decode attempted once');
            t.ok(connection.end.calledOnce, 'should end connection');
            t.ok(connection.protocolSession.setV1AsPreferredProtocol.notCalled, 'should not set preferred protocol');
        });

        test('non-integer type', async (t) => {
            const decodeStub = sinon.stub().returns({ type: '1' });
            const { router } = await buildRouter({ decodeStub });
            const connection = makeConnection();

            await router.route(b4a.alloc(1, 0x01), connection);

            t.ok(decodeStub.calledOnce, 'decode attempted once');
            t.ok(connection.end.calledOnce, 'should end connection');
            t.ok(connection.protocolSession.setV1AsPreferredProtocol.notCalled, 'should not set preferred protocol');
        });

        test('type is 0', async (t) => {
            const decodeStub = sinon.stub().returns({ type: 0 });
            const { router } = await buildRouter({ decodeStub });
            const connection = makeConnection();

            await router.route(b4a.alloc(1, 0x01), connection);

            t.ok(decodeStub.calledOnce, 'decode attempted once');
            t.ok(connection.end.calledOnce, 'should end connection');
            t.ok(connection.protocolSession.setV1AsPreferredProtocol.notCalled, 'should not set preferred protocol');
        });

        test('negative type', async (t) => {
            const decodeStub = sinon.stub().returns({ type: -1 });
            const { router } = await buildRouter({ decodeStub });
            const connection = makeConnection();

            await router.route(b4a.alloc(1, 0x01), connection);

            t.ok(decodeStub.calledOnce, 'decode attempted once');
            t.ok(connection.end.calledOnce, 'should end connection');
            t.ok(connection.protocolSession.setV1AsPreferredProtocol.notCalled, 'should not set preferred protocol');
        });
    });

    test('unsupported type disconnects after setting preferred protocol', async (t) => {
        const decodeStub = sinon.stub().returns({ type: getUnsupportedType() });
        const { router, livenessInstances, broadcastInstances } = await buildRouter({ decodeStub });
        const connection = makeConnection();

        await router.route(b4a.alloc(1, 0x01), connection);

        t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
        t.ok(connection.end.calledOnce, 'should end connection');
        t.is(livenessInstances.length, 1, 'liveness handler constructed');
        t.is(broadcastInstances.length, 1, 'broadcast handler constructed');
        t.ok(livenessInstances[0].handleRequest.notCalled, 'liveness request not called');
        t.ok(livenessInstances[0].handleResponse.notCalled, 'liveness response not called');
        t.ok(broadcastInstances[0].handleRequest.notCalled, 'broadcast request not called');
        t.ok(broadcastInstances[0].handleResponse.notCalled, 'broadcast response not called');
    });

    test('routes supported operation types', async (t) => {
        test('LIVENESS_REQUEST -> liveness.handleRequest', async (t) => {
            const decoded = { type: NetworkOperationType.LIVENESS_REQUEST, id: 1 };
            const decodeStub = sinon.stub().returns(decoded);
            const { router, livenessInstances, broadcastInstances } = await buildRouter({ decodeStub });
            const connection = makeConnection();

            await router.route(b4a.alloc(1, 0x01), connection);

            t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
            t.ok(connection.end.notCalled, 'should not end connection');
            t.ok(livenessInstances[0].handleRequest.calledOnce, 'liveness request called');
            t.is(livenessInstances[0].handleRequest.firstCall.args[0], decoded, 'passes decoded message');
            t.is(livenessInstances[0].handleRequest.firstCall.args[1], connection, 'passes connection');
            t.ok(livenessInstances[0].handleResponse.notCalled);
            t.ok(broadcastInstances[0].handleRequest.notCalled);
            t.ok(broadcastInstances[0].handleResponse.notCalled);
        });

        test('LIVENESS_RESPONSE -> liveness.handleResponse', async (t) => {
            const decoded = { type: NetworkOperationType.LIVENESS_RESPONSE, id: 2 };
            const decodeStub = sinon.stub().returns(decoded);
            const { router, livenessInstances, broadcastInstances } = await buildRouter({ decodeStub });
            const connection = makeConnection();

            await router.route(b4a.alloc(1, 0x01), connection);

            t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
            t.ok(connection.end.notCalled, 'should not end connection');
            t.ok(livenessInstances[0].handleResponse.calledOnce, 'liveness response called');
            t.is(livenessInstances[0].handleResponse.firstCall.args[0], decoded, 'passes decoded message');
            t.is(livenessInstances[0].handleResponse.firstCall.args[1], connection, 'passes connection');
            t.ok(livenessInstances[0].handleRequest.notCalled);
            t.ok(broadcastInstances[0].handleRequest.notCalled);
            t.ok(broadcastInstances[0].handleResponse.notCalled);
        });

        test('BROADCAST_TRANSACTION_REQUEST -> broadcast.handleRequest', async (t) => {
            const decoded = { type: NetworkOperationType.BROADCAST_TRANSACTION_REQUEST, id: 3 };
            const decodeStub = sinon.stub().returns(decoded);
            const { router, livenessInstances, broadcastInstances } = await buildRouter({ decodeStub });
            const connection = makeConnection();

            await router.route(b4a.alloc(1, 0x01), connection);

            t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
            t.ok(connection.end.notCalled, 'should not end connection');
            t.ok(broadcastInstances[0].handleRequest.calledOnce, 'broadcast request called');
            t.is(broadcastInstances[0].handleRequest.firstCall.args[0], decoded, 'passes decoded message');
            t.is(broadcastInstances[0].handleRequest.firstCall.args[1], connection, 'passes connection');
            t.ok(broadcastInstances[0].handleResponse.notCalled);
            t.ok(livenessInstances[0].handleRequest.notCalled);
            t.ok(livenessInstances[0].handleResponse.notCalled);
        });

        test('BROADCAST_TRANSACTION_RESPONSE -> broadcast.handleResponse', async (t) => {
            const decoded = { type: NetworkOperationType.BROADCAST_TRANSACTION_RESPONSE, id: 4 };
            const decodeStub = sinon.stub().returns(decoded);
            const { router, livenessInstances, broadcastInstances } = await buildRouter({ decodeStub });
            const connection = makeConnection();

            await router.route(b4a.alloc(1, 0x01), connection);

            t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
            t.ok(connection.end.notCalled, 'should not end connection');
            t.ok(broadcastInstances[0].handleResponse.calledOnce, 'broadcast response called');
            t.is(broadcastInstances[0].handleResponse.firstCall.args[0], decoded, 'passes decoded message');
            t.is(broadcastInstances[0].handleResponse.firstCall.args[1], connection, 'passes connection');
            t.ok(broadcastInstances[0].handleRequest.notCalled);
            t.ok(livenessInstances[0].handleRequest.notCalled);
            t.ok(livenessInstances[0].handleResponse.notCalled);
        });
    });

    test('handler errors disconnect', async (t) => {
        const decodeStub = sinon.stub().returns({ type: NetworkOperationType.LIVENESS_REQUEST, id: 5 });
        const { router, livenessInstances } = await buildRouter({ decodeStub });
        const connection = makeConnection();

        livenessInstances[0].handleRequest = sinon.stub().throws(new Error('handler-fail'));

        await router.route(b4a.alloc(1, 0x01), connection);

        t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
        t.ok(livenessInstances[0].handleRequest.calledOnce, 'handler called');
        t.ok(connection.end.calledOnce, 'should end connection');
    });

    test('broadcast handler errors disconnect', async (t) => {
        test('broadcast request handler throws', async (t) => {
            const decodeStub = sinon.stub().returns({
                type: NetworkOperationType.BROADCAST_TRANSACTION_REQUEST,
                id: 6
            });
            const { router, broadcastInstances } = await buildRouter({ decodeStub });
            const connection = makeConnection();

            broadcastInstances[0].handleRequest = sinon.stub().throws(new Error('broadcast-request-fail'));

            await router.route(b4a.alloc(1, 0x01), connection);

            t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
            t.ok(broadcastInstances[0].handleRequest.calledOnce, 'broadcast request handler called');
            t.ok(connection.end.calledOnce, 'should end connection');
        });

        test('broadcast response handler throws', async (t) => {
            const decodeStub = sinon.stub().returns({
                type: NetworkOperationType.BROADCAST_TRANSACTION_RESPONSE,
                id: 7
            });
            const { router, broadcastInstances } = await buildRouter({ decodeStub });
            const connection = makeConnection();

            broadcastInstances[0].handleResponse = sinon.stub().throws(new Error('broadcast-response-fail'));

            await router.route(b4a.alloc(1, 0x01), connection);

            t.ok(connection.protocolSession.setV1AsPreferredProtocol.calledOnce, 'should set preferred protocol');
            t.ok(broadcastInstances[0].handleResponse.calledOnce, 'broadcast response handler called');
            t.ok(connection.end.calledOnce, 'should end connection');
        });
    });
});
