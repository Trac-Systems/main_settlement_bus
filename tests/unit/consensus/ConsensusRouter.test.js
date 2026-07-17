import test from 'brittle';
import b4a from 'b4a';

import ConsensusRouterV1 from '../../../src/core/consensus/protocols/ConsensusRouter.js';
import ConsensusEpochProofProposalOperationHandler from '../../../src/core/consensus/v1/handlers/ConsesusEpochProofProposalOperationHandler.js';
import { encodeConsensusMessage } from '../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import consensusV1Generated from '../../../src/codecs/consensus/v1/consensusV1.generated.cjs';
import {
    ConsensusOperationType,
    ConsensusResultCode,
    CONSENSUS_MESSAGE_MAX_BYTE_SIZE
} from '../../../src/utils/constants.js';
import { config } from '../../helpers/config.js';
import { testKeyPair1, testKeyPair2 } from '../../fixtures/apply.fixtures.js';
import consensusV1OperationFixtures from '../../fixtures/consensusV1Operation.fixtures.js';

const { ConsensusMessageHeader } = consensusV1Generated.consensus.v1;
const originalHandleRequest = ConsensusEpochProofProposalOperationHandler.prototype.handleRequest;
const originalHandleApproval = ConsensusEpochProofProposalOperationHandler.prototype.handleApproval;

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
            indexer: { sendAndForget() {} }
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
        handleRequest: [],
        handleApproval: []
    };
    const errors = [];
    const originalConsoleError = console.error;

    ConsensusEpochProofProposalOperationHandler.prototype.handleRequest = async (...args) => {
        calls.handleRequest.push(args);
        if (handleRequestError) throw handleRequestError;
        return handleRequestResult;
    };
    ConsensusEpochProofProposalOperationHandler.prototype.handleApproval = async (...args) => {
        calls.handleApproval.push(args);
        if (handleApprovalError) throw handleApprovalError;
        return handleApprovalResult;
    };
    console.error = message => errors.push(message);

    t.teardown(() => {
        ConsensusEpochProofProposalOperationHandler.prototype.handleRequest = originalHandleRequest;
        ConsensusEpochProofProposalOperationHandler.prototype.handleApproval = originalHandleApproval;
        console.error = originalConsoleError;
    });

    const pendingRequestService = {
        getPendingRequest(id) {
            calls.getPendingRequest.push(id);
            return pendingEntry;
        },
        resolvePendingRequest(id, resultCode) {
            calls.resolvePendingRequest.push([id, resultCode]);
            return true;
        }
    };

    return {
        router: new ConsensusRouterV1({}, {}, config, pendingRequestService),
        calls,
        errors
    };
}

test('ConsensusRouter routes proof proposal requests to the request handler', async t => {
    const sessionId = 'proposal-route';
    const { router, calls } = setupRouter(t);
    const connection = createConnection();

    await router.route(buildProofProposalMessage(sessionId), connection);

    t.is(calls.handleRequest.length, 1);
    t.is(calls.handleRequest[0][0].session_id, sessionId);
    t.is(calls.handleRequest[0][1], connection);
    t.is(calls.handleRequest[0][2], connection.protocolSessions.indexer);
    t.is(calls.handleApproval.length, 0);
    t.is(calls.getPendingRequest.length, 0);
    t.is(calls.resolvePendingRequest.length, 0);
    t.absent(connection.ended);
});

