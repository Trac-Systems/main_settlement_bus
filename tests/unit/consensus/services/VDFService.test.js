import test from 'brittle';
import sinon from 'sinon';
import { VDFService } from '../../../../src/core/consensus/services/VDFService.js';

const isBare = typeof globalThis.Bare !== 'undefined';
const DIFFICULTY = 100;
const DISCRIMINANT_BITS = 512;

// ---- VDFService unit tests (mock port, runs in both environments) ----

function makePortMock() {
    return {
        write: sinon.stub().resolves(),
        read: sinon.stub().resolves({ result: null }),
        close: sinon.stub().resolves(),
    };
}

function makeService(portMock) {
    class TestVDFService extends VDFService {
        async _open() { this._setPort(portMock); }
    }
    return new TestVDFService();
}

async function withTimeout(promise, timeoutMs, message) {
    let timeout;
    const timeoutPromise = new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timeout);
    }
}

async function isSettledWithin(promise, timeoutMs) {
    return Promise.race([
        promise.then(() => true, () => true),
        new Promise(resolve => setTimeout(() => resolve(false), timeoutMs)),
    ]);
}

test('calculateVDF writes correct payload to port', async t => {
    const portMock = makePortMock();
    const service = makeService(portMock);
    await service.ready();
    t.teardown(() => service.close());

    const challenge = Buffer.alloc(32, 1);
    await service.calculateVDF(challenge, 1000, 2048);

    t.ok(portMock.write.calledOnce);
    t.alike(portMock.write.firstCall.args[0], { challenge, difficulty: 1000, discriminantSizeBits: 2048 });
});

test('calculateVDF returns result field from port.read response', async t => {
    const portMock = makePortMock();
    const expectedResult = { challenge: Buffer.alloc(32), difficulty: 500, solution: 'proof' };
    portMock.read.resolves({ result: expectedResult });
    const service = makeService(portMock);
    await service.ready();
    t.teardown(() => service.close());

    const { result, error } = await service.calculateVDF(Buffer.alloc(32), 500, 1024);
    t.alike(result, expectedResult);
    t.absent(error);
});

test('calculateVDF returns error field when response contains error', async t => {
    const portMock = makePortMock();
    portMock.read.resolves({ error: 'VDF computation failed' });
    const service = makeService(portMock);
    await service.ready();
    t.teardown(() => service.close());

    const { result, error } = await service.calculateVDF(Buffer.alloc(32), 100, 512);
    t.absent(result);
    t.is(error, 'VDF computation failed');
});

test('calculateVDF returns error field when port.read throws', async t => {
    const portMock = makePortMock();
    portMock.read.rejects(new Error('port closed unexpectedly'));
    const service = makeService(portMock);
    await service.ready();
    t.teardown(() => service.close());

    const { result, error } = await service.calculateVDF(Buffer.alloc(32), 100, 512);
    t.absent(result);
    t.ok(error instanceof Error);
    t.is(error.message, 'port closed unexpectedly');
});

test('concurrent calculateVDF calls are serialized', async t => {
    let resolveFirst;
    const firstRead = new Promise(resolve => { resolveFirst = resolve; });
    const portMock = makePortMock();
    portMock.read
        .onFirstCall().returns(firstRead)
        .onSecondCall().resolves({ result: 'result-B' });
    const service = makeService(portMock);
    await service.ready();
    t.teardown(() => service.close());

    const callA = service.calculateVDF(Buffer.alloc(32, 1), 100, 512);
    const callB = service.calculateVDF(Buffer.alloc(32, 2), 100, 512);

    await new Promise(r => setTimeout(r, 0));
    t.is(portMock.write.callCount, 1, 'B has not started while A is pending');

    resolveFirst({ result: 'result-A' });
    const [resA, resB] = await Promise.all([callA, callB]);

    t.is(portMock.write.callCount, 2);
    t.alike(resA, { result: 'result-A' });
    t.alike(resB, { result: 'result-B' });
});

