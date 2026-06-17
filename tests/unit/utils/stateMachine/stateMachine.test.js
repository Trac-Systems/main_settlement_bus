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

// --- can ---

test('can returns true for a valid event in the current state', t => {
    const sm = makeMachine();
    t.ok(sm.can(EVENTS.START));
});

test('can returns false for an invalid event in the current state', t => {
    const sm = makeMachine();
    t.absent(sm.can(EVENTS.FINISH));
});

test('can returns false for unknown event', t => {
    const sm = makeMachine();
    t.absent(sm.can('NO_SUCH_EVENT'));
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

test('send returns transition object with prev, next, context', async t => {
    const sm = makeMachine();
    const result = await sm.send(EVENTS.START, { epoch: 1 });
    t.alike(result, { prev: STATES.IDLE, next: STATES.RUNNING, context: { epoch: 1 } });
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
