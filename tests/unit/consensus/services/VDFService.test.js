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

    const result = await service.calculateVDF(Buffer.alloc(32), 500, 1024);
    t.alike(result, expectedResult);
});

test('calculateVDF returns null when response contains error', async t => {
    const portMock = makePortMock();
    portMock.read.resolves({ error: 'VDF computation failed' });
    const service = makeService(portMock);
    await service.ready();
    t.teardown(() => service.close());

    t.is(await service.calculateVDF(Buffer.alloc(32), 100, 512), null);
});

test('calculateVDF returns null when port.read throws', async t => {
    const portMock = makePortMock();
    portMock.read.rejects(new Error('port closed unexpectedly'));
    const service = makeService(portMock);
    await service.ready();
    t.teardown(() => service.close());

    t.is(await service.calculateVDF(Buffer.alloc(32), 100, 512), null);
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
    t.is(resA, 'result-A');
    t.is(resB, 'result-B');
});

test('queue continues after call returns null (error response)', async t => {
    const portMock = makePortMock();
    portMock.read
        .onFirstCall().resolves({ error: 'failed' })
        .onSecondCall().resolves({ result: 'ok' });
    const service = makeService(portMock);
    await service.ready();
    t.teardown(() => service.close());

    const resA = await service.calculateVDF(Buffer.alloc(32, 1), 100, 512);
    const resB = await service.calculateVDF(Buffer.alloc(32, 2), 100, 512);

    t.is(resA, null);
    t.is(resB, 'ok');
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

    t.is(resA, null);
    t.is(resB, 'ok');
});

// ---- Bare-only tests ----

if (isBare) {
    const { default: Channel } = await import('bare-channel');
    const { VDFBare } = await import('../../../../src/core/consensus/services/VDFBare.js');

    function makeThreadMock() {
        return {
            terminate: sinon.stub().resolves(),
            join: sinon.stub().resolves(),
        };
    }

    function setupBare(portMock, threadMock) {
        const savedBare = globalThis.Bare;
        sinon.stub(Channel.prototype, 'connect').returns(portMock);
        globalThis.Bare = { Thread: sinon.stub().returns(threadMock) };
        return () => {
            sinon.restore();
            globalThis.Bare = savedBare;
        };
    }

    test('VDFBare._open creates a Thread with a file:// worker URL and channel handle', async t => {
        const portMock = makePortMock();
        const threadMock = makeThreadMock();
        const teardown = setupBare(portMock, threadMock);
        t.teardown(teardown);

        const ThreadStub = globalThis.Bare.Thread;
        const service = new VDFBare();
        await service.ready();
        t.teardown(() => service.close());

        t.ok(ThreadStub.calledOnce);
        t.ok(ThreadStub.firstCall.args[0].startsWith('file://'));
        t.ok(ThreadStub.firstCall.args[0].endsWith('vdf-worker.js'));
        t.is(typeof ThreadStub.firstCall.args[1].data, 'object');
    });

    test('VDFBare._close terminates thread, joins it, and closes port', async t => {
        const portMock = makePortMock();
        const threadMock = makeThreadMock();
        const teardown = setupBare(portMock, threadMock);
        t.teardown(teardown);

        const service = new VDFBare();
        await service.ready();
        await service.close();

        t.ok(threadMock.terminate.calledOnce);
        t.ok(threadMock.join.calledOnce);
        t.ok(portMock.close.calledOnce);
    });

    test('VDFBare._close calls terminate before join', async t => {
        const portMock = makePortMock();
        const threadMock = makeThreadMock();
        const teardown = setupBare(portMock, threadMock);
        t.teardown(teardown);

        const service = new VDFBare();
        await service.ready();
        await service.close();

        t.ok(threadMock.terminate.calledBefore(threadMock.join));
    });

    test('[bare] real VDF: returns valid computation result', { timeout: 30000 }, async t => {
        const service = new VDFBare();
        await service.ready();
        t.teardown(() => service.close());

        const challenge = Buffer.alloc(32, 1);
        const result = await service.calculateVDF(challenge, DIFFICULTY, DISCRIMINANT_BITS);

        t.ok(result !== null, 'null means @tracsystems/trac-vdf is missing or dist/ was not built');
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
            const result = await service.calculateVDF(challenge, DIFFICULTY, DISCRIMINANT_BITS);
            t.ok(result !== null, `request ${fill} returned null — lib broken or missing`);
            t.alike(result.challenge, challenge);
        }
    });

    test('[bare] real VDF: service works after close and reopen', { timeout: 30000 }, async t => {
        const service = new VDFBare();
        await service.ready();
        await service.close();
        await service.ready();
        t.teardown(() => service.close());

        const result = await service.calculateVDF(Buffer.alloc(32, 5), DIFFICULTY, DISCRIMINANT_BITS);
        t.ok(result !== null, 'null means @tracsystems/trac-vdf is missing or dist/ was not built');
    });

    test('[bare] real VDF: invalid discriminantSizeBits causes worker to return null', { timeout: 10000 }, async t => {
        const service = new VDFBare();
        await service.ready();
        t.teardown(() => service.close());

        const result = await service.calculateVDF(Buffer.alloc(32, 1), DIFFICULTY, 1);
        t.is(result, null);
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
        const result = await service.calculateVDF(challenge, DIFFICULTY, DISCRIMINANT_BITS);

        t.ok(result !== null, 'null means @tracsystems/trac-vdf is missing or dist/ was not built');
        t.ok(result.challenge instanceof Uint8Array);
        t.is(result.difficulty, DIFFICULTY);
        t.is(result.discriminantSizeBits, DISCRIMINANT_BITS);
        t.ok(result.solution instanceof Uint8Array);
        t.ok(result.solution.length > 0);
    });

    test('[node] real VDF: invalid args cause worker to return null', { timeout: 10000 }, async t => {
        const service = new VDFNode();
        await service.ready();
        t.teardown(() => service.close());

        t.is(await service.calculateVDF(Buffer.alloc(32, 1), DIFFICULTY, -1), null);
    });

    test('[node] real VDF: multiple sequential requests all succeed', { timeout: 60000 }, async t => {
        const service = new VDFNode();
        await service.ready();
        t.teardown(() => service.close());

        for (const fill of [1, 2, 3]) {
            const challenge = Buffer.alloc(32, fill);
            const result = await service.calculateVDF(challenge, DIFFICULTY, DISCRIMINANT_BITS);
            t.ok(result !== null, `request ${fill} returned null — lib broken or missing`);
            t.ok(result.solution instanceof Uint8Array);
        }
    });

    test('[node] calculateVDF returns null when worker exits unexpectedly', { timeout: 5000 }, async t => {
        const crashWorkerURL = new URL('./fixtures/crash-worker.js', import.meta.url);
        const service = new VDFNode(crashWorkerURL);
        await service.ready();

        const result = await service.calculateVDF(Buffer.alloc(32, 1), 100, 512);
        t.is(result, null);
    });
}
