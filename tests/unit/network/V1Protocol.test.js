import { test } from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import Protomux from 'protomux';
import V1Protocol from '../../../src/core/network/protocols/V1Protocol.js';
import PendingRequestService from '../../../src/core/network/services/PendingRequestService.js';
import { ResultCode } from '../../../src/utils/constants.js';
import { config } from '../../helpers/config.js';
import { testKeyPair1 } from '../../fixtures/apply.fixtures.js';
import fixtures from '../../fixtures/networkV1.fixtures.js';

function mockProtomux(t) {
    const sessions = new Map();
    const from = sinon.stub(Protomux, 'from').callsFake(connection => {
        const session = { send: sinon.stub() };
        sessions.set(connection, session);
        const channel = {
            open: sinon.stub(),
            close: sinon.stub(),
            addMessage: sinon.stub().returns(session),
        };
        return { createChannel: sinon.stub().returns(channel) };
    });
    t.teardown(() => from.restore());
    return sessions;
}

test('V1Protocol owns requests by the exact sending socket without adding wire fields', async t => {
    const sessions = mockProtomux(t);
    const service = new PendingRequestService(config);
    t.teardown(() => service.close());
    const oldConnection = { remotePublicKey: b4a.from(testKeyPair1.publicKey, 'hex') };
    const replacementConnection = { remotePublicKey: b4a.from(testKeyPair1.publicKey, 'hex') };
    const router = { route: sinon.stub().resolves() };
    const oldProtocol = new V1Protocol(router, oldConnection, service, config);
    const replacementProtocol = new V1Protocol(router, replacementConnection, service, config);
    const oldRequest = fixtures.payloadLivenessRequest;
    const replacementRequest = fixtures.payloadBroadcastTransactionRequest;
    const oldReply = oldProtocol.send(oldRequest);
    const replacementReply = replacementProtocol.send(replacementRequest);
    const settled = Promise.allSettled([oldReply, replacementReply]);

    t.is(service.getPendingRequest(oldRequest.id).connection, oldConnection);
    t.is(service.getPendingRequest(replacementRequest.id).connection, replacementConnection);
    t.alike(oldProtocol.decode(sessions.get(oldConnection).send.firstCall.args[0]), oldRequest);
    t.alike(replacementProtocol.decode(sessions.get(replacementConnection).send.firstCall.args[0]), replacementRequest);

    const failure = new Error('old connection closed');
    t.is(service.rejectPendingRequestsForConnection(oldConnection, failure), 1);
    t.ok(service.has(replacementRequest.id), 'replacement socket still owns its pending request');
    service.resolvePendingRequest(replacementRequest.id, ResultCode.OK);
    const results = await settled;
    t.is(results[0].status, 'rejected');
    t.is(results[0].reason, failure);
    t.is(results[1].status, 'fulfilled');
    t.is(results[1].value, ResultCode.OK);
});

test('V1Protocol registers the socket owner before sending and preserves synchronous send errors', async t => {
    const sessions = mockProtomux(t);
    const service = new PendingRequestService(config);
    t.teardown(() => service.close());
    const connection = { remotePublicKey: b4a.from(testKeyPair1.publicKey, 'hex') };
    const protocol = new V1Protocol({ route: sinon.stub().resolves() }, connection, service, config);
    const request = fixtures.payloadLivenessRequest;
    const failure = new Error('socket send failed');
    let ownerAtSend;
    sessions.get(connection).send.callsFake(() => {
        ownerAtSend = service.getPendingRequest(request.id).connection;
        throw failure;
    });
    const result = await protocol.send(request).then(() => null, error => error);
    t.is(ownerAtSend, connection);
    t.is(result, failure);
    t.is(service.has(request.id), false, 'send failure clears the pending request');
    t.is(service.rejectPendingRequestsForConnection(connection, failure), 0);
});
