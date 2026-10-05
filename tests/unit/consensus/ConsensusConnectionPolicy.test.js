import test from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import EventEmitter from 'bare-events';
import tracCryptoApi from 'trac-crypto-api';
import ConsensusConnectionPolicy from '../../../src/core/consensus/ConsensusConnectionPolicy.js';
import { V1ConsensusProtocolError } from '../../../src/core/consensus/v1/V1ConsensusProtocolError.js';
import { ConsensusResultCode, CustomEventType } from '../../../src/utils/constants.js';

function setup() {
    const config = { addressPrefix: 'trac' };
    const state = new EventEmitter();
    state.isIndexerAddress = sinon.stub().resolves(false);
    const banRequested = sinon.spy();
    state.on(CustomEventType.CONSENSUS_PEER_BAN_REQUESTED, banRequested);
    const logger = { error: sinon.spy() };
    const connection = { remotePublicKey: b4a.alloc(32, 1), destroy: sinon.spy(), end: sinon.spy() };
    const policy = new ConsensusConnectionPolicy(state, logger, config);
    return { state, logger, connection, policy, banRequested };
}

test('Consensus policy admits the authenticated indexer using local state reads', async t => {
    const { state, connection, policy, banRequested } = setup();
    state.isIndexerAddress.resolves(true);
    connection.claimedAddress = tracCryptoApi.address.encode('trac', b4a.alloc(32, 2));

    t.is(await policy.shouldAcceptConsensusChannel(connection), true);
    t.alike(state.isIndexerAddress.firstCall.args, [
        tracCryptoApi.address.encode('trac', connection.remotePublicKey),
        { wait: false, update: false }
    ], 'admission uses the transport identity and does not wait for replication');
    t.absent(banRequested.called);
});

test('Consensus policy rechecks membership after promotion and demotion without banning', async t => {
    const { state, connection, policy, banRequested } = setup();
    t.is(await policy.shouldAcceptConsensusChannel(connection), false);
    state.isIndexerAddress.resolves(true);
    t.is(await policy.shouldAcceptConsensusChannel(connection), true, 'a previous refusal is not cached');
    state.isIndexerAddress.resolves(false);
    t.is(await policy.shouldAcceptConsensusChannel(connection), false, 'permission is not cached either');
    t.is(state.isIndexerAddress.callCount, 3);
    t.absent(banRequested.called);
    t.absent(connection.destroy.called);
    t.absent(connection.end.called);
});

test('Consensus policy refuses a failed state read and permits a later successful retry', async t => {
    const { state, logger, connection, policy, banRequested } = setup();
    state.isIndexerAddress.rejects(new Error('BLOCK_NOT_AVAILABLE'));
    t.is(await policy.shouldAcceptConsensusChannel(connection), false, 'read errors do not escape to Protomux');
    t.ok(logger.error.calledOnce);
    t.ok(logger.error.firstCall.args[0].includes('BLOCK_NOT_AVAILABLE'));
    t.absent(banRequested.called);
    t.absent(connection.destroy.called);
    t.absent(connection.end.called);
    state.isIndexerAddress.resolves(true);
    t.is(await policy.shouldAcceptConsensusChannel(connection), true);
});

test('Consensus policy refuses an invalid transport public key before reading state', async t => {
    const { state, logger, connection, policy, banRequested } = setup();
    connection.remotePublicKey = b4a.alloc(1);
    t.is(await policy.shouldAcceptConsensusChannel(connection), false);
    t.absent(state.isIndexerAddress.called);
    t.ok(logger.error.calledOnce);
    t.absent(banRequested.called);
});

test('Consensus policy requests a ban only for a local protocol identity mismatch', t => {
    const { policy, connection, banRequested } = setup();
    for (const error of [undefined, new Error('local failure'),
        { resultCode: ConsensusResultCode.PUBLIC_KEY_MISMATCH },
        new V1ConsensusProtocolError(ConsensusResultCode.INDEXER_ROLE_INVALID, 'role missing')]) {
        t.is(policy.requestPeerBan(connection, error), false);
    }
    t.absent(banRequested.called);
    const error = new V1ConsensusProtocolError(ConsensusResultCode.PUBLIC_KEY_MISMATCH, 'identity mismatch');
    t.is(policy.requestPeerBan(connection, error), true);
    t.ok(banRequested.calledOnceWithExactly({ connection, error }));
});

test('Consensus policy ignores expired approvals and approvals from replaced sessions', t => {
    const { policy } = setup();
    const session = {};
    t.is(policy.shouldIgnoreApproval(undefined, session), true);
    t.is(policy.shouldIgnoreApproval(null, session), true);
    t.is(policy.shouldIgnoreApproval({}, session), false, 'legacy requests without a session remain supported');
    t.is(policy.shouldIgnoreApproval({ session }, session), false);
    t.is(policy.shouldIgnoreApproval({ session: {} }, session), true);
});

test('Consensus policy closes only the channel for invalid messages and only logs local errors', t => {
    const { policy, logger, connection, banRequested } = setup();
    const session = { close: sinon.spy() };
    policy.handleInvalidMessage(session, 'invalid consensus frame');
    t.ok(session.close.calledOnce);
    t.ok(logger.error.calledWithExactly('invalid consensus frame'));
    policy.handleLocalError('local storage failure');
    t.ok(logger.error.calledWithExactly('local storage failure'));
    t.is(session.close.callCount, 1);
    t.absent(connection.destroy.called);
    t.absent(connection.end.called);
    t.absent(banRequested.called);
});
