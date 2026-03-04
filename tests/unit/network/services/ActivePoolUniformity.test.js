import { test } from 'brittle';
import ValidatorObserverService from '../../../../src/core/network/services/ValidatorObserverService.js';

test('ValidatorObserverService selection distribution is stable over large pool', t => {

    const service = new ValidatorObserverService(
        {}, {}, 'self',
        { enableValidatorObserver: true }
    );

    const N = 1000;
    const ITERATIONS = 200000;

    for (let i = 0; i < N; i++) {
        const buf = Buffer.from(i.toString(16).padStart(4, '0'), 'hex');
        service._addActiveWriter(buf);
    }

    const counts = new Array(N).fill(0);

    for (let i = 0; i < ITERATIONS; i++) {
        const selected = service._selectActiveWriter();
        const index = parseInt(selected.toString('hex'), 16);
        counts[index]++;
    }

    const expected = ITERATIONS / N;
    const total = counts.reduce((a, b) => a + b, 0);
    t.is(total, ITERATIONS);

    const avgDeviation =
        counts.reduce((sum, value) => sum + Math.abs(value - expected), 0) / N;
    t.ok(avgDeviation < expected * 0.15, `Average deviation too high: ${avgDeviation}`);

    const maxDeviation = Math.max(...counts.map(v => Math.abs(v - expected)));
    t.ok(maxDeviation < expected * 0.5, `Max deviation too high: ${maxDeviation}`);
});

test('Removing writer does not bias selection', t => {
    const service = new ValidatorObserverService(
        {}, {}, 'self',
        { enableValidatorObserver: true }
    );

    const writers = [
        Buffer.from('aa', 'hex'),
        Buffer.from('bb', 'hex'),
        Buffer.from('cc', 'hex'),
    ];

    writers.forEach(w => service._addActiveWriter(w));

    service._removeActiveWriter(writers[1]); // remove middle

    const ITERATIONS = 20000;
    let countA = 0;
    let countC = 0;

    for (let i = 0; i < ITERATIONS; i++) {
        const selected = service._selectActiveWriter();
        if (selected.equals(writers[0])) countA++;
        if (selected.equals(writers[2])) countC++;
    }

    const ratioA = countA / ITERATIONS;
    const ratioC = countC / ITERATIONS;

    t.ok(Math.abs(ratioA - 0.5) < 0.05);
    t.ok(Math.abs(ratioC - 0.5) < 0.05);
});

test('Adding the same writer multiple times does not duplicate in pool', t => {
    const service = new ValidatorObserverService({}, {}, 'self', { enableValidatorObserver: true });
    const w = Buffer.from('ff', 'hex');
    
    // Tenta flodar o array
    service._addActiveWriter(w);
    service._addActiveWriter(w);
    service._addActiveWriter(w);
    
    let count = 0;
    for (let i = 0; i < 1000; i++) {
        const selected = service._selectActiveWriter();
        if (selected && selected.equals(w)) count++;
    }
    t.is(count, 1000, 'Only one element should exist and be selected 100% of the time');
});

test('Removing the last element operates correctly without swapping', t => {
    const service = new ValidatorObserverService({}, {}, 'self', { enableValidatorObserver: true });
    const w1 = Buffer.from('11', 'hex');
    const w2 = Buffer.from('22', 'hex');
    
    service._addActiveWriter(w1);
    service._addActiveWriter(w2);
    
    service._removeActiveWriter(w2);
    
    const selected = service._selectActiveWriter();
    t.ok(selected && selected.equals(w1), 'Only w1 should remain in the pool');
});