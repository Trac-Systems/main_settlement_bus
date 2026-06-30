import { test } from 'brittle';
import sinon from 'sinon';
import EventEmitter from 'bare-events';
const isBareRuntime = typeof globalThis.Bare !== 'undefined';

async function loadMainSettlementBus() {
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
            this.replicate = sinon.stub().resolves();
            this.close = sinon.stub().resolves();
            this.disconnectValidatorPeer = sinon.stub().returns(true);
            networkInstance = this;
        }
    }

    const { MainSettlementBus } = await esmock('../../src/index.js', {
        corestore: CorestoreMock,
        '../../src/core/state/State.js': StateMock,
        '../../src/core/network/Network.js': NetworkMock,
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
    test('MainSettlementBus index coverage is Node-only', t => {
        t.pass('skipped in Bare because esmock depends on node:module');
    });
}
