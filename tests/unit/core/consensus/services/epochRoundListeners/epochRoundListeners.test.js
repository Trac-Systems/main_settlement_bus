import test from 'brittle';
import sinon from 'sinon';
import { CustomEventType } from '../../../../../../src/utils/constants.js';
import { uint64ToBuffer } from '../../../../../../src/utils/buffer.js';
import { EPOCH_EVENTS, EPOCH_STATES } from '../../../../../../src/core/consensus/services/EpochStateMachine.js';
import { EpochRoundListeners } from '../../../../../../src/core/consensus/services/EpochRoundListeners.js';
import { CONFIG, drainMicrotasks, makeEmitter } from '../epochCoordinatorTestHelpers.js';

function makeMachine() {
    const lifecycle = makeEmitter();
    const transitionListeners = [];
    const sentEvents = [];
    const trace = [];
    let closing = false;

    const machine = {
        state: EPOCH_STATES.LOAD_EPOCH_CONTEXT,
        context: {
            currentEpoch: 5n,
            next: sinon.stub().callsFake(() => trace.push('next')),
        },
        on(event, handler) {
            if (event === '*') transitionListeners.push(handler);
            else lifecycle.on(event, handler);
            return machine;
        },
        once(event, handler) {
            lifecycle.once(event, handler);
            return machine;
        },
        appendContext: sinon.stub().callsFake(payload => Object.assign(machine.context, payload)),
        transition(next, prev = machine.state) {
            machine.state = next;
            for (const handler of [...transitionListeners]) handler({ next, prev });
        },
        transitionListenerCount() {
            return transitionListeners.length;
        },
        closeListenerCount() {
            return lifecycle.listenerCount('close');
        },
        shouldRun() {
            return !closing;
        },
        sentEvents,
        trace,
    };

    const transitions = {
        [EPOCH_STATES.COLLECT_APPROVALS]: {
            [EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED]: EPOCH_STATES.BACKOFF,
        },
        [EPOCH_STATES.APPEND_SET_EPOCH]: {
            [EPOCH_EVENTS.APPEND_FAILED]: EPOCH_STATES.BACKOFF,
            [EPOCH_EVENTS.APPEND_ACCEPTED]: EPOCH_STATES.SEND_APPEND_SIGNAL,
            [EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED]: EPOCH_STATES.RELOAD_SIGNED_CONTEXT,
        },
    };

    machine.send = sinon.stub().callsFake(async event => {
        if (closing) return false;
        sentEvents.push(event);
        const next = transitions[machine.state]?.[event];
        if (next) machine.transition(next);
        return Boolean(next);
    });

    machine.close = sinon.stub().callsFake(async () => {
        if (closing) return;
        closing = true;
        trace.push('close');
        transitionListeners.splice(0);
        await lifecycle.emit('close');
    });

    return machine;
}

function setup(overrides = {}) {
    const state = makeEmitter();
    const machine = makeMachine();
    const wallet = { address: 'trac1wallet' };
    const config = { ...CONFIG, ...(overrides.config ?? {}) };
    const intervalMs = overrides.intervalMs ?? CONFIG.epochInterval;
    const listeners = new EpochRoundListeners({
        state,
        machine,
        wallet,
        config,
        intervalMs,
        isRoundActive: () => machine.shouldRun(),
    });
    listeners.start();

    return { state, machine, wallet, config, intervalMs, listeners };
}

test('start registers round listeners and machine close removes them all', async t => {
    const { state, machine } = setup();

    t.is(state.listenerCount(CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS), 1);
    t.is(state.listenerCount(CustomEventType.EPOCH_CREATED), 1);
    t.is(machine.transitionListenerCount(), 1);
    t.is(machine.closeListenerCount(), 1);

    await machine.close();

    t.is(state.listenerCount(CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS), 0);
    t.is(state.listenerCount(CustomEventType.EPOCH_CREATED), 0);
    t.is(machine.transitionListenerCount(), 0);
    t.is(machine.closeListenerCount(), 0);
});

test('machine close cancels a pending signature timeout', async t => {
    const clock = sinon.useFakeTimers();
    try {
        const { machine } = setup({ config: { epochSignatureTimeout: 1000 } });
        machine.transition(EPOCH_STATES.COLLECT_APPROVALS);

        await machine.close();
        await drainMicrotasks();
        await clock.tickAsync(1100);

        t.ok(machine.close.calledOnce);
        t.alike(machine.sentEvents, []);
    } finally {
        clock.restore();
    }
});

test('remote proposal events update context only while the round is open', async t => {
    const { state, machine } = setup();

    await state.emit(CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS);
    t.is(machine.context.remoteProposalReceived, true);
    t.ok(machine.appendContext.calledOnce);

    await machine.close();
    await state.emit(CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS);
    t.ok(machine.appendContext.calledOnce);
});

