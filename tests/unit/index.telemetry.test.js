import { test } from 'brittle';
import sinon from 'sinon';
import EventEmitter from 'bare-events';
import { EventType } from '../../src/utils/constants.js';
import { MsbDiagnostics } from '../../src/utils/msbDiagnostics.js';
import { Telemetry } from '../../src/utils/telemetry.js';

const isBareRuntime = typeof globalThis.Bare !== 'undefined';

async function load(t, options = {}) {
    const { default: esmock } = await import('esmock');
    const events = [];
    const telemetry = new Telemetry({
        enabled: options.enabled !== false,
        url: 'http://collector.invalid/gelf',
        host: 'test-node',
        environment: 'test',
        allowInTests: true,
    });
    telemetry.onEvent(event => events.push(event));
    // Model a collector which never acknowledges, without opening any sockets.
    // The actual bounded Telemetry.close implementation must cancel these tasks.
    const send = sinon.stub(telemetry, 'send').callsFake(() => {
        const task = { cancel: () => telemetry.active.delete(task) };
        telemetry.active.add(task);
    });
    t.teardown(() => send.restore());
    const consoleLog = sinon.stub(console, 'log');
    t.teardown(() => consoleLog.restore());
    let state;
    let network;
    class CorestoreMock {
        constructor() { this.close = sinon.stub().resolves(); }
    }
    class StateMock extends EventEmitter {
        constructor() {
            super();
            this.base = new EventEmitter();
            this.ready = sinon.stub().resolves();
            this.close = sinon.stub().resolves();
            this.getAdminEntry = sinon.stub().resolves(null);
            this.isWritable = sinon.stub().returns(false);
            this.isIndexer = sinon.stub().returns(false);
            this.getUnsignedLength = sinon.stub().returns(0);
            this.getSignedLength = sinon.stub().returns(0);
            this.get = sinon.stub().resolves(null);
            this.getSigned = sinon.stub().resolves(null);
            state = this;
        }
    }
    class NetworkMock {
        constructor() {
            this.ready = options.startupError ? sinon.stub().rejects(options.startupError) : sinon.stub().resolves();
            this.close = options.shutdownError ? sinon.stub().rejects(options.shutdownError) : sinon.stub().resolves();
            this.replicate = sinon.stub().resolves();
            this.disconnectValidatorPeer = sinon.stub();
            this.diagnostics = () => ({ connected_validators: 0 });
            network = this;
        }
    }
    class Diagnostics extends MsbDiagnostics {
        constructor(config) { super(config, { telemetry }); }
    }
    const { MainSettlementBus } = await esmock('../../src/index.js', {
        corestore: CorestoreMock,
        '../../src/core/state/State.js': StateMock,
        '../../src/core/network/Network.js': NetworkMock,
        '../../src/utils/check.js': class CheckMock {},
        '../../src/utils/telemetry.js': { getTelemetry: () => telemetry },
        '../../src/utils/msbDiagnostics.js': { MsbDiagnostics: Diagnostics },
        '../../src/utils/helpers.js': { sleep: async () => {} },
    });
    const clock = sinon.useFakeTimers({
        now: 1000,
        toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    t.teardown(() => clock.restore());
    const config = {
        storesFullPath: '/tmp/msb-telemetry-lifecycle-test',
        enableInteractiveMode: false, enableWallet: false, enableRoleRequester: false,
        graylog: { intervalMs: 30000, host: 'test-node' },
    };
    const msb = new MainSettlementBus(config);
    return {
        msb, clock, telemetry, events, send,
        get state() { return state; },
        get network() { return network; },
        find: name => events.filter(event => event.event === name),
    };
}

if (isBareRuntime) {
    test('MainSettlementBus lifecycle telemetry tests are Node-only', t => {
        t.pass('esmock depends on node:module');
    });
} else {
    test('MainSettlementBus stops diagnostic timers and bounds collector drain after startup failure', async t => {
        const error = new Error('network startup failed');
        const { msb, clock, telemetry, find, events } = await load(t, { startupError: error });
        const opened = msb.ready().then(() => null, failure => failure);
        await clock.tickAsync(0);
        t.is(find('node.start_failed').length, 1);
        t.is(find('node.ready').length, 0);
        t.is(telemetry.closed, true);
        t.is(clock.countTimers(), 1, 'only the bounded collector drain timeout remains');
        await clock.tickAsync(1600);
        t.is(await opened, error, 'startup keeps the original failure');
        await msb.close();
        t.is(clock.countTimers(), 0);
        t.is(telemetry.listeners.size, 0);
        t.is(telemetry.active.size, 0);
        t.is(telemetry.queue.length, 0);
        const eventCount = events.length;
        await clock.tickAsync(90000);
        t.is(events.length, eventCount, 'a failed node cannot continue generating progress snapshots');
    });

    test('MainSettlementBus shutdown failure still stops diagnostics and closes stalled telemetry', async t => {
        const error = new Error('network close failed');
        const { msb, clock, telemetry, find } = await load(t, { shutdownError: error });
        await msb.ready();
        t.is(clock.countTimers(), 2, 'progress and confirmation timers started');
        const closed = msb.close().then(() => null, failure => failure);
        await clock.tickAsync(0);
        t.is(find('node.stopping').length, 1);
        t.is(find('node.stop_failed').length, 1);
        t.is(find('node.stopped').length, 0, 'failed shutdown must not report successful stop');
        t.is(clock.countTimers(), 1, 'diagnostics stopped before collector drain');
        await clock.tickAsync(1600);
        t.is(await closed, error, 'shutdown keeps the original failure');
        t.is(telemetry.closed, true);
        t.is(telemetry.active.size, 0);
        t.is(clock.countTimers(), 0);
    });

    test('MainSettlementBus emits role changes with one boot identity and stops cleanly', async t => {
        const loaded = await load(t);
        await loaded.msb.ready();
        for (const event of [EventType.IS_INDEXER, EventType.IS_NON_INDEXER, EventType.WRITABLE, EventType.UNWRITABLE]) {
            loaded.state.base.emit(event);
        }
        t.alike(loaded.find('node.role_changed').map(event => [event.fields.role, event.fields.enabled]), [
            ['indexer', 'true'], ['indexer', 'false'], ['writable', 'true'], ['writable', 'false'],
        ]);
        const bootIds = new Set(loaded.events.map(event => event.fields.boot_id));
        t.is(bootIds.size, 1);
        t.ok(loaded.events[0].fields.boot_id);
        t.is(loaded.find('node.ready').length, 1);
        const closing = loaded.msb.close();
        await loaded.clock.tickAsync(1600);
        await closing;
        t.is(loaded.find('node.stopped').length, 1);
        t.is(loaded.find('node.stop_failed').length, 0);
        t.is(loaded.clock.countTimers(), 0);
        const eventCount = loaded.events.length;
        loaded.state.base.emit(EventType.WRITABLE);
        await loaded.clock.tickAsync(60000);
        t.is(loaded.events.length, eventCount, 'closed telemetry does not emit late role or progress events');
    });

    test('MainSettlementBus with telemetry disabled creates no monitoring timers or collector tasks', async t => {
        const { msb, clock, telemetry, events, send } = await load(t, { enabled: false });
        await msb.ready();
        t.is(clock.countTimers(), 0);
        t.is(events.length, 0);
        t.is(send.callCount, 0);
        await msb.close();
        t.is(telemetry.closed, true);
        t.is(clock.countTimers(), 0);
    });
}
