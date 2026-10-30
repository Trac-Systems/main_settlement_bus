import test from 'brittle';
import sinon from 'sinon';
import { VDFProgressWatchdog, VDF_PROGRESS_PHASES } from '../../../../src/core/consensus/services/VDFProgressWatchdog.js';

function setup(t) {
    const clock = sinon.useFakeTimers();
    const onStall = sinon.spy();
    const watchdog = new VDFProgressWatchdog({ now: () => Date.now(), onStall });
    t.teardown(() => { watchdog.stop(); clock.restore(); }, { force: true });
    const counts = VDF_PROGRESS_PHASES.map(() => '0');
    return { clock, onStall, watchdog, counts };
}

test('VDF watchdog allows sparse discriminant progress after fast initial reports', t => {
    const { clock, onStall, watchdog, counts } = setup(t);
    watchdog.ready();
    clock.tick(100);
    counts[0] = '128';
    watchdog.progress(counts);
    clock.tick(100);
    counts[1] = '1';
    watchdog.progress(counts);

    // Candidate checks can take much longer than the sieve or earlier candidates.
    // Fast reports must not reduce the inactivity allowance to two seconds.
    clock.tick(3000);
    t.absent(onStall.called, 'a slow candidate is allowed to finish');
    counts[1] = '2';
    watchdog.progress(counts);
    clock.tick(10_000);
    t.absent(onStall.called, 'later candidates can be slower still');
    counts[1] = '3';
    watchdog.progress(counts);
    clock.tick(79_999);
    t.absent(onStall.called, 'the allowance grows with observed work intervals');
    clock.tick(1);
    t.ok(onStall.calledOnce, 'a truly stalled candidate still fails');
    t.is(onStall.firstCall.args[0].code, 'VDF_STALLED');
    t.ok(onStall.firstCall.args[0].message.includes('discriminant-candidates'));
});

test('VDF watchdog allows a slower phase after frequent squaring reports', t => {
    const { clock, onStall, watchdog, counts } = setup(t);
    for (let i = 1; i <= 10; i++) {
        clock.tick(100);
        counts[2] = String(i * 128);
        watchdog.progress(counts);
    }
    clock.tick(5000);
    t.absent(onStall.called, 'fast squaring does not impose its pace on prime generation');
    counts[3] = '1';
    watchdog.progress(counts);
    clock.tick(39_999);
    t.absent(onStall.called);
    clock.tick(1);
    t.ok(onStall.calledOnce);
});

test('VDF watchdog allows continuous progress beyond the startup allowance', t => {
    const { clock, onStall, watchdog, counts } = setup(t);
    for (let i = 1; i <= 1000; i++) {
        clock.tick(100);
        counts[2] = String(i * 128);
        watchdog.progress(counts);
    }
    t.absent(onStall.called, '100 seconds of real work has no overall deadline');
    clock.tick(29_999);
    t.absent(onStall.called, 'fast progress retains the minimum inactivity allowance');
    clock.tick(1);
    t.ok(onStall.calledOnce);
    t.is(onStall.firstCall.args[0].code, 'VDF_STALLED');
});

test('VDF watchdog learns slower progress and accepts new phases', t => {
    const { clock, onStall, watchdog, counts } = setup(t);
    clock.tick(3000);
    counts[0] = '128';
    watchdog.progress(counts);
    clock.tick(4000);
    counts[1] = '1';
    watchdog.progress(counts);
    clock.tick(31_999);
    t.absent(onStall.called);
    clock.tick(1);
    t.ok(onStall.calledOnce, 'silence limit follows observed pace (8 × 4 seconds)');
});

test('VDF watchdog ignores duplicate reports and rejects counter regressions', t => {
    const { clock, onStall, watchdog, counts } = setup(t);
    clock.tick(100);
    counts[2] = '128';
    watchdog.progress(counts);
    for (let i = 0; i < 299; i++) {
        clock.tick(100);
        watchdog.progress(counts);
    }
    t.absent(onStall.called);
    const backwards = [...counts];
    backwards[2] = '127';
    t.exception(() => watchdog.progress(backwards), /backwards/);
    t.exception(() => watchdog.progress([]), /Invalid/);
    clock.tick(100);
    t.ok(onStall.calledOnce, 'a responsive guardian cannot hide a frozen solver');
});

test('VDF watchdog detects a worker that never starts and clears completed timers', t => {
    const { clock, onStall, watchdog } = setup(t);
    clock.tick(30_000);
    t.ok(onStall.calledOnce);
    watchdog.stop();
    const finished = new VDFProgressWatchdog({ now: () => Date.now(), onStall });
    finished.stop();
    clock.tick(1_000_000);
    t.ok(onStall.calledOnce, 'completion/cancellation leaves no live timeout');
});

test('VDF watchdog separates guardian startup from computation and ignores repeated ready messages', t => {
    const { clock, onStall, watchdog, counts } = setup(t);
    clock.tick(10_000);
    watchdog.ready();
    clock.tick(100);
    counts[0] = '128';
    watchdog.progress(counts);
    clock.tick(29_900);
    watchdog.ready();
    t.absent(onStall.called);
    clock.tick(100);
    t.ok(onStall.calledOnce, 'ready neither extends inactivity nor inflates the measured solve interval');
});
