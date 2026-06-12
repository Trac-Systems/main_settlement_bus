import { test } from 'brittle';
import sinon from 'sinon';

const isBareRuntime = typeof globalThis.Bare !== 'undefined';

if (!isBareRuntime) {
    test('VDFService tests require Bare runtime (bare-channel is Bare-native)', t => {
        t.pass('skipped in Node.js');
    });
} else {
    const { default: Channel } = await import('bare-channel');
    const { VDFService } = await import('../../../../src/core/consensus/services/VDFService.js');

    function makePortMock() {
        return {
            write: sinon.stub().resolves(),
            read: sinon.stub().resolves({ result: 'vdf-result' }),
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
        const originalBare = globalThis.Bare;
        sinon.stub(Channel.prototype, 'connect').returns(portMock);
        globalThis.Bare = { Thread: sinon.stub().returns(threadMock) };
        return () => {
            sinon.restore();
            globalThis.Bare = originalBare;
        };
    }

    test('VDFService._open creates a Thread using the channel handle', async t => {
        const portMock = makePortMock();
        const threadMock = makeThreadMock();
        const teardown = setup(portMock, threadMock);
        t.teardown(teardown);

        const ThreadStub = globalThis.Bare.Thread;
        const service = new VDFService();
        await service.ready(); // ready() waits for _open()

        t.ok(ThreadStub.calledOnce, 'Thread constructor called once');
        t.is(ThreadStub.firstCall.args[0], 'vdf-worker.js', 'Thread spawned with correct worker path');
        t.is(typeof ThreadStub.firstCall.args[1].data, 'object', 'Thread receives channel handle as data');
        t.is(typeof ThreadStub.firstCall.args[2], 'function', 'Thread receives worker callback');

        await service.close(); // close() waits for _close()
    });

    test('VDFService._close terminates thread, joins it, and closes port', async t => {
        const portMock = makePortMock();
        const threadMock = makeThreadMock();
        const teardown = setup(portMock, threadMock);
        t.teardown(teardown);

        const service = new VDFService();
        await service.ready(); // ready() waits for _open()
        await service.close();  // close() waits for _close()

        t.ok(threadMock.terminate.calledOnce, 'thread.terminate called once');
        t.ok(threadMock.join.calledOnce, 'thread.join called once');
        t.ok(portMock.close.calledOnce, 'port.close called once');
    });

    test('VDFService._close calls terminate before join', async t => {
        const portMock = makePortMock();
        const threadMock = makeThreadMock();
        const teardown = setup(portMock, threadMock);
        t.teardown(teardown);

        const service = new VDFService();
        await service.ready(); // ready() waits for _open()
        await service.close(); // close() waits for _close()

        t.ok(threadMock.terminate.calledBefore(threadMock.join), 'terminate called before join');
    });

    test('VDFService.calculateVDF writes correct payload to port', async t => {
        const portMock = makePortMock();
        const threadMock = makeThreadMock();
        const teardown = setup(portMock, threadMock);
        t.teardown(teardown);

        const service = new VDFService();
        await service.ready(); // ready() waits for _open()

        const challenge = Buffer.alloc(32, 1);
        const difficulty = 1000;
        const discriminantSizeBits = 2048;

        await service.calculateVDF(challenge, difficulty, discriminantSizeBits);

        t.ok(portMock.write.calledOnce, 'port.write called once');
        t.alike(portMock.write.firstCall.args[0], { challenge, difficulty, discriminantSizeBits });

        await service.close(); // close() waits for _close()
    });

    test('VDFService.calculateVDF returns the result from port.read', async t => {
        const portMock = makePortMock();
        const expectedResult = { challenge: Buffer.alloc(32), difficulty: 500, solution: 'proof' };
        portMock.read.resolves(expectedResult);

        const threadMock = makeThreadMock();
        const teardown = setup(portMock, threadMock);
        t.teardown(teardown);

        const service = new VDFService();
        await service.ready();  // ready() waits for _open()

        const result = await service.calculateVDF(Buffer.alloc(32), 500, 1024);
        t.alike(result, expectedResult, 'returns exactly what port.read resolves to');

        await service.close(); // close() waits for _close()
    });
}