test('queue continues after call returns an error response', async t => {
    const portMock = makePortMock();
    portMock.read
        .onFirstCall().resolves({ error: 'failed' })
        .onSecondCall().resolves({ result: 'ok' });
    const service = makeService(portMock);
    await service.ready();
    t.teardown(() => service.close());

    const resA = await service.calculateVDF(Buffer.alloc(32, 1), 100, 512);
    const resB = await service.calculateVDF(Buffer.alloc(32, 2), 100, 512);

    t.alike(resA, { error: 'failed' });
    t.alike(resB, { result: 'ok' });
});

test('queue continues after port.read throws', async t => {
    const portMock = makePortMock();
    portMock.read
        .onFirstCall().rejects(new Error('port error'))
        .onSecondCall().resolves({ result: 'ok' });
    const service = makeService(portMock);
    await service.ready();
    t.teardown(() => service.close());

    const resA = await service.calculateVDF(Buffer.alloc(32, 1), 100, 512);
    const resB = await service.calculateVDF(Buffer.alloc(32, 2), 100, 512);

    t.ok(resA.error instanceof Error);
    t.is(resA.error.message, 'port error');
    t.alike(resB, { result: 'ok' });
});

test('close cancels the active calculation and prevents queued work from starting', async t => {
    let finishRead;
    const portMock = makePortMock();
    portMock.read.returns(new Promise(resolve => { finishRead = resolve; }));
    portMock.close.callsFake(async error => finishRead({ error }));
    const service = makeService(portMock);
    await service.ready();

    const active = service.calculateVDF(Buffer.alloc(32, 1), 100, 512);
    const queued = service.calculateVDF(Buffer.alloc(32, 2), 100, 512);
    await new Promise(resolve => setTimeout(resolve, 0));

    await service.close();
    const [activeResult, queuedResult] = await Promise.all([active, queued]);

    t.ok(activeResult.error);
    t.ok(queuedResult.error);
    t.is(portMock.write.callCount, 1);
});

// ---- Bare-only tests ----

