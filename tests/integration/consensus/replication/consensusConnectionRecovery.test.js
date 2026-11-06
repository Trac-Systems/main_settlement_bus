import test from 'brittle';
import sinon from 'sinon';
import Protomux from 'protomux';
import c from 'compact-encoding';
import b4a from 'b4a';
import { ConsensusResultCode } from '../../../../src/utils/constants.js';
import V1EpochProofProposalRequest from '../../../../src/core/network/protocols/consensus/v1/validators/V1EpochProofProposalRequest.js';
import ProposalHandler from '../../../../src/core/network/protocols/consensus/v1/handlers/V1EpochProofProposalOperationHandler.js';
import { createConsensusNetwork, waitFor } from '../helpers/consensusNetwork.js';
import { replicationProbe, assertEpochWithPeer } from '../helpers/connectionAssertions.js';

test('remote channel closure during validation rejects only its requests and ignores the late result after reopening', async t => {
    const network = await createConsensusNetwork(t);
    const { proposer, nodes } = network;
    const peer = nodes[1];
    const other = nodes[2];
    await proposer.manager.connect();
    const local = network.connectionFrom(proposer, peer);
    const remote = network.connectionFrom(peer, proposer);
    await peer.manager.add(proposer.wallet.publicKey, remote);
    const oldSession = local.protocolSessions.indexer;
    const oldRemoteSession = remote.protocolSessions.indexer;
    const otherSession = network.connectionFrom(proposer, other).protocolSessions.indexer;
    const probe = await replicationProbe(t, proposer, peer);
    const request = await network.createProofProposal();
    const otherRequest = { ...request, session_id: 'other-peer-request' };
    const gates = [network.deferred(), network.deferred(), network.deferred()];
    const waiting = [];
    const validate = V1EpochProofProposalRequest.prototype.validate;
    const validation = sinon.stub(V1EpochProofProposalRequest.prototype, 'validate').callsFake(async function (...args) {
        const result = await validate.apply(this, args);
        const index = waiting.length;
        waiting.push(args[0]);
        await gates[index].promise;
        return result;
    });
    const handler = sinon.spy(ProposalHandler.prototype, 'handleRequest');
    t.teardown(() => { validation.restore(); handler.restore(); });
    const oldSend = sinon.spy(oldRemoteSession, 'sendAndForget');
    const oldResult = proposer.manager.send(peer.wallet.publicKey, request).catch(error => error);
    await waitFor('first request held after validation', () => waiting.length === 1);
    const oldHandling = handler.firstCall.returnValue;
    const otherResult = proposer.manager.send(other.wallet.publicKey, otherRequest);
    await waitFor('another peer request held after validation', () => waiting.length === 2);

    oldRemoteSession.close();
    t.ok((await oldResult).message.includes('Consensus session closed'), 'request rejects on closure without waiting for its timeout');
    await waitFor('closed sessions removed', () => !local.protocolSessions.indexer && !remote.protocolSessions.indexer);
    t.absent(proposer.pending.has(request.session_id));
    t.ok(proposer.pending.has(otherRequest.session_id), 'another peer request survives');
    t.is(network.connectionFrom(proposer, other).protocolSessions.indexer, otherSession);
    t.absent(proposer.manager.connected(peer.wallet.publicKey));
    t.absent(peer.manager.connected(proposer.wallet.publicKey));
    await probe.transfer('while the channel is closed');

    await proposer.manager.add(peer.wallet.publicKey, local);
    const newSession = local.protocolSessions.indexer;
    const newResult = proposer.manager.send(peer.wallet.publicKey, request);
    await waitFor('replacement request held after validation', () => waiting.length === 3);
    const newEntry = proposer.pending.getPendingRequest(request.session_id);
    t.absent(newSession === oldSession);
    t.is(newEntry.session, newSession, 'even the reused request ID belongs to the new session');
    gates[0].resolve();
    await oldHandling;
    t.absent(oldSend.called, 'old validation cannot send through a closed session');
    t.is(proposer.pending.getPendingRequest(request.session_id), newEntry, 'late validation cannot settle the replacement request');
    t.is(local.protocolSessions.indexer, newSession);

    gates[1].resolve();
    gates[2].resolve();
    t.is((await otherResult).resultCode, ConsensusResultCode.OK);
    t.is((await newResult).resultCode, ConsensusResultCode.OK);
    t.absent(proposer.pending.has(request.session_id));
    t.absent(proposer.pending.has(otherRequest.session_id));
    await probe.transfer('after the channel reopened');
    t.ok(local.connected && remote.connected, 'both original transports remain connected');
});

