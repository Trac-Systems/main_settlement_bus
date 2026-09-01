import test from 'brittle';
import sinon from 'sinon';
import Scheduler from '../../../../src/utils/scheduler/Scheduler.js';

const deferred = () => {
    let resolve;
    const promise = new Promise(resolvePromise => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
};

test('stop(true) waits for the current worker', async t => {
    const clock = sinon.useFakeTimers();
    try {
        const worker = deferred();
        const scheduler = new Scheduler((_next, hold) => {
            hold();
            return worker.promise;
        }, 1000);

        scheduler.start(0);
        await clock.tickAsync(0);

        let stopped = false;
        const stopping = scheduler.stop(true).then(() => {
            stopped = true;
        });
        await Promise.resolve();
        t.absent(stopped);

        worker.resolve();
        await stopping;
        t.ok(stopped);
        t.absent(scheduler.isRunning);
    } finally {
        clock.restore();
    }
});

test('stop(false) returns without waiting for the current worker', async t => {
    const clock = sinon.useFakeTimers();
    try {
        const worker = deferred();
        let workerFinished = false;
        worker.promise.then(() => {
            workerFinished = true;
        });
        const scheduler = new Scheduler((_next, hold) => {
            hold();
            return worker.promise;
        }, 1000);

        scheduler.start(0);
        await clock.tickAsync(0);
        await scheduler.stop(false);

        t.absent(workerFinished);
        t.absent(scheduler.isRunning);

        worker.resolve();
        await worker.promise;
    } finally {
        clock.restore();
    }
});

test('an old worker cannot clear the newer worker tracked by stop(true)', async t => {
    const clock = sinon.useFakeTimers();
    try {
        const first = deferred();
        const second = deferred();
        const runs = [first, second];
        let index = 0;
        const scheduler = new Scheduler((_next, hold) => {
            hold();
            return runs[index++].promise;
        }, 1000);

        scheduler.start(0);
        await clock.tickAsync(0);
        await scheduler.stop(false);
        scheduler.start(0);
        await clock.tickAsync(0);

        first.resolve();
        await Promise.resolve();

        let stopped = false;
        const stopping = scheduler.stop(true).then(() => {
            stopped = true;
        });
        await Promise.resolve();
        t.absent(stopped);

        second.resolve();
        await stopping;
        t.ok(stopped);
    } finally {
        clock.restore();
    }
});

test('multiple old workers cannot clear the latest worker', async t => {
    const clock = sinon.useFakeTimers();
    try {
        const first = deferred();
        const second = deferred();
        const third = deferred();
        const runs = [first, second, third];
        let index = 0;
        const scheduler = new Scheduler((_next, hold) => {
            hold();
            return runs[index++].promise;
        }, 1000);

        scheduler.start(0);
        await clock.tickAsync(0);
        await scheduler.stop(false);
        scheduler.start(0);
        await clock.tickAsync(0);
        await scheduler.stop(false);
        scheduler.start(0);
        await clock.tickAsync(0);

        first.resolve();
        second.resolve();
        await Promise.all([first.promise, second.promise]);
        await Promise.resolve();

        let stopped = false;
        const stopping = scheduler.stop(true).then(() => {
            stopped = true;
        });
        await Promise.resolve();
        t.absent(stopped);

        third.resolve();
        await stopping;
        t.ok(stopped);
    } finally {
        clock.restore();
    }
});

test('stop clears the timer before the worker starts', async t => {
    const clock = sinon.useFakeTimers();
    try {
        let runCount = 0;
        const scheduler = new Scheduler(() => {
            runCount++;
        }, 1000);

        scheduler.start(100);
        await scheduler.stop(true);
        await clock.tickAsync(100);

        t.is(runCount, 0);
    } finally {
        clock.restore();
    }
});
