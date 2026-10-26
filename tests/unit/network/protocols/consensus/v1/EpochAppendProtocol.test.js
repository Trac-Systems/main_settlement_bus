import test from 'brittle';
import b4a from 'b4a';
import { WalletProvider } from 'trac-wallet';
import { config } from '../../../../../helpers/config.js';
import { testKeyPair1, testKeyPair2 } from '../../../../../fixtures/apply.fixtures.js';
import { consensusMessageFactory } from '../../../../../../src/messages/consensus/v1/consensusMessageFactory.js';
import { encodeConsensusMessage, decodeConsensusMessage } from '../../../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import V1EpochAppendRequest from '../../../../../../src/core/network/protocols/consensus/v1/validators/V1EpochAppendRequest.js';
import V1EpochAppendReply from '../../../../../../src/core/network/protocols/consensus/v1/validators/V1EpochAppendReply.js';
import ConsensusValidationSchema from '../../../../../../src/core/network/protocols/consensus/v1/validators/ConsensusValidationSchema.js';
import ConsensusV1MessageRouter from '../../../../../../src/core/network/protocols/consensus/v1/ConsensusV1MessageRouter.js';
import ConsensusV1ConnectionPolicy from '../../../../../../src/core/network/protocols/consensus/v1/ConsensusV1ConnectionPolicy.js';
import IndexerPendingRequestService from '../../../../../../src/core/network/protocols/consensus/v1/IndexerPendingRequestService.js';
import V1EpochAppendOperationHandler from '../../../../../../src/core/network/protocols/consensus/v1/handlers/V1EpochAppendOperationHandler.js';
import { ConsensusOperationType, ConsensusResultCode, CustomEventType, EPOCH_APPENDER_SELECTION_MAX_COUNTER, EPOCH_APPENDER_SELECTION_COUNTER_LIMIT } from '../../../../../../src/utils/constants.js';
import sinon from 'sinon';
import compatibility from '../../../../../fixtures/epochAppendCompatibility.js';
import { appendSignatureData } from '../../../../../../src/messages/consensus/v1/epochAppendMessage.js';
import { uint64ToBuffer } from '../../../../../../src/utils/buffer.js';

async function fixture(t) {
    const wallet = await new WalletProvider(config).fromSecretKey(testKeyPair1.secretKey);
    const other = await new WalletProvider(config).fromSecretKey(testKeyPair2.secretKey);
    const context = {
        networkId: config.networkId, bootstrap: '01'.repeat(32), targetEpoch: '7',
        parentHash: '02'.repeat(32), membershipContext: '03'.repeat(32), configHash: '04'.repeat(32),
        members: [
            { publicKey: testKeyPair1.publicKey, writerKey: '05'.repeat(32) },
            { publicKey: testKeyPair2.publicKey, writerKey: '06'.repeat(32) },
        ],
    };
    const request = {
        ...context, requester: testKeyPair1.publicKey, requestId: 'publication-1',
        logicalCounter: 9007199254740993n, payloadHash: '07'.repeat(32),
        selectionVersion: 2,
    };
    let reads = 0;
    const state = { getEpochAppenderSelectionContext: async () => { reads++; return context; } };
    const connection = { remotePublicKey: b4a.from(testKeyPair1.publicKey, 'hex') };
    const peer = { remotePublicKey: b4a.from(testKeyPair2.publicKey, 'hex') };
    const message = await consensusMessageFactory(wallet, config).buildRequest('rpc-1', request);
    const decision = { ...request, voteStatus: 1, observedCounter: request.logicalCounter, vote: request };
    const response = await consensusMessageFactory(other, config).buildReply('rpc-1', decision);
    const pending = new IndexerPendingRequestService(config);
    t.teardown(() => pending.close());
    return { wallet, other, context, request, decision, state, connection, peer, message, response, pending, reads: () => reads };
}

