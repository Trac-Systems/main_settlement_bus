import test from 'brittle';
import sinon from 'sinon';
import { CustomEventType } from '../../../../../../src/utils/constants.js';
import { SCHEDULABLE_SERVICE_EVENTS } from '../../../../../../src/utils/scheduler/SchedulableService.js';
import { CONFIG, drainMicrotasks, makeOperations, makeState } from '../epochCoordinatorTestHelpers.js';

const isBareRuntime = typeof globalThis.Bare !== 'undefined';

const SVC_PATH = '../../../../../../src/core/consensus/services/EpochCoordinatorService.js';
const VDF_MANAGER_PATH = '../../../../../../src/core/consensus/services/VDFServiceManager.js';
const ROUND_PATH = '../../../../../../src/core/consensus/services/EpochCoordinationRound.js';
const LOGGER_PATH = '../../../../../../src/utils/logger.js';

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};

async function setup(overrides = {}) {
    const state = makeState(overrides.stateOverrides);
    const wallet = { address: 'trac1wallet' };
    const config = { ...CONFIG, ...(overrides.config ?? {}) };
    const manager = {
        connect: sinon.stub().resolves(),
        ...(overrides.managerOverrides ?? {}),
    };
    const operations = overrides.operations ?? {};
    const logger = {
        debug: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        info: sinon.stub(),
    };
    const vdfManager = {
        operations,
        close: sinon.stub().resolves(),
    };
    vdfManager.open = sinon.stub().callsFake(async () => vdfManager.operations);
    vdfManager.replace = sinon.stub().callsFake(async () => vdfManager.operations);
    Object.assign(vdfManager, overrides.vdfManagerOverrides);

    let vdfManagerArgs;
    const MockVdfManager = class {
        constructor(...args) {
            vdfManagerArgs = args;
            return vdfManager;
        }
    };

    const roundRun = sinon.stub().resolves();
    const roundConstructed = sinon.stub();
    const rounds = [];
    const MockEpochCoordinationRound = class {
        constructor(options) {
            this.options = options;
            this.cancel = sinon.stub().resolves();
            rounds.push(this);
            roundConstructed(options);
        }

        run(next) {
            return roundRun(next);
        }
    };

    const mocks = {
        [VDF_MANAGER_PATH]: { VDFServiceManager: MockVdfManager },
        [LOGGER_PATH]: { Logger: class { constructor() { return logger; } } },
    };
    if (!overrides.useRealRound) {
        mocks[ROUND_PATH] = { EpochCoordinationRound: MockEpochCoordinationRound };
    }

    const { default: esmock } = await import('esmock');
    const { default: Service } = await esmock(SVC_PATH, mocks);

    const service = new Service(state, wallet, config, manager);
    await service.ready();

    return {
        service,
        state,
        wallet,
        config,
        manager,
        operations,
        logger,
        vdfManager,
        vdfManagerArgs,
        roundRun,
        roundConstructed,
        rounds,
    };
}

