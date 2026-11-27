import { test } from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import EventEmitter from 'bare-events';
import { CustomEventType, EventType } from '../../src/utils/constants.js';

const isBareRuntime = typeof globalThis.Bare !== 'undefined';

async function loadMainSettlementBus({ replicate = sinon.stub().resolves() } = {}) {
    const { default: esmock } = await import('esmock');
    let stateInstance = null;
    let networkInstance = null;
    let storeInstance = null;

    class CorestoreMock {
        constructor(path) {
            this.path = path;
            this.close = sinon.stub().resolves();
            storeInstance = this;
        }
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
            stateInstance = this;
        }
    }

    class NetworkMock {
        constructor() {
            this.ready = sinon.stub().resolves();
            this.replicate = replicate;
            this.close = sinon.stub().resolves();
            this.disconnectValidatorPeer = sinon.stub().returns(true);
            networkInstance = this;
        }
    }

    class CheckMock {}

    const { MainSettlementBus } = await esmock('../../src/index.js', {
        corestore: CorestoreMock,
        '../../src/core/state/State.js': StateMock,
        '../../src/core/network/Network.js': NetworkMock,
        '../../src/utils/check.js': CheckMock,
        '../../src/utils/fileUtils.js': {
            default: {
                ensureKeyPathDir: sinon.stub().resolves(),
            },
            verifyWalletPath: sinon.stub().resolves(),
        },
        '../../src/utils/helpers.js': {
            sleep: sinon.stub().resolves(),
            isHexString: (value) => /^[0-9a-fA-F]+$/.test(value),
        },
    });

    return {
        MainSettlementBus,
        get state() {
            return stateInstance;
        },
        get network() {
            return networkInstance;
        },
        get store() {
            return storeInstance;
        },
    };
}

function buildConfig() {
    return {
        storesFullPath: '/tmp/msb-index-test',
        enableInteractiveMode: false,
        enableWallet: false,
        enableRoleRequester: false,
    };
}

if (isBareRuntime) {
    test('MainSettlementBus state event listener coverage is Node-only', t => {
        t.pass('skipped in Bare because esmock depends on node:module');
    });
} else {
    test('MainSettlementBus releases state listeners when replication fails to start', async t => {
        const loaded = await loadMainSettlementBus({ replicate: sinon.stub().rejects(new Error('replication failed')) });
        const msb = new loaded.MainSettlementBus(buildConfig());
        await t.exception(() => msb.ready(), /replication failed/);
        await msb.close();
        t.is(loaded.state.listenerCount(CustomEventType.IS_INDEXER), 0);
        t.is(loaded.state.base.listenerCount(EventType.WRITABLE), 0);
        t.ok(loaded.network.close.calledOnce);
    });

    test('MainSettlementBus disconnects validator peers when state role events invalidate them', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const msb = new loaded.MainSettlementBus(buildConfig());

        await msb.ready();
        t.teardown(async () => {
            if (msb.opened) await msb.close();
        });

        const publicKey = b4a.alloc(32, 7);

        loaded.state.emit(CustomEventType.UNWRITABLE, publicKey);
        loaded.state.emit(CustomEventType.IS_INDEXER, publicKey);

        t.is(loaded.network.disconnectValidatorPeer.callCount, 2, 'two state role events should disconnect validator peers');
        t.alike(
            loaded.network.disconnectValidatorPeer.firstCall.args,
            [publicKey, 'peer became unwritable'],
            'unwritable state event should disconnect with the expected reason'
        );
        t.alike(
            loaded.network.disconnectValidatorPeer.secondCall.args,
            [publicKey, 'peer promoted to indexer'],
            'indexer state event should disconnect with the expected reason'
        );

        await msb.close();
    });

    test('MainSettlementBus ignores validator invalidation events while closing', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const msb = new loaded.MainSettlementBus(buildConfig());

        await msb.ready();
        const events = [
            [loaded.state, CustomEventType.IS_INDEXER],
            [loaded.state, CustomEventType.UNWRITABLE],
            [loaded.state.base, EventType.IS_INDEXER],
            [loaded.state.base, EventType.IS_NON_INDEXER],
            [loaded.state.base, EventType.WRITABLE],
            [loaded.state.base, EventType.UNWRITABLE],
        ];
        const otherListener = sinon.spy();
        for (const [emitter, event] of events) emitter.on(event, otherListener);
        const closing = msb.close();
        for (const [emitter, event] of events) {
            t.alike(emitter.rawListeners(event), [otherListener], event);
        }
        loaded.network.disconnectValidatorPeer.resetHistory();
        loaded.state.emit(CustomEventType.UNWRITABLE, b4a.alloc(32, 8));
        loaded.state.emit(CustomEventType.IS_INDEXER, b4a.alloc(32, 9));

        t.ok(otherListener.calledTwice);
        t.is(loaded.network.disconnectValidatorPeer.callCount, 0, 'closing nodes should not mutate validator connections from late events');
        await closing;
    });
}
