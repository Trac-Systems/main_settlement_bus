import test from 'brittle';
import { StateEventQueue } from '../../../src/core/state/StateEventQueue.js';

test('StateEventQueue waits for the required signed view length', t => {
    const queue = new StateEventQueue();
    const published = [];

    queue.enqueue([{ type: 'config-changed' }], 10);
    queue.flush(9, (...event) => published.push(event));

    t.alike(published, []);

    queue.flush(10, (...event) => published.push(event));

    t.alike(published, [['config-changed']]);
});

test('StateEventQueue preserves event order and arguments', t => {
    const queue = new StateEventQueue();
    const published = [];

    queue.enqueue([
        { type: 'first', args: [1] },
        { type: 'second', args: [2] },
    ], 5);
    queue.flush(5, (...event) => published.push(event));

    t.alike(published, [
        ['first', 1],
        ['second', 2],
    ]);
});

test('StateEventQueue clears unpublished events', t => {
    const queue = new StateEventQueue();
    const published = [];

    queue.enqueue([{ type: 'config-changed' }], 5);
    queue.clear();
    queue.flush(5, (...event) => published.push(event));

    t.alike(published, []);
});
