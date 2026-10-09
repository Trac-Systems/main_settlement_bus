import test from 'brittle';
import sinon from 'sinon';
import EventEmitter from 'bare-events';
import { CONNECTION_STATUS, ConsensusResultCode } from '../../../../src/utils/constants.js';
import { createConsensusNetwork, waitFor } from '../helpers/consensusNetwork.js';

// Deliver discovery/handshake notifications explicitly; all transport and protocol work stays real.
class ControlledSwarm extends EventEmitter {
    peers = new Map();
    connections = new Set();
    _allConnections = new Map();
    join() {}
    flush() {}
    joinPeer() {}
    leavePeer() {}
    // The fixture owns the Noise streams and closes both ends together during teardown.
    async destroy() {}
}

// esmock uses the Node module loader. The other replication scenarios also run on Bare.
const nodeTest = typeof globalThis.Bare === 'undefined' ? test : test.skip;
nodeTest('Network waits for handshake delivery before creating a usable consensus session', async t => {
    let network;
    t.teardown(() => network?.close(), { order: -1, force: true });
    const peers = await createConsensusNetwork(t, { prepareConnections: false });
    const { proposer, nodes } = peers;
    const peer = nodes[1];
    const connection = peers.connectionFrom(proposer, peer);
    const remote = peers.connectionFrom(peer, proposer);
    peer.messages.prepareConnection(remote);
    // Keep the automatic coordinator idle; this test controls the proposal explicitly.
    Object.defineProperty(proposer.config, 'epochInterval', { value: 600_000 });
    const { default: esmock } = await import('esmock');
    const { default: Network } = await esmock('../../../../src/core/network/Network.js', {
        hyperswarm: { default: ControlledSwarm },
    });
    network = new Network(proposer.state, proposer.store, proposer.config, proposer.wallet);
    sinon.stub(network.validatorObserverService, 'start').resolves();
    await network.ready();
    const manager = network.indexerConnectionManager;
    const publicKey = peer.wallet.publicKey.toString('hex');
    network.swarm.peers.set(publicKey, { publicKey: peer.wallet.publicKey, banned: false });
    network.swarm._allConnections.set(peer.wallet.publicKey, connection);

    t.is(await network.tryConnect(publicKey, 'indexer'), CONNECTION_STATUS.PENDING);
    t.ok(network.isConnectionPending(publicKey));
    t.absent(manager.connected(publicKey), 'discovery alone cannot promote the peer');
    t.absent(connection.protocolSessions?.indexer, 'no session exists before the connection event');

    network.swarm.connections.add(connection);
    network.swarm.emit('connection', connection);
    await waitFor('Network promotes the handshaken peer', () => manager.connected(publicKey));
    const session = connection.protocolSessions.indexer;
    t.ok(session && !session.closed, 'connected means an open consensus session is retained');
    t.absent(network.isConnectionPending(publicKey));
    t.is(manager.getConnection(publicKey), connection);

    // Capture a genuinely signed proposal with a real VDF before it can be appended.
    const prepared = peers.deferred();
    const resume = peers.deferred();
    const create = proposer.operations.createProofProposal.bind(proposer.operations);
    proposer.operations.createProofProposal = async (...args) => {
        const proposal = await create(...args);
        prepared.resolve(proposal);
        await resume.promise;
        return proposal;
    };
    const execution = peers.startRound();
    const proposal = await prepared.promise;
    const response = await manager.send(publicKey, proposal);
    t.is(response.resultCode, ConsensusResultCode.OK, 'the retained session exchanges and validates a real approval');
    t.ok(response.approval.approval_sig);
    t.is(connection.protocolSessions.indexer, session, 'the usable session reference is preserved');
    await execution.round.cancel();
    resume.resolve();

    const source = proposer.store.get({ name: 'handshake-replication', valueEncoding: 'utf-8' });
    let replica;
    try {
        await source.ready();
        replica = peer.store.get({ key: source.key, valueEncoding: 'utf-8' });
        await replica.ready();
        await source.append('replication survives consensus handshake');
        t.is(await replica.get(0, { timeout: 30_000 }), 'replication survives consensus handshake');
        t.ok(connection.connected && remote.connected, 'the original transports remain open');
    } finally {
        await replica?.close();
        await source.close();
    }
});