if (isBare) {
    const { VDFBare } = await import('../../../../src/core/consensus/services/VDFBare.js');

    test('[bare] a longer healthy solve keeps reporting progress and returns a valid proof', { timeout: 60000 }, async t => {
        const { default: subprocess } = await import('bare-subprocess');
        const { verifyWesolowski } = await import('@tracsystems/trac-vdf');
        const subscribe = subprocess.Subprocess.prototype.on;
        let reports = 0;
        const watch = sinon.stub(subprocess.Subprocess.prototype, 'on').callsFake(function (event, listener) {
            const result = subscribe.call(this, event, listener);
            if (event === 'exit') this.stdio[3].on('data', chunk => {
                if (chunk.toString().includes('"progress"')) reports++;
            });
            return result;
        });
        const service = new VDFBare();
        t.teardown(async () => { await service.close(); watch.restore(); }, { force: true });
        await service.ready();
        const challenge = Buffer.alloc(32, 3);
        const { result, error } = await service.calculateVDF(challenge, 200_000, 1024);
        t.absent(error);
        t.ok(reports > 1, 'real progress crosses the pipe throughout native computation');
        t.ok(await verifyWesolowski(challenge, 200_000, result.solution, 1024));
    });

    test('[bare] SIGSTOP after live progress is detected and a queued calculation succeeds', { timeout: 15000 }, async t => {
        const { default: subprocess } = await import('bare-subprocess');
        const { kill } = await import('bare-os');
        const { verifyWesolowski } = await import('@tracsystems/trac-vdf');
        const subscribe = subprocess.Subprocess.prototype.on;
        let stoppedChild;
        let reports = 0;
        const watch = sinon.stub(subprocess.Subprocess.prototype, 'on').callsFake(function (event, listener) {
            const result = subscribe.call(this, event, listener);
            if (event === 'exit' && !stoppedChild) {
                stoppedChild = this;
                this.stdio[3].on('data', chunk => {
                    if (reports || !chunk.toString().includes('"progress"')) return;
                    reports++;
                    // Subprocess.kill is one-shot even for SIGSTOP; inject the
                    // external OS signal without consuming its termination call.
                    kill(this.pid, 'SIGSTOP');
                });
            }
            return result;
        });
        const service = new VDFBare();
        t.teardown(async () => { await service.close(); watch.restore(); }, { force: true });
        await service.ready();
        const active = service.calculateVDF(Buffer.alloc(32, 1), 100_000_000, DISCRIMINANT_BITS);
        const challenge = Buffer.alloc(32, 2);
        const queued = service.calculateVDF(challenge, DIFFICULTY, DISCRIMINANT_BITS);
        const failed = await withTimeout(active, 12000, 'stopped solver remained pending');
        t.is(reports, 1, 'progress reached the parent while WASM was still computing');
        t.absent(failed.result);
        t.is(failed.error?.code, 'VDF_STALLED');
        t.is(stoppedChild.signalCode, 9, 'watchdog killed the stopped process without SIGCONT');
        t.ok(stoppedChild.stdio.every(pipe => pipe.destroyed));
        const { result, error } = await queued;
        t.absent(error);
        t.ok(await verifyWesolowski(challenge, DIFFICULTY, result.solution, DISCRIMINANT_BITS));
    });

    test('[bare] SIGKILL during a real solve returns an error and the next request succeeds', { timeout: 10000 }, async t => {
        const { default: subprocess } = await import('bare-subprocess');
        const { verifyWesolowski } = await import('@tracsystems/trac-vdf');
        const subscribe = sinon.spy(subprocess.Subprocess.prototype, 'on');
        const service = new VDFBare();
        t.teardown(async () => {
            await service.close();
            subscribe.restore();
        }, { force: true });
        await service.ready();

        const calculation = service.calculateVDF(Buffer.alloc(32, 1), 100_000_000, DISCRIMINANT_BITS);
        await withTimeout((async () => {
            while (!subscribe.calledWith('exit') && !service.closed) await new Promise(resolve => setTimeout(resolve, 5));
        })(), 2000, 'VDF process did not start');
        const child = subscribe.getCalls().find(call => call.args[0] === 'exit').thisValue;
        t.is(await isSettledWithin(calculation, 100), false, 'long calculation is still pending');
        child.kill('SIGKILL');

        const failed = await withTimeout(calculation, 2000, 'killed VDF calculation remained pending');
        t.absent(failed.result);
        t.ok(failed.error);
        t.is(child.signalCode, 9, 'the actual subprocess was killed');
        t.ok(child.stdio.every(pipe => pipe.destroyed), 'killed subprocess pipes are closed');

        const challenge = Buffer.alloc(32, 2);
        const { result, error } = await service.calculateVDF(challenge, DIFFICULTY, DISCRIMINANT_BITS);
        t.absent(error);
        t.ok(await verifyWesolowski(challenge, DIFFICULTY, result.solution, DISCRIMINANT_BITS), 'fresh process returns a valid proof');
        t.is(subscribe.getCalls().filter(call => call.args[0] === 'exit').length, 2);
    });

    test('[bare] completed calculations release every subprocess pipe', { timeout: 10000 }, async t => {
        const { default: subprocess } = await import('bare-subprocess');
        const subscribe = sinon.spy(subprocess.Subprocess.prototype, 'on');
        const service = new VDFBare();
        t.teardown(async () => {
            await service.close();
            subscribe.restore();
        }, { force: true });
        await service.ready();
        for (let i = 0; i < 3; i++) {
            const { error } = await service.calculateVDF(Buffer.alloc(32, i), DIFFICULTY, DISCRIMINANT_BITS);
            t.absent(error);
            const child = subscribe.getCalls().filter(call => call.args[0] === 'exit')[i].thisValue;
            t.ok(child.stdio.every(pipe => pipe.destroyed), 'stdin, stdout and stderr are released before the next calculation');
        }
    });

    // Each computation runs in its own disposable OS subprocess (see VDFBare.js for why:
    // a real solveWesolowski() call leaves native/WASM state that crashes Bare.Thread's
    // teardown). There's no persistent thread/channel to mock - the "[bare] real VDF" tests
    // below exercise _open/calculateVDF/close through the real subprocess path instead.

    test('[bare] real VDF: returns valid computation result', { timeout: 30000 }, async t => {
        const service = new VDFBare();
        await service.ready();
        t.teardown(() => service.close());

        const challenge = Buffer.alloc(32, 1);
        const { result, error } = await service.calculateVDF(challenge, DIFFICULTY, DISCRIMINANT_BITS);

        t.absent(error, 'an error means @tracsystems/trac-vdf is missing or dist/ was not built');
        t.alike(result.challenge, challenge);
        t.is(result.difficulty, DIFFICULTY);
        t.is(result.discriminantSizeBits, DISCRIMINANT_BITS);
        t.ok(Buffer.isBuffer(result.solution));
        t.ok(result.solution.length > 0);
    });

    test('[bare] real VDF: multiple sequential requests all succeed', { timeout: 60000 }, async t => {
        const service = new VDFBare();
        await service.ready();
        t.teardown(() => service.close());

        for (const fill of [1, 2, 3]) {
            const challenge = Buffer.alloc(32, fill);
            const { result, error } = await service.calculateVDF(challenge, DIFFICULTY, DISCRIMINANT_BITS);
            t.absent(error, `request ${fill} returned an error — lib broken or missing`);
            t.alike(result.challenge, challenge);
        }
    });

    test('[bare] a closed service is not reopened through ReadyResource', async t => {
        const service = new VDFBare();
        await service.ready();
        await service.close();
        await service.ready();

        const { result, error } = await service.calculateVDF(Buffer.alloc(32, 5), DIFFICULTY, DISCRIMINANT_BITS);
        t.absent(result);
        t.ok(error, 'a restart requires a fresh VDF service instance');
    });

    test('[bare] real VDF: invalid discriminantSizeBits causes worker to return an error', { timeout: 10000 }, async t => {
        const service = new VDFBare();
        await service.ready();
        t.teardown(() => service.close());

        const { result, error } = await service.calculateVDF(Buffer.alloc(32, 1), DIFFICULTY, -1);
        t.absent(result);
        t.ok(error);
    });

    test('[bare] calculateVDF returns an error when worker exits unexpectedly', { timeout: 10000 }, async t => {
        const crashWorkerURL = new URL('./fixtures/crash-worker-bare.js', import.meta.url);
        const service = new VDFBare(crashWorkerURL);
        await service.ready();
        t.teardown(() => service.close());

        const { result, error } = await service.calculateVDF(Buffer.alloc(32, 1), DIFFICULTY, DISCRIMINANT_BITS);
        t.absent(result);
        t.ok(error);
    });

    test('[bare] calculateVDF returns an error instead of crashing when worker writes a non-JSON response', { timeout: 10000 }, async t => {
        const garbageWorkerURL = new URL('./fixtures/garbage-worker-bare.js', import.meta.url);
        const service = new VDFBare(garbageWorkerURL);
        await service.ready();
        t.teardown(() => service.close());

        const { result, error } = await service.calculateVDF(Buffer.alloc(32, 1), DIFFICULTY, DISCRIMINANT_BITS);
        t.absent(result);
        t.ok(error);
    });

    test('[bare] replacing the service cancels an active VDF subprocess', { timeout: 10000 }, async t => {
        const workerURL = new URL('./fixtures/cancellable-worker-bare.js', import.meta.url);
        const previous = new VDFBare(workerURL);
        const replacement = new VDFBare(workerURL);
        await previous.ready();
        t.teardown(() => Promise.all([previous.close(), replacement.close()]));

        const pendingCalculation = previous.calculateVDF(
            Buffer.alloc(32, 1),
            DIFFICULTY,
            DISCRIMINANT_BITS,
        );
        t.is(await isSettledWithin(pendingCalculation, 100), false);

        await replacement.ready();
        await withTimeout(previous.close(), 2000, 'closing the old VDF subprocess timed out');
        const cancelled = await withTimeout(pendingCalculation, 2000, 'cancelled VDF remained pending');
        t.absent(cancelled.result);
        t.ok(cancelled.error);

        const { result, error } = await replacement.calculateVDF(
            Buffer.alloc(32, 2),
            DIFFICULTY,
            DISCRIMINANT_BITS,
        );
        t.absent(error);
        t.alike(Buffer.from(result.challenge), Buffer.alloc(32, 2));
        t.alike(result.solution, Buffer.from([2]));
    });
}