test('majority elections reject old RA requests and replies instead of counting them as votes', async t => {
    const clock = sinon.useFakeTimers({ now: compatibility.timestamp, toFake: ['Date'] });
    t.teardown(() => clock.restore());
    const f = await fixture(t);
    t.is(f.message.request.intent.selection_version, 2);
    t.is(f.response.reply.vote_status, 1);
    t.absent(b4a.toString(appendSignatureData(f.message), 'hex') === compatibility.requestSignatureData);
    t.absent(b4a.toString(appendSignatureData(f.response), 'hex') === compatibility.replySignatureData);

    const previousRequest = decodeConsensusMessage(b4a.from(compatibility.requestBytes, 'hex'));
    const previousReply = decodeConsensusMessage(b4a.from(compatibility.replyBytes, 'hex'));
    await t.exception(() => new V1EpochAppendRequest(config, f.state).validate(previousRequest, f.connection));
    await t.exception(() => new V1EpochAppendReply(config, f.state).validate(previousReply, f.peer, previousRequest));
});

test('append protocol round trips signed requests and permissions without losing logical counter precision', async t => {
    const f = await fixture(t);
    const request = await new V1EpochAppendRequest(config, f.state).validate(
        decodeConsensusMessage(encodeConsensusMessage(f.message)), f.connection,
    );
    t.is(request.logicalCounter, 9007199254740993n);
    const permission = await new V1EpochAppendReply(config, f.state).validate(
        decodeConsensusMessage(encodeConsensusMessage(f.response)), f.peer, f.message,
    );
    t.is(permission.observedCounter, request.logicalCounter);
    t.is(permission.vote.logicalCounter, request.logicalCounter);
    t.is(permission.requestId, f.request.requestId);
    t.is(permission.payloadHash, f.request.payloadHash);
});

test('append schemas reject malformed fields, oversized identifiers and mixed message bodies', async t => {
    const f = await fixture(t);
    const schema = new ConsensusValidationSchema(config);
    const fresh = () => decodeConsensusMessage(encodeConsensusMessage(f.message));
    for (const field of ['network_id', 'bootstrap', 'epoch', 'parent_hash', 'membership_context',
        'config_hash', 'payload_hash', 'logical_counter', 'requester']) {
        for (const value of [undefined, b4a.alloc(1, 1), b4a.alloc(128, 1)]) {
            const malformed = fresh();
            malformed.request.intent[field] = value;
            t.is(schema.validateEpochAppendRequest(malformed), false, field);
        }
    }
    for (const mutate of [
        message => { message.request.intent.request_id = 'x'.repeat(65); },
        message => { message.session_id = 'x'.repeat(65); },
        message => { message.timestamp = Number.MAX_SAFE_INTEGER + 1; },
        message => { message.request.extra = 1; },
        message => { message.proof_proposal = {}; },
        message => { message.request.intent.logical_counter = b4a.alloc(8); },
        message => { message.request.signature = b4a.alloc(63, 1); },
    ]) {
        const malformed = fresh();
        mutate(malformed);
        t.is(schema.validateEpochAppendRequest(malformed), false);
    }
});

test('append signatures cover RPC identity, every context field, payload and responder', async t => {
    const f = await fixture(t);
    const validator = new V1EpochAppendRequest(config, f.state);
    const permission = new V1EpochAppendReply(config, f.state);
    for (const [validation, message, peer] of [
        [validator, f.message, f.connection],
        [permission, f.response, f.peer],
    ]) {
        const tampered = { ...message, timestamp: message.timestamp + 1 };
        const failure = await validation.validate(tampered, peer, f.message).catch(error => error);
        t.is(failure?.resultCode, ConsensusResultCode.RESPONSE_SIGNATURE_INVALID,
            'both message types retain the protocol signature failure code');
        t.is(f.reads(), 0, 'signature verification precedes signed context reads');
    }
    for (const field of Object.keys(f.message.request.intent)) {
        const tampered = decodeConsensusMessage(encodeConsensusMessage(f.message));
        const value = tampered.request.intent[field];
        if (typeof value === 'string') tampered.request.intent[field] = 'different';
        else if (typeof value === 'number') tampered.request.intent[field] = value + 1;
        else value[value.length - 1] ^= 1;
        await t.exception(() => validator.validate(tampered, f.connection), `signed field ${field}`);
    }
    await t.exception(() => validator.validate({ ...f.message, session_id: 'rpc-2' }, f.connection));
    await t.exception(() => validator.validate({ ...f.message, timestamp: f.message.timestamp + 1 }, f.connection));
    await t.exception(() => validator.validate(f.message, f.peer));
    await t.exception(() => permission.validate(f.response, f.peer, { ...f.message, session_id: 'rpc-2' }));
    const different = await consensusMessageFactory(f.wallet, config).buildRequest(
        'rpc-1', { ...f.request, payloadHash: '11'.repeat(32) },
    );
    await t.exception(() => permission.validate(f.response, f.peer, different));
    f.context.targetEpoch = '8';
    await t.exception(() => validator.validate(f.message, f.connection), 'a signed old request is still stale');
});

