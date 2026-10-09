import test from 'brittle';
import b4a from 'b4a';
import EventEmitter from 'bare-events';

import ConsensusV1MessageRouter from '../../../../../../src/core/network/protocols/consensus/v1/ConsensusV1MessageRouter.js';
import ConsensusV1ConnectionPolicy from '../../../../../../src/core/network/protocols/consensus/v1/ConsensusV1ConnectionPolicy.js';
import { Logger } from '../../../../../../src/utils/logger.js';
import V1EpochProofProposalOperationHandler from '../../../../../../src/core/network/protocols/consensus/v1/handlers/V1EpochProofProposalOperationHandler.js';
import { encodeConsensusMessage } from '../../../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import consensusV1Generated from '../../../../../../src/codecs/consensus/v1/consensusV1.generated.cjs';
import {
    ConsensusOperationType,
    ConsensusResultCode,
    CONSENSUS_MESSAGE_MAX_BYTE_SIZE
} from '../../../../../../src/utils/constants.js';
import { config } from '../../../../../helpers/config.js';
import { testKeyPair1, testKeyPair2 } from '../../../../../fixtures/apply.fixtures.js';
import consensusV1OperationFixtures from '../../../../../fixtures/consensusV1Operation.fixtures.js';

const { ConsensusMessageHeader } = consensusV1Generated.consensus.v1;
const originalHandleRequest = V1EpochProofProposalOperationHandler.prototype.handleRequest;
const originalHandleApproval = V1EpochProofProposalOperationHandler.prototype.handleApproval;

function buildProofProposalMessage(sessionId = 'proposal-session') {
    return encodeConsensusMessage({
        ...consensusV1OperationFixtures.proofProposalHeader,
        session_id: sessionId
    });
}

function buildApprovalMessage(sessionId = 'approval-session') {
    return encodeConsensusMessage({
        ...consensusV1OperationFixtures.proofProposalResponseHeader,
        session_id: sessionId
    });
}

function buildUnsupportedMessage(sessionId = 'unsupported-session') {
    return b4a.from(ConsensusMessageHeader.encode({
        type: Math.max(...Object.values(ConsensusOperationType)) + 1,
        session_id: sessionId,
        timestamp: 1
    }).finish());
}

function createConnection(publicKeyHex = testKeyPair1.publicKey) {
    return {
        remotePublicKey: b4a.from(publicKeyHex, 'hex'),
        protocolSessions: {
            indexer: {
                closed: false,
                closeCalls: 0,
                sendAndForget() {},
                close() {
                    this.closed = true;
                    this.closeCalls += 1;
                }
            }
        },
        ended: false,
        endCalls: 0,
        end() {
            this.ended = true;
            this.endCalls += 1;
        }
    };
}

function setupRouter(
    t,
    {
        pendingEntry = null,
        handleRequestResult,
        handleApprovalResult = { resultCode: ConsensusResultCode.OK },
        handleRequestError = null,
        handleApprovalError = null
    } = {}
) {
    const calls = {
        getPendingRequest: [],
        resolvePendingRequest: [],
        rejectPendingRequest: [],
        handleRequest: [],
        handleApproval: []
    };
    const errors = [];
    const originalConsoleError = console.error;

    V1EpochProofProposalOperationHandler.prototype.handleRequest = async (...args) => {
        calls.handleRequest.push(args);
        if (handleRequestError) throw handleRequestError;
        return handleRequestResult;
    };
    V1EpochProofProposalOperationHandler.prototype.handleApproval = async (...args) => {
        calls.handleApproval.push(args);
        if (handleApprovalError) throw handleApprovalError;
        return handleApprovalResult;
    };
    console.error = message => errors.push(message);

    t.teardown(() => {
        V1EpochProofProposalOperationHandler.prototype.handleRequest = originalHandleRequest;
        V1EpochProofProposalOperationHandler.prototype.handleApproval = originalHandleApproval;
        console.error = originalConsoleError;
    });

    const pendingRequestService = {
        getPendingRequest(id) {
            calls.getPendingRequest.push(id);
            return pendingEntry;
        },
        resolvePendingRequest(id, resultCode) {
            calls.resolvePendingRequest.push([id, resultCode]);
            pendingEntry = null;
            return true;
        },
        rejectPendingRequest(id, error) {
            calls.rejectPendingRequest.push([id, error]);
            pendingEntry = null;
            return true;
        }
    };

    const state = new EventEmitter();
    const connectionPolicy = new ConsensusV1ConnectionPolicy(state, new Logger(config));
    return {
        router: new ConsensusV1MessageRouter(state, {}, config, pendingRequestService, connectionPolicy),
        setPendingEntry(entry) { pendingEntry = entry; },
        calls,
        errors
    };
}

