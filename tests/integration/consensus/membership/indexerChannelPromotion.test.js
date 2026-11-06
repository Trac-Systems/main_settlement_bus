import test from 'brittle';
import sinon from 'sinon';
import Protomux from 'protomux';
import c from 'compact-encoding';
import b4a from 'b4a';
import { CustomEventType } from '../../../../src/utils/constants.js';
import { createConsensusNetwork } from '../helpers/consensusNetwork.js';
import { replicationProbe, assertEpochWithPeer } from '../helpers/connectionAssertions.js';

test('a writer refused consensus access can participate after signed promotion using the same transport', async t => {
    const network = await createConsensusNetwork(t, { indexerCount: 4 });
    const { proposer, nodes } = network;
    const writer = nodes[4];
    const local = network.connectionFrom(proposer, writer);
    const remote = network.connectionFrom(writer, proposer);
    const received = sinon.spy();
    const banRequested = sinon.spy();
    proposer.state.on(CustomEventType.EPOCH_PROPOSAL_RECEIVED, received);
    proposer.state.on(CustomEventType.CONSENSUS_PEER_BAN_REQUESTED, banRequested);
    t.teardown(() => {
        proposer.state.off(CustomEventType.EPOCH_PROPOSAL_RECEIVED, received);
        proposer.state.off(CustomEventType.CONSENSUS_PEER_BAN_REQUESTED, banRequested);
    });
    const sign = sinon.spy(proposer.wallet, 'sign');
    const probe = await replicationProbe(t, proposer, writer);
    t.absent(await proposer.state.isIndexerAddress(writer.wallet.address));
    const channel = Protomux.from(remote).createChannel({ protocol: 'consensus/v1' });
    const sender = channel.addMessage({ encoding: c.raw });
    channel.open();
    sender.send(b4a.from([0xff]));
    t.absent(await channel.fullyOpened(), 'signed membership refuses the writer channel');
    await channel.fullyClosed();
    t.absent(local.protocolSessions?.indexer);
    t.absent(proposer.manager.connected(writer.wallet.publicKey));
    t.absent(received.called, 'refused channel never reaches the proposal handler');
    t.absent(sign.called, 'refused messages do not cause signing work');
    t.absent(banRequested.called, 'missing membership is not an identity violation');
    await probe.transfer('while the writer has no consensus channel');

    await network.addIndexer(writer);
    t.ok(await proposer.state.isIndexerAddress(writer.wallet.address));
    await assertEpochWithPeer(t, network, writer);
    t.is(proposer.manager.getConnection(writer.wallet.publicKey), local, 'promotion reuses the original connection');
    t.ok(local.protocolSessions.indexer && !local.protocolSessions.indexer.closed);
    t.ok(local.connected && remote.connected);
    t.absent(banRequested.called);
    await probe.transfer('after signed promotion');
});
