import test from 'brittle';
import sinon from 'sinon';

const isBareRuntime = typeof globalThis.Bare !== 'undefined';

const MANAGER_PATH = '../../../../../../src/core/consensus/services/VDFServiceManager.js';
const CREATE_VDF_PATH = '../../../../../../src/core/consensus/services/createVDFService.js';
const OPERATIONS_PATH = '../../../../../../src/core/consensus/services/EpochCoordinatorOperations.js';

const deferred = () => {
    let resolve;
    const promise = new Promise(resolvePromise => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
};

const makeVdf = (overrides = {}) => ({
    ready: sinon.stub().resolves(),
    close: sinon.stub().resolves(),
    ...overrides,
});

async function waitUntilCalled(stub) {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (stub.called) return;
        await Promise.resolve();
    }
    throw new Error('expected stub was not called');
}

async function setup(services) {
    const createVDFService = sinon.stub();
    services.forEach((service, index) => createVDFService.onCall(index).resolves(service));
    const createdOperations = [];
    const MockOperations = class {
        constructor(state, service, wallet, config) {
            const operations = { state, service, wallet, config };
            createdOperations.push(operations);
            return operations;
        }
    };
    const { default: esmock } = await import('esmock');
    const { VDFServiceManager } = await esmock(MANAGER_PATH, {
        [CREATE_VDF_PATH]: { createVDFService },
        [OPERATIONS_PATH]: { EpochCoordinatorOperations: MockOperations },
    });
    const state = {};
    const wallet = {};
    const config = {};
    const manager = new VDFServiceManager(state, wallet, config);
    return { manager, createVDFService, createdOperations, state, wallet, config };
}

if (isBareRuntime) {
    test('VDFServiceManager can be loaded in Bare', async t => {
        const { VDFServiceManager } = await import(MANAGER_PATH);

        t.is(typeof VDFServiceManager, 'function');
    });
} else {
    test('open creates one ready VDF service and reuses its operations', async t => {
        const vdf = makeVdf();
        const context = await setup([vdf]);

        const first = await context.manager.open();
        const second = await context.manager.open();

        t.is(first, second);
        t.is(context.manager.operations, first);
        t.ok(context.createVDFService.calledOnce);
        t.ok(vdf.ready.calledOnce);
        t.alike(context.createdOperations[0], {
            state: context.state,
            service: vdf,
            wallet: context.wallet,
            config: context.config,
        });
        await context.manager.close();
    });

    test('replace closes the old VDF before opening a new one', async t => {
        const trace = [];
        const oldVdf = makeVdf({ close: sinon.stub().callsFake(async () => trace.push('old-close')) });
        const newVdf = makeVdf({ ready: sinon.stub().callsFake(async () => trace.push('new-ready')) });
        const context = await setup([oldVdf, newVdf]);
        await context.manager.open();
        trace.splice(0);

        const operations = await context.manager.replace();

        t.alike(trace, ['old-close', 'new-ready']);
        t.is(operations.service, newVdf);
        t.is(context.manager.operations, operations);
        await context.manager.close();
    });

    test('close waits for a VDF service which is still opening', async t => {
        const opening = deferred();
        const vdf = makeVdf({ ready: sinon.stub().returns(opening.promise) });
        const context = await setup([vdf]);

        const open = context.manager.open();
        await waitUntilCalled(vdf.ready);
        const close = context.manager.close();
        t.absent(vdf.close.called);

        opening.resolve();
        const operations = await open;
        await close;

        t.is(operations.service, vdf);
        t.ok(vdf.close.calledOnce);
        t.is(context.manager.operations, null);
    });

    test('replace does not open a new VDF when the old VDF cannot close', async t => {
        const cause = new Error('old VDF is still running');
        const oldVdf = makeVdf({ close: sinon.stub().rejects(cause) });
        const newVdf = makeVdf();
        const context = await setup([oldVdf, newVdf]);
        await context.manager.open();

        const replaceError = await context.manager.replace().catch(error => error);

        t.is(replaceError.message, 'Failed to close VDF service');
        t.is(context.manager.operations, null);
        t.ok(context.createVDFService.calledOnce);
        await t.exception(context.manager.open(), /Previous VDF service is still open/);
    });

    test('replace can be retried after the old VDF eventually closes', async t => {
        const close = sinon.stub();
        close.onFirstCall().rejects(new Error('old VDF is still running'));
        close.onSecondCall().resolves();
        const oldVdf = makeVdf({ close });
        const newVdf = makeVdf();
        const context = await setup([oldVdf, newVdf]);
        await context.manager.open();

        await t.exception(context.manager.replace(), /Failed to close VDF service/);
        t.ok(context.createVDFService.calledOnce, 'no replacement is opened after the failed close');

        const operations = await context.manager.replace();

        t.ok(close.calledTwice);
        t.ok(context.createVDFService.calledTwice);
        t.is(operations.service, newVdf);
        await context.manager.close();
    });

    test('open can be retried after VDF startup fails and cleanup succeeds', async t => {
        const failedVdf = makeVdf({
            ready: sinon.stub().rejects(new Error('startup failed')),
        });
        const newVdf = makeVdf();
        const context = await setup([failedVdf, newVdf]);

        await t.exception(context.manager.open(), /startup failed/);
        const operations = await context.manager.open();

        t.ok(failedVdf.close.calledOnce);
        t.is(operations.service, newVdf);
        await context.manager.close();
    });

    test('open is blocked when a failed VDF cannot be closed', async t => {
        const cause = new Error('failed VDF did not close');
        const failedVdf = makeVdf({
            ready: sinon.stub().rejects(new Error('startup failed')),
            close: sinon.stub().rejects(cause),
        });
        const newVdf = makeVdf();
        const context = await setup([failedVdf, newVdf]);

        const openError = await context.manager.open().catch(error => error);

        t.is(openError.message, 'Failed to close VDF service');
        t.is(context.manager.operations, null);
        await t.exception(context.manager.open(), /Previous VDF service is still open/);
        t.ok(context.createVDFService.calledOnce);
    });
}
