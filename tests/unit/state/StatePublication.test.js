import { test } from 'brittle';
import sinon from 'sinon';
import esmock from 'esmock';
import { overrideConfig } from '../../helpers/config.js';
import Corestore from 'corestore';
import remote from 'hypercore/lib/fully-remote-proof.js';

async function createState({ proof = async () => Buffer.from('proof'), ready = async () => {}, get = async () => Buffer.from('block') } = {}) {
    const snapshots = [];
    let length = 0;
    const base = {
        view: { core: { signedLength: 10, length: 12 } },
        append: sinon.stub().callsFake(async batch => (length += batch.length)),
        local: {
            snapshot: () => {
                const snapshot = { ready, get, close: sinon.stub().resolves() };
                snapshots.push(snapshot);
                return snapshot;
            }
        }
    };
    const State = await esmock('../../../src/core/state/State.js', {
        autobase: function () { return base; },
        'hypercore/lib/fully-remote-proof.js': { proof }
    });
    const config = overrideConfig({});
    return { state: new State(null, null, config), base, snapshots, config };
}

test('State publication proof wait releases the write lock and ends at its deadline', async t => {
    let finishProof;
    const proof = sinon.stub().returns(new Promise(resolve => { finishProof = resolve; }));
    const { state, base, snapshots, config } = await createState({ proof });
    const clock = sinon.useFakeTimers({ now: 1 });
    try {
        const pending = state.appendWithProofOfPublication([Buffer.from('a')], ['hash-a']);
        await clock.tickAsync(1);
        t.is(proof.callCount, 1);
        t.is(await state.append([Buffer.from('b')]), 2, 'next write proceeds while the first proof is waiting');
        await clock.tickAsync(config.txCommitTimeout + 1);
        const receipts = await pending;
        t.is(base.append.callCount, 2);
        t.is(receipts[0].proof, null);
        t.ok(receipts[0].proofError.includes('timed out'));
        t.is(receipts[0].blockNumber, 0);
        t.ok(receipts[0].timestamp instanceof Date, 'receipt still records the completed append');
        t.is(snapshots[0].close.callCount, 1);
        finishProof(Buffer.from('late-proof'));
        await clock.tickAsync(1);
        t.is(receipts[0].proof, null, 'late proof completion does not mutate a returned receipt');
    } finally {
        finishProof(Buffer.from('late-proof'));
        clock.restore();
    }
});

test('State publication times out snapshot initialization without blocking later writes', async t => {
    let finishReady;
    const { state, snapshots, config } = await createState({ ready: () => new Promise(resolve => { finishReady = resolve; }) });
    const clock = sinon.useFakeTimers({ now: 1 });
    try {
        const pending = state.appendWithProofOfPublication([Buffer.from('a')], ['hash-a']);
        await clock.tickAsync(config.txCommitTimeout + 1);
        const receipts = await pending;
        t.is(receipts[0].proof, null);
        t.ok(receipts[0].proofError.includes('timed out'));
        t.is(snapshots[0].close.callCount, 1);
        t.is(await state.append([Buffer.from('b')]), 2);
    } finally {
        finishReady?.();
        clock.restore();
    }
});

test('State publication isolates block read failures within a batch', async t => {
    const get = sinon.stub();
    get.onFirstCall().rejects(new Error('read failed'));
    get.onSecondCall().resolves(Buffer.from('block'));
    const { state, snapshots } = await createState({ get });
    const receipts = await state.appendWithProofOfPublication([Buffer.from('a'), Buffer.from('b')], ['hash-a', 'hash-b']);
    t.is(receipts[0].proof, null);
    t.ok(receipts[0].proofError.includes('read failed'));
    t.alike(receipts[1].proof, Buffer.from('proof'));
    t.is(receipts[1].blockNumber, 1);
    t.is(snapshots[0].close.callCount, 1);
});

test('State keeps writes serialized during a stalled append and reports progress details', async t => {
    const { state, base, config } = await createState();
    const clock = sinon.useFakeTimers({ now: 1 });
    const log = sinon.stub(console, 'error');
    let finishAppend;
    base.append.onFirstCall().returns(new Promise(resolve => { finishAppend = resolve; }));
    try {
        const first = state.append([Buffer.from('a')]);
        const second = state.append([Buffer.from('b')]);
        await clock.tickAsync(config.messageValidatorResponseTimeout + 1);
        t.is(base.append.callCount, 1, 'a timeout never starts a concurrent database write');
        t.is(log.firstCall.args[0], 'State: append still pending');
        t.is(log.firstCall.args[1].signedLength, 10);
        t.is(log.firstCall.args[1].unsignedLength, 12);
        t.is(log.firstCall.args[1].queuedWrites, 1);
        finishAppend(1);
        await clock.tickAsync(1);
        await first;
        await second;
        t.is(base.append.callCount, 2);
    } finally {
        finishAppend?.(1);
        log.restore();
        clock.restore();
    }
});

test('State publication proof remains valid when another write follows on the same core', async t => {
    const store = new Corestore(await t.tmp());
    t.teardown(() => store.close());
    const core = store.get({ name: 'publication-ordering' });
    await core.ready();
    const base = {
        local: core,
        view: { core },
        append: async batch => { await core.append(batch); return core.length; }
    };
    const State = await esmock('../../../src/core/state/State.js', {
        autobase: function () { return base; }
    });
    const state = new State(null, null, overrideConfig({}));
    const original = Buffer.from('original-transaction');
    const [receipts] = await Promise.all([
        state.appendWithProofOfPublication([original], ['hash-a']),
        state.append([Buffer.from('next-transaction')])
    ]);

    t.is(core.length, 2);
    t.ok(receipts[0].proof, 'actual Hypercore proof was generated');
    const verified = await remote.verify(store.storage, receipts[0].proof);
    t.ok(verified, 'proof verifies against the real storage and signatures');
    t.alike(verified?.block.value, original, 'proof still refers to the original transaction');
    t.is(receipts[0].blockNumber, 0);
});