test('append router ignores wrong peers, old sessions and replaced RPC entries without touching transport', async t => {
    const f = await fixture(t);
    const session = { closed: false };
    const policy = {
        handleLocalError() {},
        handleInvalidMessage() { t.fail('append response must not close consensus'); },
        requestPeerBan() { t.fail('ignored or valid replies must not request a ban'); },
    };
    const router = new ConsensusV1MessageRouter(f.state, f.wallet, config, f.pending, policy);
    const promise = f.pending.registerPendingRequest(testKeyPair2.publicKey, f.message, session);
    const bytes = encodeConsensusMessage(f.response);
    await router.route(bytes, f.connection, session);
    t.ok(f.pending.getPendingRequest('rpc-1'), 'wrong peer cannot complete RPC');
    await router.route(bytes, f.peer, { closed: false });
    t.ok(f.pending.getPendingRequest('rpc-1'), 'old session cannot complete RPC');
    await router.route(bytes, f.peer, session);
    t.is((await promise).requestId, f.request.requestId);
    await router.route(bytes, f.peer, session);
    t.absent(f.pending.getPendingRequest('rpc-1'), 'duplicate reply is ignored');

    let release;
    const original = V1EpochAppendOperationHandler.prototype.handleReply;
    V1EpochAppendOperationHandler.prototype.handleReply = () => new Promise(resolve => { release = resolve; });
    t.teardown(() => { V1EpochAppendOperationHandler.prototype.handleReply = original; });
    const old = f.pending.registerPendingRequest(testKeyPair2.publicKey, f.message, session).catch(() => {});
    const routing = router.route(bytes, f.peer, session);
    f.pending.rejectPendingRequest('rpc-1', new Error('cancelled'));
    await old;
    const replacement = f.pending.registerPendingRequest(testKeyPair2.publicKey, f.message, session).catch(() => {});
    release(f.request);
    await routing;
    t.ok(f.pending.getPendingRequest('rpc-1'), 'late validation cannot resolve a replacement entry');
    f.pending.close();
    await replacement;
});

test('append handler rechecks signed context after asynchronous validation and before a deferred response', async t => {
    const f = await fixture(t);
    let received = 0;
    let reply;
    const coordinator = {
        async refreshAppendOutcome() { f.context.targetEpoch = '8'; },
        async handleSelectionRequest(_request, callback) { received++; reply = () => callback(f.decision); },
    };
    const handler = new V1EpochAppendOperationHandler(f.state, f.other, config, coordinator);
    const session = { closed: false, sendAndForget() { t.fail('stale request must not receive permission'); } };
    await handler.handleRequest(f.message, f.connection, session);
    t.is(received, 0);
    f.context.targetEpoch = '7';
    coordinator.refreshAppendOutcome = async () => {};
    await handler.handleRequest(f.message, f.connection, session);
    t.is(received, 1);
    f.context.targetEpoch = '8';
    await reply();
    t.pass('epoch change during deferral suppresses the old reply');
});

