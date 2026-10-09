import { waitFor } from './consensusNetwork.js';
import { assertSignedEpoch } from './epochAssertions.js';

/** Only these two nodes open the core, so its blocks cannot arrive through another peer. */
export async function replicationProbe(t, sourceNode, replicaNode) {
    const source = sourceNode.store.get({ name: 'connection-recovery', valueEncoding: 'utf-8' });
    let replica;
    t.teardown(async () => {
        await replica?.close();
        await source.close();
    }, { order: -1, force: true });
    await source.ready();
    replica = replicaNode.store.get({ key: source.key, valueEncoding: 'utf-8' });
    await replica.ready();
    return { source, replica, async transfer(value) {
        const index = source.length;
        await source.append(value);
        t.is(await replica.get(index, { timeout: 30_000 }), value, 'a new block crosses the direct link');
    } };
}

/** Require an approval from the recovered peer, not just signatures from unaffected peers. */
export async function assertEpochWithPeer(t, network, peer) {
    const { proposer, nodes } = network;
    const second = nodes.find(node => node.promoted && node !== proposer && node !== peer);
    const releaseOthers = network.deferred();
    const collect = proposer.operations.collectSignature.bind(proposer.operations);
    proposer.operations.collectSignature = async (...args) => {
        const result = await collect(...args);
        if (!args[0].key.equals(peer.state.writingKey) && !args[0].key.equals(second.state.writingKey)) {
            await releaseOthers.promise;
        }
        return result;
    };
    const round = network.startRound();
    const approvers = await assertSignedEpoch(t, network);
    await waitFor('round completion with the recovered peer', () => round.completed);
    t.ok(approvers.includes(peer.wallet.address), 'the recovered peer contributes to the signed epoch');
    releaseOthers.resolve();
}
