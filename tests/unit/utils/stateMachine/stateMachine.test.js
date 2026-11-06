import test from 'brittle';
import { StateMachine } from '../../../../src/utils/StateMachine.js';

const STATES = { IDLE: 'IDLE', RUNNING: 'RUNNING', DONE: 'DONE' };
const EVENTS = { START: 'START', FINISH: 'FINISH', RESET: 'RESET' };

const makeTransitions = () => ({
    [STATES.IDLE]: { [EVENTS.START]: STATES.RUNNING },
    [STATES.RUNNING]: {
        [EVENTS.FINISH]: STATES.DONE,
        [EVENTS.RESET]: STATES.IDLE,
    },
    [STATES.DONE]: { [EVENTS.RESET]: STATES.IDLE },
});

const makeMachine = (discardState = STATES.IDLE) =>
    new StateMachine(makeTransitions(), STATES.IDLE, discardState);

// --- constructor ---

test('constructor throws with message if transitions is missing', t => {
    t.exception(
        () => new StateMachine(null, STATES.IDLE, STATES.IDLE),
        /transitions is required/
    );
});

test('constructor throws with message if initialState is missing', t => {
    t.exception(
        () => new StateMachine(makeTransitions(), null, STATES.IDLE),
        /initialState is required/
    );
});

test('constructor throws with message if discardState is undefined', t => {
    t.exception(
        () => new StateMachine(makeTransitions(), STATES.IDLE, undefined),
        /discardState is required/
    );
});

test('constructor accepts null discardState to disable context clearing', t => {
    t.execution(() => new StateMachine(makeTransitions(), STATES.IDLE, null));
});

test('constructor sets initial state', t => {
    const sm = makeMachine();
    t.is(sm.state, STATES.IDLE);
});

test('constructor starts with empty context', t => {
    const sm = makeMachine();
    t.alike(sm.context, {});
});

// --- appendContext ---

test('appendContext merges payload into context', t => {
    const sm = makeMachine();
    sm.appendContext({ a: 1 });
    sm.appendContext({ b: 2 });
    t.alike(sm.context, { a: 1, b: 2 });
});

test('appendContext returns the merged context', t => {
    const sm = makeMachine();
    const result = sm.appendContext({ x: 42 });
    t.alike(result, { x: 42 });
});

test('appendContext with no argument does not throw', t => {
    const sm = makeMachine();
    sm.appendContext();
    t.alike(sm.context, {});
});

test('shouldRun reflects the ReadyResource close lifecycle', async t => {
    const sm = makeMachine();
    t.ok(sm.shouldRun());

    const closing = sm.close();
    t.absent(sm.shouldRun());

    await closing;
    t.absent(sm.shouldRun());
});

// --- send ---

test('send returns false for an invalid event', async t => {
    const sm = makeMachine();
    const result = await sm.send(EVENTS.FINISH);
    t.is(result, false);
});

test('send transitions to the next state', async t => {
    const sm = makeMachine();
    await sm.send(EVENTS.START);
    t.is(sm.state, STATES.RUNNING);
});

test('send returns transition object with machine, prev, next, and context', async t => {
    const sm = makeMachine();
    const result = await sm.send(EVENTS.START, { epoch: 1 });
    t.is(result.machine, sm);
    t.alike(
        result,
        { machine: sm, prev: STATES.IDLE, next: STATES.RUNNING, context: { epoch: 1 } }
    );
});

test('send merges payload into context', async t => {
    const sm = makeMachine();
    await sm.send(EVENTS.START, { a: 1 });
    t.is(sm.context.a, 1);
});

test('send with no payload does not throw', async t => {
    const sm = makeMachine();
    await t.execution(sm.send(EVENTS.START));
});

test('send does not change state on invalid event', async t => {
    const sm = makeMachine();
    await sm.send(EVENTS.FINISH);
    t.is(sm.state, STATES.IDLE);
});

test('send does not start a transition while closing or closed', async t => {
    let handlerCalled = false;
    const sm = new StateMachine(makeTransitions(), STATES.IDLE, STATES.IDLE, {
        [STATES.RUNNING]: async () => { handlerCalled = true; },
    });

    const closing = sm.close();
    t.is(await sm.send(EVENTS.START), false);
    t.is(sm.state, STATES.IDLE);
    t.absent(handlerCalled);

    await closing;
    t.is(await sm.send(EVENTS.START), false);
});

