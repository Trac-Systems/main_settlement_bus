import { test } from 'brittle';
import b4a from 'b4a';
import ValidatorObserverService from '../../../../src/core/network/services/ValidatorObserverService.js';

function addr(label) {
    return b4a.from(label.padEnd(32, '0'));
}

function assertUniformSelection(t, writers, iterations) {
    const service = new ValidatorObserverService({}, {}, 'self', { enableValidatorObserver: true });

    for (const w of writers) {
        service._addActiveWriter(w);
    }

    const counts = new Map();
    for (const w of writers) {
        counts.set(w.toString('hex'), 0);
    }

    for (let i = 0; i < iterations; i++) {
        const selected = service._selectActiveWriter();
        const hex = selected.toString('hex');
        counts.set(hex, counts.get(hex) + 1);
    }

    const expected = 1 / writers.length;
    const sigma = Math.sqrt(expected * (1 - expected) / iterations);
    const bound = 3 * sigma;

    for (const [hex, count] of counts.entries()) {
        const ratio = count / iterations;

        t.ok(
            Math.abs(ratio - expected) < bound,
            `Writer ${hex.slice(0,4)} ratio=${ratio}`
        );
    }
}

test('Active pool selection is approximately uniform across 5 validators', t => {
    const writers = ['A','B','C','D','E'].map(addr);
    assertUniformSelection(t, writers, 200000);
});

test('Active pool selection is approximately uniform across 26 validators (A-Z)', t => {
    const writers = [];
    for (let i = 65; i <= 90; i++) {
        writers.push(addr(String.fromCharCode(i)));
    }
    assertUniformSelection(t, writers, 500000);
});

test('Active pool selection handles 1000 validators without structural skew', t => {
    const service = new ValidatorObserverService({}, {}, 'self', { enableValidatorObserver: true });

    const writers = [];
    for (let i = 0; i < 1000; i++) {
        writers.push(addr(`W${i}`));
    }

    for (const w of writers) {
        service._addActiveWriter(w);
    }

    const ITERATIONS = 2_000_000;

    const counts = new Map();
    for (const w of writers) {
        counts.set(w.toString('hex'), 0);
    }

    for (let i = 0; i < ITERATIONS; i++) {
        const selected = service._selectActiveWriter();
        const hex = selected.toString('hex');

        counts.set(hex, counts.get(hex) + 1);
    }

    const values = Array.from(counts.values());

    const min = Math.min(...values);
    const max = Math.max(...values);

    t.ok(min > 0, 'No validator was starved');
    t.ok(max / min < 2, `Selection skew too high: max/min=${max/min}`);
});