test('proof approvals cannot resolve an append RPC', async t => {
    const f = await fixture(t);
    const session = { closed: false };
    const router = new ConsensusV1MessageRouter(f.state, f.wallet, config, f.pending, {
        handleLocalError() {}, handleInvalidMessage() { t.fail('must ignore mismatched RPC type'); },
    });
    const waiting = f.pending.registerPendingRequest(testKeyPair2.publicKey, f.message, session).catch(() => {});
    await router.route(encodeConsensusMessage({
        type: ConsensusOperationType.PROOF_PROPOSAL_APPROVAL, session_id: 'rpc-1', timestamp: 1,
    }), f.peer, session);
    t.ok(f.pending.getPendingRequest('rpc-1'));
    f.pending.close();
    await waiting;
});

test('vote status, observed term and the persisted vote are authenticated and semantically checked', async t => {
    const f = await fixture(t);
    const validator = new V1EpochAppendReply(config, f.state);
    for (const mutate of [
        body => { body.vote_status = 2; },
        body => { body.observed_counter[7] ^= 1; },
        body => { body.vote.payload_hash[0] ^= 1; },
        body => { body.vote.request_id = 'another-vote'; },
        body => { body.vote.selection_version = 1; },
        body => { body.vote_status = 0; },
        body => { delete body.observed_counter; },
        body => { delete body.vote; },
    ]) {
        const tampered = decodeConsensusMessage(encodeConsensusMessage(f.response));
        mutate(tampered.reply);
        await t.exception(() => validator.validate(tampered, f.peer, f.message));
    }
    for (const change of [
        { observedCounter: 1n },
        { vote: { ...f.request, requester: testKeyPair2.publicKey } },
        { vote: { ...f.request, payloadHash: '11'.repeat(32) } },
        { vote: { ...f.request, targetEpoch: '8' } },
        { voteStatus: 3, vote: { ...f.request, logicalCounter: 1n } },
    ]) {
        const response = await consensusMessageFactory(f.other, config).buildReply('rpc-1', { ...f.decision, ...change });
        await t.exception(() => validator.validate(response, f.peer, f.message), 'a valid signature does not make an inconsistent vote valid');
    }
    const busy = { ...f.decision, voteStatus: 2, vote: { ...f.request, requester: testKeyPair2.publicKey, logicalCounter: 1n } };
    const response = await consensusMessageFactory(f.other, config).buildReply('rpc-1', busy);
    const result = await validator.validate(decodeConsensusMessage(encodeConsensusMessage(response)), f.peer, f.message);
    t.is(result.voteStatus, 2);
    t.is(result.vote.requester, testKeyPair2.publicKey);

    const laterTerm = f.request.logicalCounter + 1n;
    const previousContext = {
        ...f.decision, voteStatus: 3, observedCounter: laterTerm,
        vote: { ...f.request, targetEpoch: '6', configHash: '11'.repeat(32), logicalCounter: laterTerm },
    };
    const stale = await consensusMessageFactory(f.other, config).buildReply('rpc-1', previousContext);
    const validated = await validator.validate(stale, f.peer, f.message);
    t.is(validated.voteStatus, 3);
    t.is(validated.observedCounter, laterTerm, 'a lagging candidate learns the term even if the last vote was for an older context');
});