test('send does not dispatch the target handler when closing starts during event emission', async t => {
    let handlerCalled = false;
    const sm = new StateMachine(makeTransitions(), STATES.IDLE, STATES.IDLE, {
        [STATES.RUNNING]: async () => { handlerCalled = true; },
    });
    sm.on(EVENTS.START, () => sm.close());

    t.is(await sm.send(EVENTS.START), false);
    t.is(sm.state, STATES.RUNNING);
    t.absent(handlerCalled);
});

test('enter does not dispatch the initial handler while closing or closed', async t => {
    let handlerCalled = false;
    const sm = new StateMachine(makeTransitions(), STATES.IDLE, STATES.IDLE, {
        [STATES.IDLE]: async () => { handlerCalled = true; },
    });

    const closing = sm.close();
    t.is(await sm.enter(), false);
    t.absent(handlerCalled);

    await closing;
    t.is(await sm.enter(), false);
});

// --- discardState ---

test('context is cleared when entering discardState', async t => {
    const sm = new StateMachine(makeTransitions(), STATES.IDLE, STATES.IDLE);
    await sm.send(EVENTS.START, { epoch: 5 });
    await sm.send(EVENTS.RESET);
    t.alike(sm.context, {});
});

test('context is not cleared when discardState is not reached', async t => {
    const sm = new StateMachine(makeTransitions(), STATES.IDLE, STATES.DONE);
    await sm.send(EVENTS.START, { epoch: 5 });
    await sm.send(EVENTS.RESET);
    t.alike(sm.context, { epoch: 5 });
});

test('context is never cleared when discardState is null', async t => {
    const sm = new StateMachine(makeTransitions(), STATES.IDLE, null);
    await sm.send(EVENTS.START, { epoch: 9 });
    await sm.send(EVENTS.FINISH);
    await sm.send(EVENTS.RESET);
    t.alike(sm.context, { epoch: 9 });
});

test('context is preserved in the returned transition even after discard', async t => {
    const sm = new StateMachine(makeTransitions(), STATES.IDLE, STATES.IDLE);
    await sm.send(EVENTS.START, { epoch: 7 });
    const result = await sm.send(EVENTS.RESET);
    t.alike(result.context, { epoch: 7 });
});

// --- on / listeners ---

test('on registers a listener called on matching event', async t => {
    const sm = makeMachine();
    let called = false;
    sm.on(EVENTS.START, () => { called = true; });
    await sm.send(EVENTS.START);
    t.ok(called);
});

test('listener receives prev, next, context', async t => {
    const sm = makeMachine();
    let data;
    sm.on(EVENTS.START, d => { data = d; });
    await sm.send(EVENTS.START, { foo: 'bar' });
    t.is(data.prev, STATES.IDLE);
    t.is(data.next, STATES.RUNNING);
    t.alike(data.context, { foo: 'bar' });
});

test('listener is not called for a different event', async t => {
    const sm = makeMachine();
    let called = false;
    sm.on(EVENTS.FINISH, () => { called = true; });
    await sm.send(EVENTS.START);
    t.absent(called);
});

test('multiple listeners on the same event are all called', async t => {
    const sm = makeMachine();
    let count = 0;
    sm.on(EVENTS.START, () => count++);
    sm.on(EVENTS.START, () => count++);
    await sm.send(EVENTS.START);
    t.is(count, 2);
});

test('on returns this for chaining', t => {
    const sm = makeMachine();
    t.is(sm.on(EVENTS.START, () => {}), sm);
});

// --- wildcard listener ---

test('wildcard listener is called for any event', async t => {
    const sm = makeMachine();
    const events = [];
    sm.on('*', ({ event }) => events.push(event));
    await sm.send(EVENTS.START);
    await sm.send(EVENTS.RESET);
    t.alike(events, [EVENTS.START, EVENTS.RESET]);
});

test('wildcard listener receives event name alongside transition data', async t => {
    const sm = makeMachine();
    let data;
    sm.on('*', d => { data = d; });
    await sm.send(EVENTS.START, { n: 3 });
    t.is(data.event, EVENTS.START);
    t.is(data.prev, STATES.IDLE);
    t.is(data.next, STATES.RUNNING);
    t.alike(data.context, { n: 3 });
});

test('async listeners are awaited before send resolves', async t => {
    const sm = makeMachine();
    const order = [];
    sm.on(EVENTS.START, async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        order.push('listener');
    });
    await sm.send(EVENTS.START);
    order.push('after-send');
    t.alike(order, ['listener', 'after-send']);
});

