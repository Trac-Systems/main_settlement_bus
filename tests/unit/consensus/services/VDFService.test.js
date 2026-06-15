import test from 'brittle';
import sinon from 'sinon';

const isBare = typeof globalThis.Bare !== 'undefined';
const DIFFICULTY = 100;
const DISCRIMINANT_BITS = 512;

// ---- Bare-only: unit tests (mocked) + integration ----

if (isBare) {
    const { default: Channel } = await import('bare-channel');
    const { VDFService } = await import('../../../../src/core/consensus/services/VDFService.js');

    function makePortMock() {
        return {
            write: sinon.stub().resolves(),
            read: sinon.stub().resolves({ result: null }),
            close: sinon.stub().resolves(),
        };
    }

    function makeThreadMock() {
        return {
            terminate: sinon.stub().resolves(),
            join: sinon.stub().resolves(),
        };
    }

    function setup(portMock, threadMock) {
        const savedBare = globalThis.Bare;
        sinon.stub(Channel.prototype, 'connect').returns(portMock);
        globalThis.Bare = { Thread: sinon.stub().returns(threadMock) };
        return () => {
            sinon.restore();
            globalThis.Bare = savedBare;
        };
    }

    test('_open creates a Thread with correct worker path and channel handle', async t => {
        const portMock = makePortMock();
        const threadMock = makeThreadMock();
        const teardown = setup(portMock, threadMock);
        t.teardown(teardown);

        const ThreadStub = globalThis.Bare.Thread;
        const service = new VDFService();
        await service.ready();
        t.teardown(() => service.close());

        t.ok(ThreadStub.calledOnce);
        t.is(ThreadStub.firstCall.args[0], './vdf-worker.js');
        t.is(typeof ThreadStub.firstCall.args[1].data, 'object');
    });

    test('_close terminates thread, joins it, and closes port', async t => {
        const portMock = makePortMock();
        const threadMock = makeThreadMock();
        const teardown = setup(portMock, threadMock);
        t.teardown(teardown);

        const service = new VDFService();
        await service.ready();
        await service.close();

        t.ok(threadMock.terminate.calledOnce);
        t.ok(threadMock.join.calledOnce);
        t.ok(portMock.close.calledOnce);
    });

    test('_close calls terminate before join', async t => {
        const portMock = makePortMock();
        const threadMock = makeThreadMock();
        const teardown = setup(portMock, threadMock);
        t.teardown(teardown);

        const service = new VDFService();
        await service.ready();
        await service.close();

        t.ok(threadMock.terminate.calledBefore(threadMock.join));
    });

    test('calculateVDF writes correct payload to port', async t => {
        const portMock = makePortMock();
        const teardown = setup(portMock, makeThreadMock());
        t.teardown(teardown);

        const service = new VDFService();
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
        const teardown = setup(portMock, makeThreadMock());
        t.teardown(teardown);

        const service = new VDFService();
        await service.ready();
        t.teardown(() => service.close());

        const result = await service.calculateVDF(Buffer.alloc(32), 500, 1024);
        t.alike(result, expectedResult);
    });

    test('calculateVDF returns null when response contains error', async t => {
        const portMock = makePortMock();
        portMock.read.resolves({ error: 'VDF computation failed' });
        const teardown = setup(portMock, makeThreadMock());
        t.teardown(teardown);

        const service = new VDFService();
        await service.ready();
        t.teardown(() => service.close());

        t.is(await service.calculateVDF(Buffer.alloc(32), 100, 512), null);
    });

    test('calculateVDF returns null when port.read throws', async t => {
        const portMock = makePortMock();
        portMock.read.rejects(new Error('port closed unexpectedly'));
        const teardown = setup(portMock, makeThreadMock());
        t.teardown(teardown);

        const service = new VDFService();
        await service.ready();
        t.teardown(() => service.close());

        t.is(await service.calculateVDF(Buffer.alloc(32), 100, 512), null);
    });

    // Bare integration tests

    test('[bare] real VDF: returns valid computation result', { timeout: 30000 }, async t => {
        const service = new VDFService();
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
        const service = new VDFService();
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
        const service = new VDFService();
        await service.ready();
        await service.close();
        await service.ready();
        t.teardown(() => service.close());

        const result = await service.calculateVDF(Buffer.alloc(32, 5), DIFFICULTY, DISCRIMINANT_BITS);
        t.ok(result !== null, 'null means @tracsystems/trac-vdf is missing or dist/ was not built');
    });

    test('[bare] real VDF: invalid discriminantSizeBits causes worker to return null', { timeout: 10000 }, async t => {
        const service = new VDFService();
        await service.ready();
        t.teardown(() => service.close());

        const result = await service.calculateVDF(Buffer.alloc(32, 1), DIFFICULTY, 1);
        t.is(result, null);
    });
}

// ---- Node.js integration tests ----

if (!isBare) {
    const { VDFService } = await import('../../../../src/core/consensus/services/VDFService.js');

    test('[node] real VDF: returns valid computation result', { timeout: 30000 }, async t => {
        const service = new VDFService();
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
        const service = new VDFService();
        await service.ready();
        t.teardown(() => service.close());

        t.is(await service.calculateVDF(Buffer.alloc(32, 1), DIFFICULTY, -1), null);
    });

    test('[node] real VDF: multiple sequential requests all succeed', { timeout: 60000 }, async t => {
        const service = new VDFService();
        await service.ready();
        t.teardown(() => service.close());

        for (const fill of [1, 2, 3]) {
            const challenge = Buffer.alloc(32, fill);
            const result = await service.calculateVDF(challenge, DIFFICULTY, DISCRIMINANT_BITS);
            t.ok(result !== null, `request ${fill} returned null — lib broken or missing`);
            t.ok(result.solution instanceof Uint8Array);
        }
    });

}