test('ConsensusV1MessageRouter routes proof proposal requests to the request handler', async t => {
    const sessionId = 'proposal-route';
    const { router, calls } = setupRouter(t);
    const connection = createConnection();

    await router.route(buildProofProposalMessage(sessionId), connection, connection.protocolSessions.indexer);

    t.is(calls.handleRequest.length, 1);
    t.is(calls.handleRequest[0][0].session_id, sessionId);
    t.is(calls.handleRequest[0][1], connection);
    t.is(calls.handleRequest[0][2], connection.protocolSessions.indexer);
    t.is(calls.handleApproval.length, 0);
    t.is(calls.getPendingRequest.length, 0);
    t.is(calls.resolvePendingRequest.length, 0);
    t.absent(connection.ended);
});

test('ConsensusV1MessageRouter resolves proof proposal approval through pending request entry', async t => {
    const sessionId = 'approval-success';
    const proofProposal = consensusV1OperationFixtures.proofProposal;
    const resultCode = ConsensusResultCode.INVALID_PAYLOAD;
    const pendingEntry = {
        requestedTo: testKeyPair1.publicKey,
        proofProposal
    };
    const { router, calls } = setupRouter(t, {
        pendingEntry,
        handleApprovalResult: { resultCode }
    });
    const connection = createConnection(testKeyPair1.publicKey);

    await router.route(buildApprovalMessage(sessionId), connection, connection.protocolSessions.indexer);

    t.alike(calls.getPendingRequest, [sessionId, sessionId]);
    t.is(calls.handleApproval.length, 1);
    t.is(calls.handleApproval[0][0].session_id, sessionId);
    t.is(calls.handleApproval[0][1], connection);
    t.is(calls.handleApproval[0][2], connection.protocolSessions.indexer);
    t.is(calls.handleApproval[0][3], proofProposal);
    // resolvePendingRequest receives the whole handleApproval result, not just the code -
    // EpochProofProposalOperations.sendToIndexer relies on response.approval.approval_sig.
    t.alike(calls.resolvePendingRequest, [[sessionId, { resultCode }]]);
    t.absent(connection.ended);
});

test('ConsensusV1MessageRouter allows proof proposal approval when pending entry has no expected peer', async t => {
    const sessionId = 'approval-without-expected-peer';
    const pendingEntry = {
        proofProposal: consensusV1OperationFixtures.proofProposal
    };
    const { router, calls } = setupRouter(t, { pendingEntry });
    const connection = createConnection(testKeyPair2.publicKey);

    await router.route(buildApprovalMessage(sessionId), connection, connection.protocolSessions.indexer);

    t.is(calls.handleApproval.length, 1);
    t.alike(calls.resolvePendingRequest, [[sessionId, { resultCode: ConsensusResultCode.OK }]]);
    t.absent(connection.ended);
});

test('ConsensusV1MessageRouter ignores proof proposal approval without pending request', async t => {
    const sessionId = 'approval-without-pending';
    const { router, calls, errors } = setupRouter(t);
    const connection = createConnection(testKeyPair1.publicKey);

    await router.route(buildApprovalMessage(sessionId), connection, connection.protocolSessions.indexer);

    t.alike(calls.getPendingRequest, [sessionId]);
    t.is(calls.handleApproval.length, 0);
    t.is(calls.resolvePendingRequest.length, 0);
    t.absent(connection.ended);
    t.absent(connection.protocolSessions.indexer.closed);
    t.is(calls.rejectPendingRequest.length, 0);
    t.is(errors.length, 0);
});