for (const listenerEvent of [EVENTS.START, '*']) {
    test(`a transition from a ${listenerEvent} listener supersedes the old handler and remaining listeners`, async t => {
        const handled = [];
        const notified = [];
        const sm = new StateMachine(makeTransitions(), STATES.IDLE, null, {
            [STATES.RUNNING]: () => handled.push(STATES.RUNNING),
            [STATES.DONE]: () => handled.push(STATES.DONE),
        });
        t.teardown(() => sm.close());
        sm.on(listenerEvent, async ({ next }) => {
            if (next === STATES.RUNNING) await sm.send(EVENTS.FINISH);
        });
        sm.on(listenerEvent, ({ next }) => notified.push(next));

        t.is(await sm.send(EVENTS.START), false);
        t.is(sm.state, STATES.DONE);
        t.alike(handled, [STATES.DONE], 'the previous handler cannot run in the new state');
        t.alike(notified, listenerEvent === '*' ? [STATES.DONE] : [], 'stale listeners cannot start timers for an abandoned transition');
    });
}

test('returning to the same state does not revive an earlier transition waiting on a listener', async t => {
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const handled = [];
    const sm = new StateMachine(makeTransitions(), STATES.IDLE, STATES.IDLE, {
        [STATES.RUNNING]: context => handled.push(context.attempt),
    });
    t.teardown(async () => {
        release.resolve();
        await sm.close();
    });
    let first = true;
    sm.on(EVENTS.START, async () => {
        if (!first) return;
        first = false;
        entered.resolve();
        await release.promise;
    });

    const previous = sm.send(EVENTS.START, { attempt: 'previous' });
    await entered.promise;
    await sm.send(EVENTS.RESET);
    await sm.send(EVENTS.START, { attempt: 'current' });
    release.resolve();

    t.is(await previous, false);
    t.is(sm.state, STATES.RUNNING);
    t.alike(handled, ['current'], 'only the current entry into RUNNING executes its handler');
    t.is(sm.context.attempt, 'current');
});

test('a superseded transition to the discard state does not clear the new context', async t => {
    let idleCalls = 0;
    const sm = new StateMachine(makeTransitions(), STATES.IDLE, STATES.IDLE, {
        [STATES.IDLE]: () => { idleCalls++; },
    });
    t.teardown(() => sm.close());
    await sm.send(EVENTS.START, { attempt: 'previous' });
    sm.on(EVENTS.RESET, () => sm.send(EVENTS.START, { attempt: 'current' }));

    t.is(await sm.send(EVENTS.RESET), false);
    t.is(sm.state, STATES.RUNNING);
    t.is(sm.context.attempt, 'current');
    t.is(idleCalls, 0);
});

test('a transition during ENTER does not dispatch a handler twice', async t => {
    const handled = [];
    const sm = new StateMachine(makeTransitions(), STATES.IDLE, null, {
        [STATES.IDLE]: () => handled.push(STATES.IDLE),
        [STATES.RUNNING]: () => handled.push(STATES.RUNNING),
    });
    t.teardown(() => sm.close());
    sm.on('ENTER', () => sm.send(EVENTS.START));

    t.is(await sm.enter(), false);
    t.is(sm.state, STATES.RUNNING);
    t.alike(handled, [STATES.RUNNING]);
});

test('a handler can await another transition without blocking it', async t => {
    const handled = [];
    const sm = new StateMachine(makeTransitions(), STATES.IDLE, null, {
        [STATES.RUNNING]: async (_context, machine) => {
            handled.push(STATES.RUNNING);
            const transition = await machine.send(EVENTS.FINISH);
            t.is(transition.next, STATES.DONE);
            handled.push('resumed');
        },
        [STATES.DONE]: () => handled.push(STATES.DONE),
    });
    t.teardown(() => sm.close());

    const transition = await sm.send(EVENTS.START);
    t.is(transition.next, STATES.RUNNING);
    t.is(sm.state, STATES.DONE);
    t.alike(handled, [STATES.RUNNING, STATES.DONE, 'resumed']);
});

test('an invalid event during emission does not supersede the active transition', async t => {
    let calls = 0;
    const sm = new StateMachine(makeTransitions(), STATES.IDLE, null, {
        [STATES.RUNNING]: () => { calls++; },
    });
    t.teardown(() => sm.close());
    sm.on(EVENTS.START, () => sm.send('UNSUPPORTED'));

    const transition = await sm.send(EVENTS.START);
    t.is(transition.next, STATES.RUNNING);
    t.is(calls, 1);
});