test('ConsensusRouter resolves proof proposal approval through pending request entry', async t => {
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

    await router.route(buildApprovalMessage(sessionId), connection);

    t.alike(calls.getPendingRequest, [sessionId]);
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

test('ConsensusRouter allows proof proposal approval when pending entry has no expected peer', async t => {
    const sessionId = 'approval-without-expected-peer';
    const pendingEntry = {
        proofProposal: consensusV1OperationFixtures.proofProposal
    };
    const { router, calls } = setupRouter(t, { pendingEntry });
    const connection = createConnection(testKeyPair2.publicKey);

    await router.route(buildApprovalMessage(sessionId), connection);

    t.is(calls.handleApproval.length, 1);
    t.alike(calls.resolvePendingRequest, [[sessionId, { resultCode: ConsensusResultCode.OK }]]);
    t.absent(connection.ended);
});

test('ConsensusRouter disconnects proof proposal approval without pending request', async t => {
    const sessionId = 'approval-without-pending';
    const { router, calls, errors } = setupRouter(t);
    const connection = createConnection(testKeyPair1.publicKey);

    await router.route(buildApprovalMessage(sessionId), connection);

    t.alike(calls.getPendingRequest, [sessionId]);
    t.is(calls.handleApproval.length, 0);
    t.is(calls.resolvePendingRequest.length, 0);
    t.ok(connection.ended);
    t.is(connection.endCalls, 1);
    t.ok(errors[0].includes('Approval received without matching pending request'));
});

test('ConsensusRouter disconnects proof proposal approval from unexpected peer', async t => {
    const sessionId = 'approval-unexpected-peer';
    const pendingEntry = {
        requestedTo: testKeyPair2.publicKey,
        proofProposal: consensusV1OperationFixtures.proofProposal
    };
    const { router, calls, errors } = setupRouter(t, { pendingEntry });
    const connection = createConnection(testKeyPair1.publicKey);

    await router.route(buildApprovalMessage(sessionId), connection);

    t.alike(calls.getPendingRequest, [sessionId]);
    t.is(calls.handleApproval.length, 0);
    t.is(calls.resolvePendingRequest.length, 0);
    t.ok(connection.ended);
    t.is(connection.endCalls, 1);
    t.ok(errors[0].includes('Approval received from unexpected peer'));
});

test('ConsensusRouter disconnects and keeps pending request unresolved when approval handler throws', async t => {
    const sessionId = 'approval-handler-error';
    const pendingEntry = {
        requestedTo: testKeyPair1.publicKey,
        proofProposal: consensusV1OperationFixtures.proofProposal
    };
    const { router, calls, errors } = setupRouter(t, {
        pendingEntry,
        handleApprovalError: new Error('approval failed')
    });
    const connection = createConnection(testKeyPair1.publicKey);

    await router.route(buildApprovalMessage(sessionId), connection);

    t.alike(calls.getPendingRequest, [sessionId]);
    t.is(calls.handleApproval.length, 1);
    t.is(calls.resolvePendingRequest.length, 0);
    t.ok(connection.ended);
    t.ok(errors[0].includes('Unhandled error while routing V1 message: approval failed'));
});

test('ConsensusRouter disconnects when request handler throws', async t => {
    const { router, calls, errors } = setupRouter(t, {
        handleRequestError: new Error('request failed')
    });
    const connection = createConnection();

    await router.route(buildProofProposalMessage('proposal-handler-error'), connection);

    t.is(calls.handleRequest.length, 1);
    t.is(calls.resolvePendingRequest.length, 0);
    t.ok(connection.ended);
    t.ok(errors[0].includes('Unhandled error while routing V1 message: request failed'));
});

test('ConsensusRouter disconnects invalid and undecodable messages before handlers run', async t => {
    const invalidCases = [
        {
            name: 'null message',
            message: null,
            reason: 'Pre-validation failed'
        },
        {
            name: 'non-buffer message',
            message: 'not-a-buffer',
            reason: 'Pre-validation failed'
        },
        {
            name: 'empty message',
            message: b4a.alloc(0),
            reason: 'Pre-validation failed'
        },
        {
            name: 'oversized message',
            message: b4a.alloc(CONSENSUS_MESSAGE_MAX_BYTE_SIZE + 1, 1),
            reason: 'Pre-validation failed'
        },
        {
            name: 'malformed protobuf',
            message: b4a.from([0xff]),
            reason: 'Failed to decode incoming Consensus message'
        },
        {
            name: 'missing type',
            message: encodeConsensusMessage({ session_id: 'missing-type', timestamp: 1 }),
            reason: 'Invalid V1 message type'
        },
        {
            name: 'unspecified type',
            message: encodeConsensusMessage({
                type: ConsensusOperationType.UNSPECIFIED,
                session_id: 'unspecified-type',
                timestamp: 1
            }),
            reason: 'Invalid V1 message type'
        }
    ];

    for (const { name, message, reason } of invalidCases) {
        const { router, calls, errors } = setupRouter(t);
        const connection = createConnection();

        await router.route(message, connection);

        t.ok(connection.ended, `${name}: disconnects`);
        t.is(calls.handleRequest.length, 0, `${name}: request handler not called`);
        t.is(calls.handleApproval.length, 0, `${name}: approval handler not called`);
        t.is(calls.getPendingRequest.length, 0, `${name}: pending request not read`);
        t.is(calls.resolvePendingRequest.length, 0, `${name}: pending request not resolved`);
        t.ok(errors[0].includes(reason), `${name}: logs reason`);
    }
});

test('ConsensusRouter disconnects unsupported consensus message types', async t => {
    const { router, calls, errors } = setupRouter(t);
    const connection = createConnection();

    await router.route(buildUnsupportedMessage(), connection);

    t.ok(connection.ended);
    t.is(calls.handleRequest.length, 0);
    t.is(calls.handleApproval.length, 0);
    t.is(calls.resolvePendingRequest.length, 0);
    t.ok(errors[0].includes('Unsupported V1 message type'));
});