test('ConsensusV1MessageRouter closes only consensus for an approval from an unexpected peer', async t => {
    const sessionId = 'approval-unexpected-peer';
    const pendingEntry = {
        requestedTo: testKeyPair2.publicKey,
        proofProposal: consensusV1OperationFixtures.proofProposal
    };
    const { router, calls, errors } = setupRouter(t, { pendingEntry });
    const connection = createConnection(testKeyPair1.publicKey);

    await router.route(buildApprovalMessage(sessionId), connection, connection.protocolSessions.indexer);

    t.alike(calls.getPendingRequest, [sessionId]);
    t.is(calls.handleApproval.length, 0);
    t.is(calls.resolvePendingRequest.length, 0);
    t.absent(connection.ended);
    t.is(connection.protocolSessions.indexer.closeCalls, 1);
    t.is(calls.rejectPendingRequest.length, 0, 'request belonging to another peer is preserved');
    t.ok(errors[0].includes('Consensus V1 message: approval received from unexpected peer'));
});

test('ConsensusV1MessageRouter rejects the pending request without closing anything when approval handler throws', async t => {
    const sessionId = 'approval-handler-error';
    const pendingEntry = {
        requestedTo: testKeyPair1.publicKey,
        proofProposal: consensusV1OperationFixtures.proofProposal
    };
    const error = new Error('approval failed');
    const { router, calls, errors } = setupRouter(t, {
        pendingEntry,
        handleApprovalError: error
    });
    const connection = createConnection(testKeyPair1.publicKey);

    await router.route(buildApprovalMessage(sessionId), connection, connection.protocolSessions.indexer);

    t.alike(calls.getPendingRequest, [sessionId, sessionId]);
    t.is(calls.handleApproval.length, 1);
    t.is(calls.resolvePendingRequest.length, 0);
    t.alike(calls.rejectPendingRequest, [[sessionId, error]]);
    t.absent(connection.ended);
    t.absent(connection.protocolSessions.indexer.closed);
    t.ok(errors[0].includes('Unhandled error while routing Consensus V1 message: approval failed'));
});

test('ConsensusV1MessageRouter logs request handler errors without closing anything', async t => {
    const { router, calls, errors } = setupRouter(t, {
        handleRequestError: new Error('request failed')
    });
    const connection = createConnection();

    await router.route(buildProofProposalMessage('proposal-handler-error'), connection, connection.protocolSessions.indexer);

    t.is(calls.handleRequest.length, 1);
    t.is(calls.resolvePendingRequest.length, 0);
    t.absent(connection.ended);
    t.absent(connection.protocolSessions.indexer.closed);
    t.is(calls.rejectPendingRequest.length, 0);
    t.ok(errors[0].includes('Unhandled error while routing Consensus V1 message: request failed'));
});

test('ConsensusV1MessageRouter closes only consensus for invalid and undecodable messages', async t => {
    const invalidCases = [
        {
            name: 'null message',
            message: null,
            reason: 'Pre-validation failed for incoming Consensus V1 message'
        },
        {
            name: 'non-buffer message',
            message: 'not-a-buffer',
            reason: 'Pre-validation failed for incoming Consensus V1 message'
        },
        {
            name: 'empty message',
            message: b4a.alloc(0),
            reason: 'Pre-validation failed for incoming Consensus V1 message'
        },
        {
            name: 'oversized message',
            message: b4a.alloc(CONSENSUS_MESSAGE_MAX_BYTE_SIZE + 1, 1),
            reason: 'Pre-validation failed for incoming Consensus V1 message'
        },
        {
            name: 'malformed protobuf',
            message: b4a.from([0xff]),
            reason: 'Failed to decode incoming Consensus V1 message'
        },
        {
            name: 'missing type',
            message: encodeConsensusMessage({ session_id: 'missing-type', timestamp: 1 }),
            reason: 'Invalid Consensus V1 message type'
        },
        {
            name: 'unspecified type',
            message: encodeConsensusMessage({
                type: ConsensusOperationType.UNSPECIFIED,
                session_id: 'unspecified-type',
                timestamp: 1
            }),
            reason: 'Invalid Consensus V1 message type'
        }
    ];

    for (const { name, message, reason } of invalidCases) {
        const { router, calls, errors } = setupRouter(t);
        const connection = createConnection();

        await router.route(message, connection, connection.protocolSessions.indexer);

        t.absent(connection.ended, `${name}: transport remains open`);
        t.is(connection.protocolSessions.indexer.closeCalls, 1, `${name}: closes consensus channel`);
        t.is(calls.handleRequest.length, 0, `${name}: request handler not called`);
        t.is(calls.handleApproval.length, 0, `${name}: approval handler not called`);
        t.is(calls.getPendingRequest.length, 0, `${name}: pending request not read`);
        t.is(calls.resolvePendingRequest.length, 0, `${name}: pending request not resolved`);
        t.ok(errors[0].includes(reason), `${name}: logs reason`);
    }
});