test('malformed consensus bytes close only that channel and a reopened channel can reach quorum', async t => {
    const network = await createConsensusNetwork(t);
    const { proposer, nodes } = network;
    const peer = nodes[1];
    const local = network.connectionFrom(proposer, peer);
    const remote = network.connectionFrom(peer, proposer);
    // This peer deliberately sends a raw invalid frame through a real Protomux channel.
    const channel = Protomux.from(remote).createChannel({ protocol: 'consensus/v1' });
    const sender = channel.addMessage({ encoding: c.raw });
    channel.open();
    t.ok(await channel.fullyOpened());
    await proposer.manager.connect();
    const original = local.protocolSessions.indexer;
    const healthy = network.connectionFrom(proposer, nodes[2]);
    const healthySession = healthy.protocolSessions.indexer;
    const probe = await replicationProbe(t, proposer, peer);
    const request = await network.createProofProposal();
    const pending = proposer.manager.send(peer.wallet.publicKey, request).catch(error => error);
    t.ok(proposer.pending.has(request.session_id));

    sender.send(b4a.from([0xff]));
    t.ok((await pending).message.includes('Consensus session closed'));
    await channel.fullyClosed();
    await waitFor('invalid-message session removed', () => !local.protocolSessions.indexer);
    t.ok(original.closed);
    t.absent(proposer.pending.has(request.session_id));
    t.absent(proposer.manager.connected(peer.wallet.publicKey));
    t.is(healthy.protocolSessions.indexer, healthySession, 'another consensus session survives');
    t.is((await proposer.manager.send(nodes[2].wallet.publicKey, request)).resultCode, ConsensusResultCode.OK);
    await probe.transfer('after invalid consensus bytes');
    t.ok(local.connected && remote.connected);

    await assertEpochWithPeer(t, network, peer);
    t.absent(local.protocolSessions.indexer === original);
    t.is(proposer.manager.getConnection(peer.wallet.publicKey), local);
});

test('repeated simultaneous consensus opens and closes keep one session per transport and preserve replication', async t => {
    const network = await createConsensusNetwork(t);
    const { proposer, nodes } = network;
    const peer = nodes[1];
    const local = network.connectionFrom(proposer, peer);
    const remote = network.connectionFrom(peer, proposer);
    const localCreates = sinon.spy(proposer.messages, 'createProtocolSession');
    const remoteCreates = sinon.spy(peer.messages, 'createProtocolSession');
    const probe = await replicationProbe(t, proposer, peer);
    const request = await network.createProofProposal();

    for (let cycle = 0; cycle < 3; cycle++) {
        await Promise.all([
            proposer.manager.add(peer.wallet.publicKey, local),
            peer.manager.add(proposer.wallet.publicKey, remote),
            proposer.messages.attachChannel(local),
            peer.messages.attachChannel(remote),
        ]);
        t.is(localCreates.callCount, cycle + 1, 'one local session per opening cycle');
        t.is(remoteCreates.callCount, cycle + 1, 'one remote session per opening cycle');
        t.is((await proposer.manager.send(peer.wallet.publicKey, request)).resultCode, ConsensusResultCode.OK);
        const sessions = [local.protocolSessions.indexer, remote.protocolSessions.indexer];
        for (const session of sessions) { session.close(); session.close(); }
        await waitFor('both session references removed', () => !local.protocolSessions.indexer && !remote.protocolSessions.indexer);
        t.absent(proposer.manager.connected(peer.wallet.publicKey));
        t.absent(peer.manager.connected(proposer.wallet.publicKey));
        t.absent(proposer.pending.has(request.session_id));
        await probe.transfer(`after close cycle ${cycle}`);
        t.ok(local.connected && remote.connected);
    }
    await assertEpochWithPeer(t, network, peer);
    t.is(proposer.manager.getConnection(peer.wallet.publicKey), local);
});

test('a disconnected transport clears its pending request and its replacement resumes direct replication and consensus', async t => {
    const network = await createConsensusNetwork(t);
    const { proposer, nodes } = network;
    const peer = nodes[1];
    await proposer.manager.connect();
    const oldLocal = network.connectionFrom(proposer, peer);
    const oldRemote = network.connectionFrom(peer, proposer);
    await peer.manager.add(proposer.wallet.publicKey, oldRemote);
    const oldSession = oldLocal.protocolSessions.indexer;
    const healthy = network.connectionFrom(proposer, nodes[2]);
    const probe = await replicationProbe(t, proposer, peer);
    await probe.transfer('before disconnect');
    const request = await network.createProofProposal();
    const release = network.deferred();
    let held = false;
    const validate = V1EpochProofProposalRequest.prototype.validate;
    const validation = sinon.stub(V1EpochProofProposalRequest.prototype, 'validate').callsFake(async function (...args) {
        const result = await validate.apply(this, args);
        if (this._state === peer.state && args[0].session_id === request.session_id) {
            held = true;
            await release.promise;
        }
        return result;
    });
    t.teardown(() => validation.restore());
    const result = proposer.manager.send(peer.wallet.publicKey, request).catch(error => error);
    await waitFor('request in flight before disconnection', () => held);

    await network.disconnect(proposer, peer);
    t.ok((await result).message.includes('Consensus session closed'));
    t.ok(oldSession.closed);
    t.absent(proposer.pending.has(request.session_id));
    t.absent(proposer.manager.connected(peer.wallet.publicKey));
    t.absent(peer.manager.connected(proposer.wallet.publicKey));
    t.ok(healthy.connected, 'another peer transport is unaffected');
    const missing = probe.source.length;
    await probe.source.append('written during disconnect');
    t.absent(await probe.replica.has(missing), 'the disconnected direct link cannot deliver a fresh block');

    await network.reconnect(proposer, peer);
    const replacement = network.connectionFrom(proposer, peer);
    t.absent(replacement === oldLocal);
    await proposer.manager.connect();
    t.is(proposer.manager.getConnection(peer.wallet.publicKey), replacement);
    release.resolve();
    t.is(await probe.replica.get(missing, { timeout: 30_000 }), 'written during disconnect', 'the replacement link catches up');
    await probe.transfer('after reconnect');
    await assertEpochWithPeer(t, network, peer);
    t.is(proposer.manager.getConnection(peer.wallet.publicKey), replacement);
    t.ok(replacement.connected);
});
