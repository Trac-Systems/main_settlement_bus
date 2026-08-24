import test from 'brittle';
import sinon from 'sinon';
import { CustomEventType } from '../../../../../../src/utils/constants.js';
import { SCHEDULABLE_SERVICE_EVENTS } from '../../../../../../src/utils/scheduler/SchedulableService.js';
import { CONFIG, makeOperations, makeState } from '../epochCoordinatorTestHelpers.js';

const isBareRuntime = typeof globalThis.Bare !== 'undefined';

const SVC_PATH = '../../../../../../src/core/consensus/services/EpochCoordinatorService.js';
const CREATE_VDF_PATH = '../../../../../../src/core/consensus/services/createVDFService.js';
const OPERATIONS_PATH = '../../../../../../src/core/consensus/services/EpochCoordinatorOperations.js';
const ROUND_PATH = '../../../../../../src/core/consensus/services/EpochCoordinationRound.js';
const LOGGER_PATH = '../../../../../../src/utils/logger.js';

async function setup(overrides = {}) {
    const state = makeState(overrides.stateOverrides);
    const wallet = { address: 'trac1wallet' };
    const config = { ...CONFIG, ...(overrides.config ?? {}) };
    const manager = { connect: sinon.stub().resolves() };
    const vdfService = {
        ready: sinon.stub().resolves(),
        close: sinon.stub().resolves(),
    };
    const createVDFService = sinon.stub().resolves(vdfService);
    const operations = overrides.operations ?? {};
    const logger = {};
    let operationsArgs;

    const MockCoordinatorOperations = class {
        constructor(...args) {
            operationsArgs = args;
            return operations;
        }
    };

    const roundRun = sinon.stub().resolves();
    const roundConstructed = sinon.stub();
    const rounds = [];
    const MockEpochCoordinationRound = class {
        constructor(options) {
            this.options = options;
            rounds.push(this);
            roundConstructed(options);
        }

        run(next) {
            return roundRun(next);
        }
    };

    const mocks = {
        [CREATE_VDF_PATH]: { createVDFService },
        [OPERATIONS_PATH]: { EpochCoordinatorOperations: MockCoordinatorOperations },
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
        vdfService,
        createVDFService,
        operations,
        logger,
        operationsArgs,
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
    test('ready initializes the VDF service and coordinator operations', async t => {
        const context = await setup();
        t.teardown(() => context.service.close());

        t.ok(context.createVDFService.calledOnce);
        t.ok(context.vdfService.ready.calledOnce);
        t.alike(context.operationsArgs, [
            context.state,
            context.vdfService,
            context.wallet,
            context.config,
        ]);
    });

    test('close stops the scheduler and closes its VDF resource', async t => {
        const { service, vdfService } = await setup();
        const trace = [];
        service.on(SCHEDULABLE_SERVICE_EVENTS.STOP, () => trace.push('stop'));
        vdfService.close.callsFake(async () => trace.push('vdf-close'));
        await service.start();
        await service.close();

        t.ok(vdfService.close.calledOnce);
        t.alike(trace, ['stop', 'vdf-close']);
        t.is(await service.stop(), false);
    });

    test('close broadcasts STOP to an in-flight round and removes its state listeners', async t => {
        const context = await setup({
            useRealRound: true,
            operations: makeOperations(),
        });
        t.teardown(() => context.service.close());

        await context.service.worker(sinon.stub(), sinon.stub());
        t.is(context.state.listenerCount(CustomEventType.EPOCH_CREATED), 2);

        await context.service.close();
        t.is(context.state.listenerCount(CustomEventType.EPOCH_CREATED), 0);
    });

    test('start returns true when the scheduler was stopped', async t => {
        const { service } = await setup();
        t.teardown(() => service.close());
        t.is(await service.start(), true);
    });

    test('start returns false when the scheduler is already running', async t => {
        const { service } = await setup();
        t.teardown(() => service.close());
        await service.start();
        t.is(await service.start(), false);
    });

    test('stop returns false when the scheduler was not running', async t => {
        const { service } = await setup();
        t.teardown(() => service.close());
        t.is(await service.stop(), false);
    });

    test('stop returns true when the scheduler was running', async t => {
        const { service } = await setup();
        t.teardown(() => service.close());
        await service.start();
        t.is(await service.stop(), true);
    });

    test('worker schedules another check without creating a round when the epoch is absent', async t => {
        const { service, roundConstructed } = await setup({
            stateOverrides: { getCurrentEpoch: sinon.stub().resolves(null) },
        });
        t.teardown(() => service.close());
        const next = sinon.stub();
        const hold = sinon.stub();

        await service.worker(next, hold);

        t.ok(next.calledOnceWith(CONFIG.epochInterval));
        t.absent(hold.called);
        t.absent(roundConstructed.called);
    });

    test('worker does not create a round after the service is interrupted', async t => {
        const { service, roundConstructed } = await setup();
        t.teardown(() => service.close());
        await service.start();
        await service.stop();

        await service.worker(sinon.stub(), sinon.stub());

        t.absent(roundConstructed.called);
    });

    test('worker delegates an initialized epoch to a new coordination round', async t => {
        const context = await setup({
            stateOverrides: { getCurrentEpoch: sinon.stub().resolves(0n) },
        });
        t.teardown(() => context.service.close());
        const next = sinon.stub();
        const hold = sinon.stub();

        await context.service.worker(next, hold);

        t.ok(hold.calledOnce);
        t.ok(context.roundConstructed.calledOnce);
        t.ok(context.roundRun.calledOnceWith(next));
        t.is(context.rounds[0].options.state, context.state);
        t.is(context.rounds[0].options.wallet, context.wallet);
        t.is(context.rounds[0].options.config, context.config);
        t.is(context.rounds[0].options.manager, context.manager);
        t.is(context.rounds[0].options.logger, context.logger);
        t.is(context.rounds[0].options.operations, context.operations);
        t.is(context.rounds[0].options.stopEmitter, context.service);
        t.is(context.rounds[0].options.intervalMs, CONFIG.epochInterval);
        sinon.assert.callOrder(hold, context.roundConstructed, context.roundRun);
    });
}