test('ConsensusV1MessageRouter closes only consensus for unsupported message types', async t => {
    const { router, calls, errors } = setupRouter(t);
    const connection = createConnection();

    await router.route(buildUnsupportedMessage(), connection, connection.protocolSessions.indexer);

    t.absent(connection.ended);
    t.is(connection.protocolSessions.indexer.closeCalls, 1);
    t.is(calls.handleRequest.length, 0);
    t.is(calls.handleApproval.length, 0);
    t.is(calls.resolvePendingRequest.length, 0);
    t.ok(errors[0].includes('Unsupported Consensus V1 message type'));
});

test('ConsensusV1MessageRouter closes the receiving session even if its connection now references a newer session', async t => {
    const { router } = setupRouter(t);
    const connection = createConnection();
    const receivingSession = connection.protocolSessions.indexer;
    const replacement = createConnection().protocolSessions.indexer;
    connection.protocolSessions.indexer = replacement;

    await router.route(b4a.from([0xff]), connection, receivingSession);

    t.ok(receivingSession.closed);
    t.absent(replacement.closed);
    t.absent(connection.ended);
});

test('ConsensusV1MessageRouter ignores messages from a closed session', async t => {
    const { router, calls, errors } = setupRouter(t);
    const connection = createConnection();
    const closedSession = connection.protocolSessions.indexer;
    closedSession.close();
    connection.protocolSessions.indexer = createConnection().protocolSessions.indexer;

    await router.route(buildProofProposalMessage(), connection, closedSession);

    t.is(calls.handleRequest.length, 0);
    t.is(errors.length, 0);
    t.absent(connection.protocolSessions.indexer.closed);
    t.absent(connection.ended);
});

test('ConsensusV1MessageRouter ignores an approval for a different session of the same peer', async t => {
    const connection = createConnection();
    const { router, calls } = setupRouter(t, {
        pendingEntry: {
            requestedTo: testKeyPair1.publicKey,
            session: createConnection().protocolSessions.indexer,
            proofProposal: consensusV1OperationFixtures.proofProposal
        }
    });

    await router.route(buildApprovalMessage(), connection, connection.protocolSessions.indexer);

    t.is(calls.handleApproval.length, 0);
    t.is(calls.resolvePendingRequest.length, 0);
    t.is(calls.rejectPendingRequest.length, 0);
    t.absent(connection.protocolSessions.indexer.closed);
    t.absent(connection.ended);
});

for (const outcome of ['success', 'failure']) {
    test(`ConsensusV1MessageRouter ignores a stale validation ${outcome} after the request was replaced`, async t => {
        const connection = createConnection();
        const pendingEntry = {
            requestedTo: testKeyPair1.publicKey,
            session: connection.protocolSessions.indexer,
            proofProposal: consensusV1OperationFixtures.proofProposal
        };
        let finishValidation;
        const validation = new Promise((resolve, reject) => {
            finishValidation = outcome === 'success' ? resolve : reject;
        });
        const { router, calls, setPendingEntry } = setupRouter(t, {
            pendingEntry,
            handleApprovalResult: validation
        });
        const routing = router.route(buildApprovalMessage(), connection, connection.protocolSessions.indexer);
        t.is(calls.handleApproval.length, 1, 'validation is in flight');

        setPendingEntry({ ...pendingEntry });
        finishValidation(outcome === 'success' ? { resultCode: ConsensusResultCode.OK } : new Error('late failure'));
        await routing;

        t.is(calls.resolvePendingRequest.length, 0, 'replacement request is not resolved');
        t.is(calls.rejectPendingRequest.length, 0, 'replacement request is not rejected');
        t.absent(connection.protocolSessions.indexer.closed);
        t.absent(connection.ended);
    });
}
