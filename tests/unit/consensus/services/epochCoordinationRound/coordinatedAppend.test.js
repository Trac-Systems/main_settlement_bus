import {
    EpochAppenderSelectionPhase,
    EpochAppendOutcome,
} from '../../../../../src/core/consensus/epochAppenderSelection/epochAppenderSelectionState.js';
import test from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import {
    EpochAppenderSelector,
} from '../../../../../src/core/consensus/epochAppenderSelection/EpochAppenderSelector.js';
import { EpochCoordinationRound } from '../../../../../src/core/consensus/services/EpochCoordinationRound.js';
import { CustomEventType } from '../../../../../src/utils/constants.js';
import { CONFIG, makeState, makeOperations } from '../epochCoordinatorTestHelpers.js';
import { uint64ToBuffer } from '../../../../../src/utils/buffer.js';

async function setup(t, members = 1) {
    const clock = sinon.useFakeTimers();
    const state = makeState();
    const operations = makeOperations();
    const next = sinon.spy();
    const logger = { error: sinon.spy(), warn: sinon.spy() };
    const payloads = [];
    const writes = [];
    const publicKey = '01'.repeat(32);
    let outcome = EpochAppendOutcome.UNKNOWN;
    let selectionState;
    const snapshot = {
        networkId: 1, bootstrap: '0b'.repeat(32), targetEpoch: '6',
        parentHash: 'aa'.repeat(32), membershipContext: '0c'.repeat(32), configHash: '0d'.repeat(32),
        members: Array.from({ length: members }, (_, i) => ({
            writerKey: b4a.alloc(32, i + 1).toString('hex'),
            publicKey: b4a.alloc(32, i + 1).toString('hex'),
        })),
        currentWriterKeys: [state.writingKey.toString('hex')],
    };
    state.getEpochAppenderSelectionContext = async () => ({ ...snapshot });
    const selector = new EpochAppenderSelector(publicKey, {
        load: async () => selectionState, save: async value => { selectionState = value; },
        readContext: state.getEpochAppenderSelectionContext, readOutcome: async () => ({ status: outcome }),
        sendRequest: () => new Promise(() => {}),
    }, 100, CONFIG.epochSignatureTimeout);
    operations.appendSetEpoch.callsFake(async (payload, beforeAppend) => {
        await beforeAppend({ writerKey: state.writingKey.toString('hex'), from: writes.length });
        payloads.push(payload);
        return new Promise((resolve, reject) => writes.push({ resolve, reject }));
    });
    const rounds = [];
    t.teardown(async () => {
        await Promise.all(rounds.map(instance => instance.cancel()));
        for (const write of writes) write.resolve();
        await selector.close();
        clock.restore();
    });
    // The existing proof-building fixture normally uses a real address. VDF computation
    // is mocked here but challenge construction still needs its binary representation.
    const { testKeyPair1 } = await import('../../../../fixtures/apply.fixtures.js');
    const { WalletProvider } = await import('trac-wallet');
    const { config } = await import('../../../../helpers/config.js');
    const wallet = await new WalletProvider(config).fromSecretKey(testKeyPair1.secretKey);
    function createRound() {
        const instance = new EpochCoordinationRound({
            state, operations, config: CONFIG, wallet, manager: { connect: async () => {} },
            logger, intervalMs: CONFIG.epochInterval, appenderSelector: selector,
        });
        rounds.push(instance);
        return instance;
    }
    return {
        clock, state, operations, selector, createRound, next, logger, payloads, writes,
        setOutcome: value => { outcome = value; },
    };
}

test('coordinated FSM retries after election expiry and ignores a late append failure from the old term', async t => {
    const f = await setup(t);
    await f.createRound().run(f.next);
    await f.clock.tickAsync(0);
    t.is(f.writes.length, 1);
    await f.clock.tickAsync(CONFIG.epochSignatureTimeout);
    await f.clock.tickAsync(CONFIG.epochBackoffDelay);
    t.is(f.writes.length, 2, 'an expired selection permits a higher-term attempt without declaring the old append rejected');
    const current = f.selector.active.request.requestId;
    f.writes[0].reject(new Error('late failure from A'));
    await f.clock.tickAsync(1000);
    t.is(f.selector.active.request.requestId, current);
    t.is(f.writes.length, 2);
    t.is(f.next.callCount, 0);
});