for (const type of ['REQUEST', 'REPLY']) {
    test(`append ${type} identity mismatch requests a ban for the transport peer`, async t => {
        const f = await fixture(t);
        f.state.emit = sinon.spy();
        const policy = new ConsensusV1ConnectionPolicy(f.state, { error: sinon.spy() }, config);
        const selector = { handleSelectionRequest: sinon.spy(), refreshAppendOutcome: sinon.spy() };
        const router = new ConsensusV1MessageRouter(f.state, f.wallet, config, f.pending, policy, selector);
        const session = { closed: false, sendAndForget: sinon.spy() };
        // The transport belongs to wallet 2, but the message claims wallet 1.
        const message = type === 'REQUEST' ? f.message
            : await consensusMessageFactory(f.wallet, config).buildReply('rpc-1', f.decision);
        const waiting = type === 'REPLY'
            ? f.pending.registerPendingRequest(testKeyPair2.publicKey, f.message, session).catch(error => error)
            : null;

        await router.route(encodeConsensusMessage(message), f.peer, session);

        const bans = f.state.emit.withArgs(CustomEventType.CONSENSUS_PEER_BAN_REQUESTED);
        t.is(bans.callCount, 1, 'the existing connection policy receives the validation failure');
        const ban = bans.firstCall?.args[1];
        t.is(ban?.connection, f.peer, 'the ban targets the authenticated transport, not the claimed author');
        t.is(ban?.error.resultCode, ConsensusResultCode.PUBLIC_KEY_MISMATCH);
        t.is(f.reads(), 0, 'impersonation is rejected before reading election state');
        t.absent(selector.refreshAppendOutcome.called);
        t.absent(selector.handleSelectionRequest.called);
        t.absent(session.sendAndForget.called, 'an impersonating REQUEST receives no reply');
        if (waiting) {
            t.is((await waiting).resultCode, ConsensusResultCode.PUBLIC_KEY_MISMATCH);
            t.absent(f.pending.getPendingRequest('rpc-1'), 'an impersonating REPLY rejects the pending request');
        }
    });

    for (const failure of ['signature', 'context', 'local read']) {
        test(`append ${type} ${failure} failure does not ban the peer`, async t => {
            const f = await fixture(t);
            f.state.emit = sinon.spy();
            const policy = new ConsensusV1ConnectionPolicy(f.state, { error: sinon.spy() }, config);
            const selector = { handleSelectionRequest: sinon.spy(), refreshAppendOutcome: sinon.spy() };
            const router = new ConsensusV1MessageRouter(f.state, f.wallet, config, f.pending, policy, selector);
            const session = { closed: false, sendAndForget: sinon.spy(), close: sinon.spy() };
            const message = type === 'REQUEST' ? f.message : f.response;
            const connection = type === 'REQUEST' ? f.connection : f.peer;
            let expectedCode;
            if (failure === 'signature') {
                message.timestamp++;
                expectedCode = ConsensusResultCode.RESPONSE_SIGNATURE_INVALID;
            } else if (failure === 'context') {
                f.context.targetEpoch = '8';
                expectedCode = ConsensusResultCode.EPOCH_INVALID;
            } else {
                f.state.getEpochAppenderSelectionContext = async () => {
                    throw Object.assign(new Error('local read failed'), { resultCode: ConsensusResultCode.PUBLIC_KEY_MISMATCH });
                };
                expectedCode = ConsensusResultCode.UNEXPECTED_ERROR;
            }
            const waiting = type === 'REPLY'
                ? f.pending.registerPendingRequest(testKeyPair2.publicKey, f.message, session).catch(error => error)
                : null;

            await router.route(encodeConsensusMessage(message), connection, session);

            t.absent(f.state.emit.calledWith(CustomEventType.CONSENSUS_PEER_BAN_REQUESTED));
            t.absent(selector.refreshAppendOutcome.called);
            t.absent(selector.handleSelectionRequest.called);
            t.absent(session.sendAndForget.called);
            t.absent(session.close.called, 'ordinary failures keep the consensus channel open');
            if (waiting) {
                t.is((await waiting).resultCode, expectedCode);
                t.absent(f.pending.getPendingRequest('rpc-1'));
            }
        });
    }
}