if (isBareRuntime) {
    test('EpochCoordinatorService coverage is Node-only', t => {
        t.pass('skipped in Bare because esmock depends on node:module');
    });
} else {
    test('ready opens the VDF manager and subscribes to config changes', async t => {
        const context = await setup();
        t.teardown(() => context.service.close());

        t.ok(context.vdfManager.open.calledOnce);
        t.alike(context.vdfManagerArgs, [
            context.state,
            context.wallet,
            context.config,
        ]);
        t.is(context.state.listenerCount(CustomEventType.CONSENSUS_CONFIG_CHANGED), 1);
    });

    test('close stops scheduling, cancels the round, closes VDF and removes the config listener', async t => {
        const context = await setup();
        const trace = [];
        context.service.on(SCHEDULABLE_SERVICE_EVENTS.STOP, () => trace.push('stop'));
        context.vdfManager.close.callsFake(async () => trace.push('vdf-close'));
        await context.service.start();
        await context.service.worker(sinon.stub(), sinon.stub());

        await context.service.close();

        t.ok(context.rounds[0].cancel.calledOnce);
        t.ok(context.vdfManager.close.calledOnce);
        t.alike(trace, ['stop', 'vdf-close']);
        t.is(context.state.listenerCount(CustomEventType.CONSENSUS_CONFIG_CHANGED), 0);
        t.is(await context.service.stop(), false);
    });

    test('start and stop preserve the inherited return contract', async t => {
        const context = await setup();
        t.teardown(() => context.service.close());

        t.is(await context.service.start(), true);
        t.is(await context.service.start(), false);
        t.is(await context.service.stop(), true);
        t.is(await context.service.stop(), false);
        t.is(await context.service.start(), true);
    });

    test('start accepts the initial delay from SchedulableService', async t => {
        const clock = sinon.useFakeTimers();
        let context;

        try {
            context = await setup();
            await context.service.start(25);

            await clock.tickAsync(24);
            t.absent(context.roundConstructed.called);

            await clock.tickAsync(1);
            t.ok(context.roundConstructed.calledOnce);
        } finally {
            await context?.service.close();
            clock.restore();
        }
    });

    test('stop(true) waits for an operation that was already started', async t => {
        const clock = sinon.useFakeTimers();
        let context;
        try {
            const calculation = deferred();
            const operations = makeOperations({
                calculateVDF: sinon.stub().returns(calculation.promise),
            });
            context = await setup({ useRealRound: true, operations });
            await context.service.start();
            await clock.tickAsync(CONFIG.epochInterval);
            await drainMicrotasks();
            t.ok(operations.calculateVDF.calledOnce);

            let stopFinished = false;
            const stopping = context.service.stop(true).then((result) => {
                stopFinished = true;
                return result;
            });
            await drainMicrotasks();
            t.absent(stopFinished);

            calculation.resolve({
                solution: new Uint8Array(8),
                difficulty: 100,
                discriminantSizeBits: 2048,
            });
            t.is(await stopping, true);
        } finally {
            await context?.service.close();
            clock.restore();
        }
    });

    test('worker delegates one scheduler run to one coordination round', async t => {
        const context = await setup();
        t.teardown(() => context.service.close());
        const next = sinon.stub();
        const hold = sinon.stub();

        await context.service.start();
        await context.service.worker(next, hold);

        t.ok(hold.calledOnce);
        t.ok(context.roundConstructed.calledOnce);
        t.ok(context.roundRun.calledOnce);
        t.is(context.rounds[0].options.state, context.state);
        t.is(context.rounds[0].options.wallet, context.wallet);
        t.is(context.rounds[0].options.config, context.config);
        t.is(context.rounds[0].options.manager, context.manager);
        t.is(context.rounds[0].options.logger, context.logger);
        t.is(context.rounds[0].options.operations, context.operations);
        t.is(context.rounds[0].options.intervalMs, CONFIG.epochInterval);
        sinon.assert.callOrder(hold, context.roundConstructed, context.roundRun);

        context.roundRun.firstCall.args[0](123);
        t.ok(next.calledOnceWith(123));
    });

    test('worker does nothing after the service is stopped', async t => {
        const context = await setup();
        t.teardown(() => context.service.close());
        await context.service.start();
        await context.service.stop();

        await context.service.worker(sinon.stub(), sinon.stub());

        t.absent(context.roundConstructed.called);
    });

    test('config change cancels the current round, replaces VDF and starts immediately', async t => {
        const clock = sinon.useFakeTimers();
        let context;
        try {
            const replacement = deferred();
            const freshOperations = {};
            context = await setup({
                vdfManagerOverrides: { replace: sinon.stub().returns(replacement.promise) },
            });
            await context.service.start();
            await context.service.worker(sinon.stub(), sinon.stub());
            const staleNext = context.roundRun.firstCall.args[0];

            await context.state.emit(CustomEventType.CONSENSUS_CONFIG_CHANGED);

            t.ok(context.rounds[0].cancel.calledOnce);
            t.ok(context.vdfManager.replace.calledOnce);
            t.is(context.roundConstructed.callCount, 1);

            context.vdfManager.operations = freshOperations;
            replacement.resolve(freshOperations);
            await drainMicrotasks();
            await clock.tickAsync(0);

            t.is(context.roundConstructed.callCount, 2);
            t.is(context.rounds[1].options.operations, freshOperations);

            staleNext(0);
            await clock.tickAsync(0);
            t.is(context.roundConstructed.callCount, 2);
        } finally {
            await context?.service.close();
            clock.restore();
        }
    });

    test('duplicate config signals share one pending VDF replacement', async t => {
        const replacement = deferred();
        const context = await setup({
            vdfManagerOverrides: { replace: sinon.stub().returns(replacement.promise) },
        });
        t.teardown(() => context.service.close());
        await context.service.start();

        await context.state.emit(CustomEventType.CONSENSUS_CONFIG_CHANGED);
        await context.state.emit(CustomEventType.CONSENSUS_CONFIG_CHANGED);

        t.ok(context.vdfManager.replace.calledOnce);
        replacement.resolve(context.operations);
        await drainMicrotasks();
    });

    test('stop during config reset prevents a scheduler restart', async t => {
        const clock = sinon.useFakeTimers();
        let context;
        try {
            const replacement = deferred();
            context = await setup({
                vdfManagerOverrides: { replace: sinon.stub().returns(replacement.promise) },
            });
            await context.service.start();
            await context.state.emit(CustomEventType.CONSENSUS_CONFIG_CHANGED);
            await context.service.stop(false);

            replacement.resolve(context.operations);
            await drainMicrotasks();
            await clock.tickAsync(0);

            t.absent(context.roundConstructed.called);
        } finally {
            await context?.service.close();
            clock.restore();
        }
    });

    test('stop(true) still waits for an old round after config reset used stop(false)', async t => {
        const clock = sinon.useFakeTimers();
        let context;
        try {
            const connection = deferred();
            context = await setup({
                useRealRound: true,
                operations: makeOperations(),
                stateOverrides: { indexerCount: sinon.stub().resolves(3) },
                managerOverrides: { connect: sinon.stub().returns(connection.promise) },
            });
            await context.service.start();
            await clock.tickAsync(CONFIG.epochInterval);
            await drainMicrotasks();
            t.ok(context.manager.connect.calledOnce);

            await context.state.emit(CustomEventType.CONSENSUS_CONFIG_CHANGED);
            let stopped = false;
            const stopping = context.service.stop(true).then(() => {
                stopped = true;
            });
            await drainMicrotasks();
            t.absent(stopped);

            connection.resolve();
            await stopping;
            t.ok(stopped);
        } finally {
            await context?.service.close();
            clock.restore();
        }
    });

    test('a failed VDF replacement retries after backoff and restarts the scheduler', async t => {
        const clock = sinon.useFakeTimers();
        let context;
        try {
            const freshOperations = {};
            const replace = sinon.stub();
            replace.onFirstCall().rejects(new Error('startup failed'));
            replace.onSecondCall().callsFake(async () => {
                context.vdfManager.operations = freshOperations;
                return freshOperations;
            });
            context = await setup({
                vdfManagerOverrides: {
                    replace,
                },
            });
            await context.service.start();

            await context.state.emit(CustomEventType.CONSENSUS_CONFIG_CHANGED);
            await drainMicrotasks();

            t.ok(replace.calledOnce);
            t.ok(context.logger.error.calledOnce);
            t.absent(context.roundConstructed.called);

            await context.state.emit(CustomEventType.CONSENSUS_CONFIG_CHANGED);
            await drainMicrotasks();
            t.ok(replace.calledOnce, 'a config signal during backoff shares the active reload');

            await clock.tickAsync(CONFIG.epochBackoffDelay - 1);
            t.ok(replace.calledOnce);
            t.absent(context.roundConstructed.called);

            await clock.tickAsync(1);
            await drainMicrotasks();
            await clock.tickAsync(0);
            await drainMicrotasks();
            await clock.tickAsync(1);

            t.ok(replace.calledTwice);
            t.ok(context.roundConstructed.calledOnce);
            t.is(context.rounds[0].options.operations, freshOperations);
        } finally {
            await context?.service.close();
            clock.restore();
        }
    });

    test('stop cancels a pending config reload retry', async t => {
        const clock = sinon.useFakeTimers();
        let context;
        try {
            const replace = sinon.stub().rejects(new Error('startup failed'));
            context = await setup({ vdfManagerOverrides: { replace } });
            await context.service.start();

            await context.state.emit(CustomEventType.CONSENSUS_CONFIG_CHANGED);
            await drainMicrotasks();
            t.ok(replace.calledOnce);

            await context.service.stop(false);
            await clock.tickAsync(CONFIG.epochBackoffDelay);

            t.ok(replace.calledOnce);
            t.absent(context.roundConstructed.called);
        } finally {
            await context?.service.close();
            clock.restore();
        }
    });

    test('close cancels a pending config reload retry', async t => {
        const clock = sinon.useFakeTimers();
        let context;
        try {
            const replace = sinon.stub().rejects(new Error('startup failed'));
            context = await setup({ vdfManagerOverrides: { replace } });
            await context.service.start();

            await context.state.emit(CustomEventType.CONSENSUS_CONFIG_CHANGED);
            await drainMicrotasks();
            t.ok(replace.calledOnce);

            await context.service.close();
            await clock.tickAsync(CONFIG.epochBackoffDelay);

            t.ok(replace.calledOnce);
            t.absent(context.roundConstructed.called);
            t.is(context.state.listenerCount(CustomEventType.CONSENSUS_CONFIG_CHANGED), 0);
        } finally {
            await context?.service.close();
            clock.restore();
        }
    });

    test('config change closes VDF without starting a stopped coordinator', async t => {
        const context = await setup();
        t.teardown(() => context.service.close());

        await context.state.emit(CustomEventType.CONSENSUS_CONFIG_CHANGED);
        await drainMicrotasks();

        t.ok(context.vdfManager.close.calledOnce);
        t.absent(context.vdfManager.replace.called);
        t.absent(context.roundConstructed.called);
    });

    test('close during config reset cannot start a fresh round', async t => {
        const clock = sinon.useFakeTimers();
        let context;
        try {
            const replacement = deferred();
            context = await setup({
                vdfManagerOverrides: { replace: sinon.stub().returns(replacement.promise) },
            });
            await context.service.start();
            await context.state.emit(CustomEventType.CONSENSUS_CONFIG_CHANGED);

            const closing = context.service.close();
            replacement.resolve(context.operations);
            await closing;
            await drainMicrotasks();
            await clock.tickAsync(0);

            t.absent(context.roundConstructed.called);
            t.is(context.state.listenerCount(CustomEventType.CONSENSUS_CONFIG_CHANGED), 0);
        } finally {
            await context?.service.close();
            clock.restore();
        }
    });
}