test('coordinated FSM cancellation cannot let the next round bypass a pending publication', async t => {
    const f = await setup(t);
    const first = f.createRound();
    await first.run(f.next);
    await f.clock.tickAsync(0);
    await first.cancel();
    await f.createRound().run(f.next);
    t.is(f.writes.length, 1);
    t.is(f.selector.active.phase, EpochAppenderSelectionPhase.PUBLISHING);
    t.is(f.next.callCount, 1, 'new round reschedules while the node retains the reservation');
});

test('FSM cancellation while queued prevents a stale append from using the next selection', async t => {
    const f = await setup(t);
    const queue = Promise.withResolvers();
    let writes = 0;
    f.operations.appendSetEpoch.callsFake(async (_payload, beforeAppend) => {
        await queue.promise;
        await beforeAppend({ writerKey: f.state.writingKey.toString('hex'), from: 0 });
        writes++;
    });
    const round = f.createRound();
    await round.run(f.next);
    await f.clock.tickAsync(0);
    t.ok(f.operations.appendSetEpoch.calledOnce, 'the FSM owns the pending append operation');
    t.is(f.selector.active.phase, EpochAppenderSelectionPhase.HELD, 'selection is checked when the writer queue opens');

    await round.cancel();
    const nextRequest = await f.selector.createRequest(
        await f.state.getEpochAppenderSelectionContext(), b4a.from('next attempt')
    );
    queue.resolve();
    await f.clock.tickAsync(0);

    t.is(writes, 0, 'the old request cannot reach the writer');
    t.is(f.selector.active.request.requestId, nextRequest.requestId);
    t.is(f.selector.active.phase, EpochAppenderSelectionPhase.HELD, 'the new selection is untouched');
});

test('coordinated FSM does not accept speculative epoch events as finality', async t => {
    const f = await setup(t);
    await f.createRound().run(f.next);
    await f.clock.tickAsync(0);
    await f.state.emit(CustomEventType.EPOCH_CREATED, { epoch: uint64ToBuffer(6n), proposerAddress: 'peer' });
    t.is(f.next.callCount, 0);
    t.is(f.selector.active.phase, EpochAppenderSelectionPhase.PUBLISHING);
    f.state.getCurrentEpoch.resolves(6n);
    f.setOutcome(EpochAppendOutcome.EPOCH_ADVANCED);
    await f.clock.tickAsync(1000);
    t.is(f.next.callCount, 1);
    t.absent(f.selector.active);
});

test('coordinated FSM permits the explicitly agreed two-member solo fallback after silence', async t => {
    const f = await setup(t, 2);
    const round = f.createRound();
    const running = round.run(f.next);
    await f.clock.tickAsync(CONFIG.epochSignatureTimeout);
    t.is(f.writes.length, 1);
    t.is(f.selector.active.solo, true);
    await round.cancel();
    await running;
});

test('coordinated FSM never falls back to a solo append with three members', async t => {
    const f = await setup(t, 3);
    const round = f.createRound();
    const running = round.run(f.next);
    await f.clock.tickAsync(CONFIG.epochSignatureTimeout);
    t.is(f.writes.length, 0);
    t.is(f.operations.appendSetEpoch.callCount, 0);
    await f.clock.tickAsync(CONFIG.epochBackoffDelay);
    t.is(f.writes.length, 0);
    await round.cancel();
    await f.clock.tickAsync(0);
    await running;
});

test('an initialized round cannot append without its selector', async t => {
    const operations = makeOperations();
    const round = new EpochCoordinationRound({
        state: makeState(), operations,
        config: CONFIG,
        wallet: {}, manager: {}, logger: {}, intervalMs: 1000,
    });
    t.teardown(() => round.cancel());
    await t.exception(() => round.run(() => {}));
    t.is(operations.appendSetEpoch.callCount, 0);
});
