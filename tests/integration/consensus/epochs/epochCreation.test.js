import test from 'brittle';
import sinon from 'sinon';
import { decodeEpochProofV1, safeDecodeApplyOperation } from '../../../../src/codecs/apply/applyOperationCodec.js';
import { createConsensusNetwork, waitFor } from '../helpers/consensusNetwork.js';
import { assertSignedEpoch } from '../helpers/epochAssertions.js';

test('consensus commits the same signed epoch on five indexers with low VDF difficulty', async t => {
    const network = await createConsensusNetwork(t);
    const append = sinon.spy(network.proposer.operations, 'appendSetEpoch');

    const round = network.startRound();
    await assertSignedEpoch(t, network);
    await waitFor('round completion', () => round.completed);

    t.is(append.callCount, 1, 'the round appends one SET_EPOCH operation');
    const proof = decodeEpochProofV1(safeDecodeApplyOperation(append.firstCall.args[0]).seo.data);
    t.is(proof.app.length, 2);
});

for (const indexerCount of [3, 5]) {
    test(`${indexerCount} indexers: a proposer with a failed local solver follows the epoch committed by another indexer`, async t => {
        const network = await createConsensusNetwork(t, {
            indexerCount, nodeCount: indexerCount, timings: { epochBackoffDelay: 60_000 },
        });
        t.is(network.nodes.length, indexerCount);
        t.is((await network.proposer.state.getIndexersEntry()).length, indexerCount, 'signed membership matches the requested network size');
        const calculate = sinon.stub(network.proposer.operations, 'calculateVDF').rejects(new Error('VDF solver unavailable'));
        const append = sinon.spy(network.proposer.operations, 'appendSetEpoch');
        network.startRound();
        await waitFor('failed local calculation', () => calculate.calledOnce);

        const other = network.nodes[1];
        await network.openOperations(other);
        const healthyRound = network.startRound(other);
        await assertSignedEpoch(t, network, { proposer: other });
        await waitFor('healthy round completion', () => healthyRound.completed);

        t.is(calculate.callCount, 1, 'the network advances while the failed proposer waits to retry');
        t.absent(append.called, 'the failed proposer does not append a proof');
        t.ok(await network.proposer.state.isIndexer(), 'local solver failure does not remove the indexer');
    });

    if (typeof globalThis.Bare !== 'undefined') {
        test(`${indexerCount} indexers: consensus retries a VDF process stopped before its first progress report`, { timeout: 120000 }, async t => {
            const network = await createConsensusNetwork(t, {
                indexerCount, nodeCount: indexerCount, timings: { epochBackoffDelay: 1000 },
            });
            const { default: subprocess } = await import('bare-subprocess');
            const { kill } = await import('bare-os');
            const subscribe = subprocess.Subprocess.prototype.on;
            let stoppedChild;
            const watch = sinon.stub(subprocess.Subprocess.prototype, 'on').callsFake(function (event, listener) {
                const result = subscribe.call(this, event, listener);
                if (event === 'exit' && !stoppedChild) {
                    stoppedChild = this;
                    kill(this.pid, 'SIGSTOP');
                }
                return result;
            });
            t.teardown(() => watch.restore(), { force: true });
            const calculate = sinon.spy(network.proposer.operations, 'calculateVDF');
            const build = sinon.spy(network.proposer.operations, 'createProofProposal');
            const append = sinon.spy(network.proposer.operations, 'appendSetEpoch');

            const execution = network.startRound();
            await waitFor('watchdog terminates the stopped VDF process', () => stoppedChild?.signalCode === 9);
            t.is(calculate.callCount, 1, 'recovery uses the existing backoff');
            t.absent(build.called, 'the stalled calculation produces no proof proposal');
            t.absent(append.called, 'the stalled calculation appends no epoch');
            t.is(await network.proposer.state.getCurrentEpoch(), 0n);

            await assertSignedEpoch(t, network);
            await waitFor('round completion after inactivity recovery', () => execution.completed);
            t.is(calculate.callCount, 2, 'a fresh process computed the replacement proof automatically');
            const proof = await calculate.secondCall.returnValue;
            t.ok(build.called && build.getCalls().every(call => call.args[2] === proof));
            t.ok(append.calledOnce);
            t.ok(stoppedChild.stdio.every(pipe => pipe.destroyed));
        });

        test(`${indexerCount} indexers: consensus recovers after SIGKILL of the proposer VDF process without publishing a failed proof`, async t => {
            const network = await createConsensusNetwork(t, {
                indexerCount, nodeCount: indexerCount, timings: { epochBackoffDelay: 1000 },
            });
            t.is(network.nodes.length, indexerCount);
            t.is((await network.proposer.state.getIndexersEntry()).length, indexerCount, 'signed membership matches the requested network size');
            const { default: subprocess } = await import('bare-subprocess');
            const subscribe = subprocess.Subprocess.prototype.on;
            let killedChild;
            const watch = sinon.stub(subprocess.Subprocess.prototype, 'on').callsFake(function (event, listener) {
                const result = subscribe.call(this, event, listener);
                if (event === 'exit' && !killedChild) {
                    killedChild = this;
                    // Kill after VDFBare attaches its handlers and sends the request.
                    setImmediate(() => this.kill('SIGKILL'));
                }
                return result;
            });
            t.teardown(() => watch.restore());
            const calculate = sinon.spy(network.proposer.operations, 'calculateVDF');
            const build = sinon.spy(network.proposer.operations, 'createProofProposal');
            const append = sinon.spy(network.proposer.operations, 'appendSetEpoch');

            const execution = network.startRound();
            await waitFor('VDF process killed', () => killedChild?.signalCode === 9);
            t.is(calculate.callCount, 1, 'the round is waiting before retrying');
            t.absent(build.called, 'a failed solve does not produce a proposal');
            t.absent(append.called, 'a failed solve does not append an epoch');
            t.is(await network.proposer.state.getCurrentEpoch(), 0n, 'the signed epoch is unchanged');

            await assertSignedEpoch(t, network);
            await waitFor('round completion after VDF recovery', () => execution.completed);
            t.is(calculate.callCount, 2, 'a fresh subprocess computed the replacement proof');
            const proof = await calculate.secondCall.returnValue;
            t.ok(build.called && build.getCalls().every(call => call.args[2] === proof), 'all proposals use the successful calculation');
            t.ok(append.calledOnce);
        });
    }
}