for (const counter of [EPOCH_APPENDER_SELECTION_MAX_COUNTER, EPOCH_APPENDER_SELECTION_MAX_COUNTER - 1n,
    EPOCH_APPENDER_SELECTION_COUNTER_LIMIT + 1n]) {
    test(`signed REQUEST rejects a counter in the overflow range: ${counter}`, async t => {
        const f = await fixture(t);
        const message = await consensusMessageFactory(f.wallet, config).buildRequest('rpc-1', {
            ...f.request, logicalCounter: counter,
        });
        const decoded = decodeConsensusMessage(encodeConsensusMessage(message));
        t.is(new ConsensusValidationSchema(config).validateEpochAppendRequest(decoded), false);
        const error = await new V1EpochAppendRequest(config, f.state).validate(decoded, f.connection).catch(error => error);
        t.is(error.resultCode, ConsensusResultCode.SCHEMA_VALIDATION_FAILED);
        t.is(f.reads(), 0, 'reject before reading context or reaching the selector');
    });

    test(`correlated GRANTED reply rejects an overflowing observed counter: ${counter}`, async t => {
        const f = await fixture(t);
        const message = await consensusMessageFactory(f.other, config).buildReply('rpc-1', {
            ...f.decision, observedCounter: counter,
        });
        const decoded = decodeConsensusMessage(encodeConsensusMessage(message));
        t.is(new ConsensusValidationSchema(config).validateEpochAppendReply(decoded), false);
        const error = await new V1EpochAppendReply(config, f.state).validate(decoded, f.peer, f.message).catch(error => error);
        t.is(error.resultCode, ConsensusResultCode.SCHEMA_VALIDATION_FAILED);
        t.is(f.reads(), 0);
    });

    test(`REPLY rejects an overflowing counter in its saved vote: ${counter}`, async t => {
        const f = await fixture(t);
        const message = await consensusMessageFactory(f.other, config).buildReply('rpc-1', {
            ...f.decision, voteStatus: 3,
            vote: { ...f.request, logicalCounter: counter },
        });
        const decoded = decodeConsensusMessage(encodeConsensusMessage(message));
        t.is(new ConsensusValidationSchema(config).validateEpochAppendReply(decoded), false,
            'a valid observed counter does not hide an invalid nested vote');
        const error = await new V1EpochAppendReply(config, f.state).validate(decoded, f.peer, f.message).catch(error => error);
        t.is(error.resultCode, ConsensusResultCode.SCHEMA_VALIDATION_FAILED);
    });
}

test('compiled append schemas validate the shape and range of every counter field', async t => {
    const f = await fixture(t);
    const schema = new ConsensusValidationSchema(config);
    for (const fieldPath of [
        ['request', 'intent', 'logical_counter'],
        ['reply', 'intent', 'logical_counter'],
        ['reply', 'observed_counter'],
        ['reply', 'vote', 'logical_counter'],
    ]) {
        const original = fieldPath[0] === 'request' ? f.message : f.response;
        const validateSchema = fieldPath[0] === 'request'
            ? schema.validateEpochAppendRequest.bind(schema)
            : schema.validateEpochAppendReply.bind(schema);
        for (const value of [undefined, null, 'invalid', b4a.alloc(7, 1), b4a.alloc(9, 1), uint64ToBuffer(0n),
            uint64ToBuffer(EPOCH_APPENDER_SELECTION_COUNTER_LIMIT + 1n)]) {
            const message = decodeConsensusMessage(encodeConsensusMessage(original));
            const parent = fieldPath.slice(0, -1).reduce((object, field) => object[field], message);
            parent[fieldPath.at(-1)] = value;
            t.is(validateSchema(message), false, fieldPath.join('.'));
        }
        for (const value of [1n, EPOCH_APPENDER_SELECTION_COUNTER_LIMIT]) {
            const message = decodeConsensusMessage(encodeConsensusMessage(original));
            const parent = fieldPath.slice(0, -1).reduce((object, field) => object[field], message);
            parent[fieldPath.at(-1)] = uint64ToBuffer(value);
            t.is(validateSchema(message), true, `${fieldPath.join('.')} accepts ${value}`);
        }
    }
    for (const message of [undefined, null, {}, { type: ConsensusOperationType.PROOF_PROPOSAL }]) {
        t.is(schema.validateEpochAppendRequest(message), false);
        t.is(schema.validateEpochAppendReply(message), false);
    }
    t.is(schema.validateEpochAppendRequest(f.message), true);
    t.is(schema.validateEpochAppendReply(f.response), true);
    t.is(schema.validateEpochAppendRequest(f.response), false, 'the request schema rejects replies');
    t.is(schema.validateEpochAppendReply(f.message), false, 'the reply schema rejects requests');
});
