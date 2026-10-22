import test from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import { CustomEventType } from '../../../../../src/utils/constants.js';
import { uint64ToBuffer } from '../../../../../src/utils/buffer.js';
import { EPOCH_EVENTS, EPOCH_STATES } from '../../../../../src/core/consensus/services/EpochStateMachine.js';
import { EpochRoundListeners } from '../../../../../src/core/consensus/services/EpochRoundListeners.js';
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
            currentEpochHash: b4a.alloc(32, 0xaa),
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

function proposalEvent(epoch = 6n, previousHash = b4a.alloc(32, 0xaa)) {
    return { proofProposal: { epoch: uint64ToBuffer(epoch), previous_epoch_record_hash: previousHash } };
}

function setup(overrides = {}) {
    const state = overrides.state ?? makeEmitter();
    const machine = makeMachine();
    const config = { ...CONFIG, ...(overrides.config ?? {}) };
    const onEpochProgress = sinon.stub().resolves();
    const listeners = new EpochRoundListeners({
        state,
        machine,
        config,
        isRoundActive: () => machine.shouldRun(),
        onEpochProgress,
    });
    listeners.start();

    return { state, machine, config, listeners, onEpochProgress };
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

    await state.emit(CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS, proposalEvent());
    t.is(machine.context.remoteProposalReceived, true);
    t.ok(machine.appendContext.calledOnce);

    await machine.close();
    await state.emit(CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS, proposalEvent());
    t.ok(machine.appendContext.calledOnce);
});

for (const [name, event] of [
    ['previous epoch', proposalEvent(5n)],
    ['future epoch', proposalEvent(7n)],
    ['different parent', proposalEvent(6n, b4a.alloc(32, 0xbb))],
    ['missing payload', undefined],
    ['missing proposal', {}],
    ['invalid epoch buffer', { proofProposal: { epoch: b4a.alloc(7) } }],
    ['missing parent hash', { proofProposal: { epoch: uint64ToBuffer(6n) } }],
]) {
    test(`validation success with ${name} does not affect the active round`, async t => {
        const { state, machine } = setup();
        t.teardown(() => machine.close());

        await state.emit(CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS, event);

        t.absent(machine.context.remoteProposalReceived);
        t.absent(machine.appendContext.called);
        t.alike(machine.sentEvents, []);
    });
}

test('validation success is ignored before the round has loaded its epoch context', async t => {
    const { state, machine } = setup();
    t.teardown(() => machine.close());
    delete machine.context.currentEpoch;
    delete machine.context.currentEpochHash;

    await state.emit(CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS, proposalEvent());

    t.absent(machine.appendContext.called);
});

for (const sameEpoch of [false, true]) {
    test(`late validation ${sameEpoch ? 'still applies to a retry of the same epoch' : 'cannot affect a round for the next epoch'}`, async t => {
        const old = setup();
        await old.machine.close();
        const current = setup({ state: old.state });
        t.teardown(() => current.machine.close());
        if (!sameEpoch) {
            current.machine.context.currentEpoch = 6n;
            current.machine.context.currentEpochHash = b4a.alloc(32, 0xbb);
        }

        await old.state.emit(CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS, proposalEvent());

        t.absent(old.machine.appendContext.called, 'the closed round has no listener');
        t.is(current.machine.context.remoteProposalReceived === true, sameEpoch);
        t.is(old.state.listenerCount(CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS), 1);
    });
}

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

test('machine close in append state removes the epoch progress listener', async t => {
    const clock = sinon.useFakeTimers();
    try {
        const { state, machine } = setup({ config: { epochAppendTimeout: 1000 } });
        machine.transition(EPOCH_STATES.APPEND_SET_EPOCH);
        t.is(state.listenerCount(CustomEventType.EPOCH_CREATED), 1);

        await machine.close();
        await clock.tickAsync(1100);

        t.is(state.listenerCount(CustomEventType.EPOCH_CREATED), 0);
        t.alike(machine.sentEvents, []);
    } finally {
        clock.restore();
    }
});

test('round completion after signed progress cancels the collection timeout', async t => {
    const clock = sinon.useFakeTimers();
    try {
        const { state, machine, onEpochProgress } = setup({ config: { epochSignatureTimeout: 1000 } });
        onEpochProgress.callsFake(() => machine.close());
        machine.transition(EPOCH_STATES.COLLECT_APPROVALS);

        await state.emit(CustomEventType.EPOCH_CREATED);
        await clock.tickAsync(1100);

        t.ok(onEpochProgress.calledOnce);
        t.ok(machine.close.calledOnce);
        t.alike(machine.sentEvents, []);
    } finally {
        clock.restore();
    }
});

for (const phase of [EPOCH_STATES.COLLECT_APPROVALS, EPOCH_STATES.APPEND_SET_EPOCH, EPOCH_STATES.WAIT_FOR_APPEND_OUTCOME]) {
    test(`EPOCH_CREATED delegates signed progress verification in ${phase}`, async t => {
        const { state, machine, onEpochProgress } = setup();
        t.teardown(() => machine.close());
        machine.transition(phase);

        await state.emit(CustomEventType.EPOCH_CREATED, { epoch: uint64ToBuffer(6n), proposerAddress: 'trac1peer' });

        t.ok(onEpochProgress.calledOnceWithExactly());
        t.absent(machine.close.called, 'the round decides whether signed progress finishes it');
        t.absent(machine.context.next.called);
        t.alike(machine.sentEvents, []);
    });
}

test('EPOCH_CREATED awaits the round progress check and ignores events after close', async t => {
    const { state, machine, onEpochProgress } = setup();
    const progress = Promise.withResolvers();
    t.teardown(async () => {
        progress.resolve();
        await machine.close();
    });
    onEpochProgress.returns(progress.promise);
    let finished = false;
    const emitted = state.emit(CustomEventType.EPOCH_CREATED).then(() => { finished = true; });
    await drainMicrotasks();
    t.absent(finished);
    progress.resolve();
    await emitted;
    t.ok(finished);

    await machine.close();
    await state.emit(CustomEventType.EPOCH_CREATED);
    t.ok(onEpochProgress.calledOnce);
});

test('append states keep one epoch listener and do not start a legacy append deadline', async t => {
    const clock = sinon.useFakeTimers();
    const { state, machine } = setup();
    try {
        machine.transition(EPOCH_STATES.APPEND_SET_EPOCH);
        machine.transition(EPOCH_STATES.WAIT_FOR_APPEND_OUTCOME);
        t.is(state.listenerCount(CustomEventType.EPOCH_CREATED), 1);
        await clock.tickAsync(CONFIG.epochAppendTimeout + 1);
        t.alike(machine.sentEvents, []);
        t.absent(machine.context.next.called);
    } finally {
        await machine.close();
        clock.restore();
    }
});
