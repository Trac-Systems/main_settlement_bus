import {
    EpochAppendOutcome,
} from '../../../../src/core/consensus/epochAppenderSelection/epochAppenderSelectionState.js';
import test from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import { createConsensusNetwork, waitFor } from '../helpers/consensusNetwork.js';
import { assertSignedEpoch } from '../helpers/epochAssertions.js';
import { ConsensusOperationType } from '../../../../src/utils/constants.js';

for (const indexerCount of [1, 2]) {
    test(`coordinated append with ${indexerCount} indexers keeps the existing proof quorum`, async t => {
        const network = await createConsensusNetwork(t, { indexerCount });
        const selection = sinon.spy(network.proposer.appenderSelector, 'createRequest');
        const sends = sinon.spy(network.proposer.manager, 'send');
        const append = sinon.spy(network.proposer.state, 'appendEpoch');
        const round = network.startRound();
        await assertSignedEpoch(t, network);
        await waitFor('coordinated round completion', () => round.completed);
        t.is(selection.callCount, 1, 'the first epoch goes through appender selection');
        t.is(selection.firstCall.args[0].targetEpoch, '1');
        t.is(append.callCount, 1);
        const requests = sends.args.filter(([, message]) => message.type === ConsensusOperationType.REQUEST);
        t.ok(requests.length >= indexerCount - 1);
        t.is(new Set(requests.map(([peer]) => peer)).size, indexerCount - 1, 'small groups try to agree before a solo fallback');
        t.is(sends.args.filter(([, message]) => message.type === ConsensusOperationType.PROOF_PROPOSAL).length, 0,
            'neither one nor two indexers require an external proof approval');
    });
}

test('epoch append context is stable across heads and adopts signed membership changes before the next epoch', async t => {
    const network = await createConsensusNetwork(t, { indexerCount: 2 });
    const initial = await network.proposer.state.getEpochAppenderSelectionContext();
    t.is(initial.members.length, 2);
    t.is(initial.targetEpoch, '1');
    for (const node of network.nodes) {
        const snapshot = await node.state.getEpochAppenderSelectionContext();
        t.is(snapshot.membershipContext, initial.membershipContext);
    }
    await network.addIndexer(network.nodes[2]);
    const changed = await network.nodes[2].state.getEpochAppenderSelectionContext();
    t.absent(changed.membershipContext === initial.membershipContext, 'a signed promotion invalidates the previous election context');
    t.is(changed.members.length, 3);
    t.is(changed.currentWriterKeys.length, 3, 'proof preflight still sees current signed membership');
    network.startRound();
    await assertSignedEpoch(t, network);
    const next = await network.proposer.state.getEpochAppenderSelectionContext();
    t.is(next.targetEpoch, '2');
    t.is(next.members.length, 3, 'the next epoch retains the current signed voters');
});

test('three real concurrent epoch rounds agree on one append over Protomux', async t => {
    const network = await createConsensusNetwork(t, { indexerCount: 3 });
    const contenders = network.nodes.slice(0, 3);
    await Promise.all(contenders.slice(1).map(node => network.openOperations(node)));
    const payloadsReady = network.deferred();
    let ready = 0;
    const appends = contenders.map(node => sinon.spy(node.state, 'appendEpoch'));
    for (const node of contenders) {
        const build = node.operations.buildSetEpochPayload.bind(node.operations);
        node.operations.buildSetEpochPayload = async (...args) => {
            const payload = await build(...args);
            if (++ready === contenders.length) payloadsReady.resolve();
            await payloadsReady.promise;
            return payload;
        };
    }
    const rounds = contenders.map(node => network.startRound(node));
    await assertSignedEpoch(t, network);
    await waitFor('all competing rounds to finish', () => rounds.every(round => round.completed));
    t.is(appends.reduce((total, append) => total + append.callCount, 0), 1, 'only one actual publication');
    t.ok(contenders.every(node => !node.appenderSelector.active), 'all reservations resolve or withdraw');
});