// ---- Node.js tests ----

if (!isBare) {
    const { VDFNode } = await import('../../../../src/core/consensus/services/VDFNode.js');

    test('[node] real VDF: returns valid computation result', { timeout: 30000 }, async t => {
        const service = new VDFNode();
        await service.ready();
        t.teardown(() => service.close());

        const challenge = Buffer.alloc(32, 1);
        const { result, error } = await service.calculateVDF(challenge, DIFFICULTY, DISCRIMINANT_BITS);

        t.absent(error, 'an error means @tracsystems/trac-vdf is missing or dist/ was not built');
        t.ok(result.challenge instanceof Uint8Array);
        t.is(result.difficulty, DIFFICULTY);
        t.is(result.discriminantSizeBits, DISCRIMINANT_BITS);
        t.ok(result.solution instanceof Uint8Array);
        t.ok(result.solution.length > 0);
    });

    test('[node] real VDF: invalid args cause worker to return an error', { timeout: 10000 }, async t => {
        const service = new VDFNode();
        await service.ready();
        t.teardown(() => service.close());

        const { result, error } = await service.calculateVDF(Buffer.alloc(32, 1), DIFFICULTY, -1);
        t.absent(result);
        t.ok(error);
    });

    test('[node] real VDF: multiple sequential requests all succeed', { timeout: 60000 }, async t => {
        const service = new VDFNode();
        await service.ready();
        t.teardown(() => service.close());

        for (const fill of [1, 2, 3]) {
            const challenge = Buffer.alloc(32, fill);
            const { result, error } = await service.calculateVDF(challenge, DIFFICULTY, DISCRIMINANT_BITS);
            t.absent(error, `request ${fill} returned an error — lib broken or missing`);
            t.ok(result.solution instanceof Uint8Array);
        }
    });

    test('[node] calculateVDF returns an error when worker exits unexpectedly', { timeout: 5000 }, async t => {
        const crashWorkerURL = new URL('./fixtures/crash-worker.js', import.meta.url);
        const service = new VDFNode(crashWorkerURL);
        await service.ready();

        const { result, error } = await service.calculateVDF(Buffer.alloc(32, 1), 100, 512);
        t.absent(result);
        t.ok(error);
    });

    test('[node] replacing the service cancels an active VDF worker', { timeout: 10000 }, async t => {
        const workerURL = new URL('./fixtures/cancellable-worker.js', import.meta.url);
        const previous = new VDFNode(workerURL);
        const replacement = new VDFNode(workerURL);
        await previous.ready();
        t.teardown(() => Promise.all([previous.close(), replacement.close()]));

        const pendingCalculation = previous.calculateVDF(
            Buffer.alloc(32, 1),
            DIFFICULTY,
            DISCRIMINANT_BITS,
        );
        t.is(await isSettledWithin(pendingCalculation, 100), false);

        await replacement.ready();
        await withTimeout(previous.close(), 2000, 'closing the old VDF worker timed out');
        const cancelled = await withTimeout(pendingCalculation, 2000, 'cancelled VDF remained pending');
        t.absent(cancelled.result);
        t.ok(cancelled.error);

        const { result, error } = await replacement.calculateVDF(
            Buffer.alloc(32, 2),
            DIFFICULTY,
            DISCRIMINANT_BITS,
        );
        t.absent(error);
        t.alike(Buffer.from(result.challenge), Buffer.alloc(32, 2));
        t.alike(result.solution, new Uint8Array([2]));
    });
}