test('global EPOCH_CREATED closes a non-append state before scheduling the captured interval', async t => {
    const { state, machine } = setup({
        config: { epochInterval: 9999 },
        intervalMs: 1234,
    });
    machine.state = EPOCH_STATES.COLLECT_APPROVALS;
    const originalClose = machine.close;
    t.teardown(async () => {
        machine.close = originalClose;
        await machine.close();
    });
    let resolveClose;
    machine.close = sinon.stub().callsFake(() => new Promise(resolve => {
        resolveClose = () => {
            machine.trace.push('closed');
            resolve();
        };
    }));

    const emitted = state.emit(CustomEventType.EPOCH_CREATED);
    await drainMicrotasks();
    t.absent(machine.context.next.called, 'scheduling waits for machine.close()');

    resolveClose();
    await emitted;

    t.alike(machine.trace, ['closed', 'next']);
    t.ok(machine.context.next.calledOnceWith(1234));
});

test('target EPOCH_CREATED from self is handled by the append listener without global close', async t => {
    const { state, machine, wallet } = setup();
    machine.transition(EPOCH_STATES.APPEND_SET_EPOCH);

    await state.emit(CustomEventType.EPOCH_CREATED, {
        epoch: uint64ToBuffer(6n),
        proposerAddress: wallet.address,
    });

    t.alike(machine.sentEvents, [EPOCH_EVENTS.APPEND_ACCEPTED]);
    t.absent(machine.close.called);
    t.absent(machine.context.next.called);
    await machine.close();
});

test('append listener maps peer targets and ignores unrelated epochs', async t => {
    const { state, machine } = setup();
    machine.transition(EPOCH_STATES.APPEND_SET_EPOCH);

    await state.emit(CustomEventType.EPOCH_CREATED, {
        epoch: uint64ToBuffer(99n),
        proposerAddress: 'trac1peer',
    });
    t.alike(machine.sentEvents, []);

    await state.emit(CustomEventType.EPOCH_CREATED, {
        epoch: uint64ToBuffer(6n),
        proposerAddress: 'trac1peer',
    });
    t.alike(machine.sentEvents, [EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED]);
    t.absent(machine.close.called);
    await machine.close();
});

test('signature timeout fires on deadline and is cancelled when collection ends', async t => {
    const clock = sinon.useFakeTimers();
    try {
        const first = setup({ config: { epochSignatureTimeout: 1000 } });
        first.machine.transition(EPOCH_STATES.COLLECT_APPROVALS);
        await clock.tickAsync(999);
        t.alike(first.machine.sentEvents, []);
        await clock.tickAsync(1);
        t.alike(first.machine.sentEvents, [EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED]);
        await first.machine.close();

        const second = setup({ config: { epochSignatureTimeout: 1000 } });
        second.machine.transition(EPOCH_STATES.COLLECT_APPROVALS);
        second.machine.transition(EPOCH_STATES.BUILD_SET_EPOCH);
        await clock.tickAsync(1100);
        t.alike(second.machine.sentEvents, []);
        await second.machine.close();
    } finally {
        clock.restore();
    }
});

test('append timeout fires on deadline and is cancelled when append state ends', async t => {
    const clock = sinon.useFakeTimers();
    try {
        const first = setup({ config: { epochAppendTimeout: 1000 } });
        first.machine.transition(EPOCH_STATES.APPEND_SET_EPOCH);
        await clock.tickAsync(999);
        t.alike(first.machine.sentEvents, []);
        await clock.tickAsync(1);
        t.alike(first.machine.sentEvents, [EPOCH_EVENTS.APPEND_FAILED]);
        await first.machine.close();

        const second = setup({ config: { epochAppendTimeout: 1000 } });
        second.machine.transition(EPOCH_STATES.APPEND_SET_EPOCH);
        t.is(second.state.listenerCount(CustomEventType.EPOCH_CREATED), 2);
        second.machine.transition(EPOCH_STATES.BACKOFF);
        t.is(second.state.listenerCount(CustomEventType.EPOCH_CREATED), 1);
        await clock.tickAsync(1100);
        t.alike(second.machine.sentEvents, []);
        await second.machine.close();
    } finally {
        clock.restore();
    }
});

test('machine close in append state removes the target listener and cancels its timeout', async t => {
    const clock = sinon.useFakeTimers();
    try {
        const { state, machine } = setup({ config: { epochAppendTimeout: 1000 } });
        machine.transition(EPOCH_STATES.APPEND_SET_EPOCH);
        t.is(state.listenerCount(CustomEventType.EPOCH_CREATED), 2);

        await machine.close();
        await clock.tickAsync(1100);

        t.is(state.listenerCount(CustomEventType.EPOCH_CREATED), 0);
        t.alike(machine.sentEvents, []);
    } finally {
        clock.restore();
    }
});

test('global EPOCH_CREATED cancels the stale collection timeout', async t => {
    const clock = sinon.useFakeTimers();
    try {
        const { state, machine } = setup({ config: { epochSignatureTimeout: 1000 } });
        machine.transition(EPOCH_STATES.COLLECT_APPROVALS);

        await state.emit(CustomEventType.EPOCH_CREATED);
        await clock.tickAsync(1100);

        t.ok(machine.context.next.calledOnce);
        t.alike(machine.sentEvents, []);
    } finally {
        clock.restore();
    }
});