test('a rejected publication hands off after the election deadline without closing replication', async t => {
    const network = await createConsensusNetwork(t, {
        indexerCount: 3,
        timings: { epochSignatureTimeout: 5000, epochBackoffDelay: 100, indexerPendingRequestTimeout: 5000 },
    });
    const contenders = network.nodes.slice(0, 3);
    await Promise.all(contenders.slice(1).map(node => network.openOperations(node)));
    for (const node of contenders) Object.defineProperty(node.config, 'epochRemoteProposalTimeout', { value: 100 });
    const gate = network.deferred();
    const entered = network.deferred();
    const first = contenders[0];
    // Invalid bytes are frozen BEFORE acquisition, so the permission still binds the
    // exact operation. State's actual apply path will reject this publication.
    first.operations.buildSetEpochPayload = async () => b4a.from([0xff]);
    const originalAppend = first.state.appendEpoch.bind(first.state);
    const appends = contenders.map(node => node === first ? null : sinon.spy(node.state, 'appendEpoch'));
    let gated = true;
    first.state.appendEpoch = (payload, authorizeEpochAppend) => originalAppend(payload, async location => {
        await authorizeEpochAppend(location);
        if (gated) {
            gated = false;
            entered.resolve();
            await gate.promise;
        }
    });
    // Observe the actual call used by the coordinator, including the gated publisher.
    appends[0] = sinon.spy(first.state, 'appendEpoch');
    const firstRound = network.startRound(first);
    await entered.promise;
    const followers = contenders.slice(1).map(node => network.startRound(node));
    t.alike(await first.appenderSelector.reconcile(), { status: EpochAppendOutcome.UNKNOWN });
    t.is(appends.reduce((total, append) => total + append.callCount, 0), 1);
    const connection = network.connectionFrom(first, contenders[1]);
    connection.protocolSessions.indexer.close();
    t.absent(connection.destroyed, 'closing consensus keeps the shared replication stream');
    await firstRound.round.cancel();
    t.is(first.appenderSelector.active.phase, 'PUBLISHING', 'cancelling the FSM preserves publication intent');
    gate.resolve();
    await assertSignedEpoch(t, network);
    await waitFor('followers finish after handoff', () => followers.every(round => round.completed));
    t.is(appends.reduce((total, append) => total + append.callCount, 0), 2,
        'one rejected operation followed by exactly one successful operation');
    t.absent(first.appenderSelector.active, 'finalized rejection is observed outside the cancelled round');
    t.absent(connection.destroyed, 'replication survives the handoff');
});

test('a locally appended epoch stays reserved until other indexers finalize its writer position', async t => {
    const network = await createConsensusNetwork(t, { indexerCount: 2 });
    const { proposer, nodes } = network;
    const gate = network.deferred();
    const entered = network.deferred();
    const original = proposer.state.appendEpoch.bind(proposer.state);
    let localWriteDone = false;
    proposer.state.appendEpoch = async (payload, authorizeEpochAppend) => {
        const result = await original(payload, async location => {
            await authorizeEpochAppend(location);
            entered.resolve();
            await gate.promise;
        });
        localWriteDone = true;
        return result;
    };
    const round = network.startRound();
    await entered.promise;
    for (const node of nodes.slice(1)) await network.disconnect(proposer, node);
    gate.resolve();
    await waitFor('local append Promise resolution', () => localWriteDone);
    t.alike(await proposer.appenderSelector.reconcile(), { status: EpochAppendOutcome.UNKNOWN }, 'local append is insufficient without signed processing');
    t.is(proposer.appenderSelector.active.phase, 'PUBLISHING');
    t.is(await proposer.state.getCurrentEpoch(), 0n);
    for (const node of nodes.slice(1)) await network.reconnect(proposer, node);
    await assertSignedEpoch(t, network);
    await waitFor('round completes after replication', () => round.completed);
    t.absent(proposer.appenderSelector.active);
});
