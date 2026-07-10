import { test } from 'brittle';
import sinon from 'sinon';
import EventEmitter from 'bare-events';
import b4a from 'b4a';
import { WalletProvider } from 'trac-wallet';
import { OperationType } from '../../src/utils/constants.js';
import { safeDecodeApplyOperation } from '../../src/codecs/apply/applyOperationCodec.js';
import { addressToBuffer } from '../../src/core/state/utils/address.js';
import { overrideConfig } from '../helpers/config.js';
import { testKeyPair1 } from '../fixtures/apply.fixtures.js';
import { errorMessageIncludes } from '../helpers/regexHelper.js';

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
            this.writingKey = b4a.alloc(32, 1);
            this.ready = sinon.stub().resolves();
            this.close = sinon.stub().resolves();
            this.getAdminEntry = sinon.stub().resolves(null);
            this.getNodeEntry = sinon.stub().resolves(null);
            this.getSigned = sinon.stub().resolves(null);
            this.getSignedVDFParams = sinon.stub().resolves(null);
            this.getIndexerSequenceState = sinon.stub().resolves(b4a.from('11'.repeat(32), 'hex'));
            this.append = sinon.stub().resolves();
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

function buildGenesisConfig(overrides = {}) {
    return overrideConfig({
        storesDirectory: '/tmp/msb-index-test',
        enableInteractiveMode: false,
        enableRoleRequester: false,
        enableWallet: true,
        ...overrides,
    });
}

async function createWallet(config) {
    return await new WalletProvider(config).fromMnemonic({
        mnemonic: testKeyPair1.mnemonic,
        derivationPath: config.derivationPath
    });
}

function adminEntryFor(wallet, state, overrides = {}) {
    return {
        address: wallet.address,
        wk: state.writingKey,
        ...overrides,
    };
}

if (isBareRuntime) {
    test('MainSettlementBus startup role log coverage is Node-only', t => {
        t.pass('skipped in Bare because esmock depends on node:module');
    });
} else {
    test('MainSettlementBus logs local autobase role status', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const msb = new loaded.MainSettlementBus(buildConfig());

        await msb.ready();

        t.ok(consoleLog.calledWith("isIndexer: false"));
        t.ok(consoleLog.calledWith("isWriter: false"));

        await msb.close();
    });

    test('MainSettlementBus appends genesis epoch initialization with encoded VDF params', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const txValidity = b4a.from('aa'.repeat(32), 'hex');
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.getSigned.resolves(null);
        loaded.state.getIndexerSequenceState.resolves(txValidity);

        await msb.handleEpochGenesisInitialization({
            vdfDifficulty: '55000000',
            vdfDiscriminantSize: '2048',
        });

        t.ok(loaded.state.getSigned.calledOnce);
        t.ok(loaded.state.getIndexerSequenceState.calledOnce);
        t.ok(loaded.state.append.calledOnce);

        const encodedPayload = loaded.state.append.firstCall.args[0];
        const decoded = safeDecodeApplyOperation(encodedPayload);

        t.is(decoded.type, OperationType.SET_GENESIS_EPOCH);
        t.ok(b4a.equals(decoded.address, addressToBuffer(wallet.address, config.addressPrefix)));
        t.ok(b4a.equals(decoded.sgo.txv, txValidity));
        t.is(decoded.sgo.df.length, 4);
        t.is(decoded.sgo.db.length, 2);
        t.is(decoded.sgo.df.readUInt32BE(0), 55000000);
        t.is(decoded.sgo.db.readUInt16BE(0), 2048);

        await msb.close();
    });

    test('MainSettlementBus rejects genesis epoch initialization when wallet is disabled', async t => {
        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig({ enableWallet: false });
        const msb = new loaded.MainSettlementBus(config);

        await t.exception(
            () => msb.handleEpochGenesisInitialization({
                vdfDifficulty: '55000000',
                vdfDiscriminantSize: '2048',
            }),
            errorMessageIncludes('wallet is not enabled')
        );
    });

    test('MainSettlementBus rejects genesis epoch initialization when admin is missing', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(null);

        await t.exception(
            () => msb.handleEpochGenesisInitialization({
                vdfDifficulty: '55000000',
                vdfDiscriminantSize: '2048',
            }),
            errorMessageIncludes('admin has not been initialized')
        );

        t.ok(loaded.state.getSigned.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });

    test('MainSettlementBus rejects genesis epoch initialization when wallet is missing', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const msb = new loaded.MainSettlementBus(config);

        await msb.ready();

        loaded.state.getAdminEntry.resolves({ address: 'admin-address' });

        await t.exception(
            () => msb.handleEpochGenesisInitialization({
                vdfDifficulty: '55000000',
                vdfDiscriminantSize: '2048',
            }),
            errorMessageIncludes('wallet is not initialized')
        );

        t.ok(loaded.state.getSigned.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });

    test('MainSettlementBus rejects genesis epoch initialization for non-admin wallet', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state, {
            address: 'different-admin-address',
        }));

        await t.exception(
            () => msb.handleEpochGenesisInitialization({
                vdfDifficulty: '55000000',
                vdfDiscriminantSize: '2048',
            }),
            errorMessageIncludes('you are not the admin')
        );

        t.ok(loaded.state.getSigned.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });

    test('MainSettlementBus rejects genesis epoch initialization when admin writing key mismatches', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state, {
            wk: b4a.alloc(32, 2),
        }));

        await t.exception(
            () => msb.handleEpochGenesisInitialization({
                vdfDifficulty: '55000000',
                vdfDiscriminantSize: '2048',
            }),
            errorMessageIncludes('you are not the admin')
        );

        t.ok(loaded.state.getSigned.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });

    test('MainSettlementBus rejects genesis epoch initialization when VDF difficulty is not positive', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.getSigned.resolves(null);

        await t.exception(
            () => msb.handleEpochGenesisInitialization({
                vdfDifficulty: '0',
                vdfDiscriminantSize: '2048',
            }),
            errorMessageIncludes('VDF difficulty must be a positive unsigned 32-bit integer.')
        );

        t.ok(loaded.state.getIndexerSequenceState.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });

    test('MainSettlementBus rejects genesis epoch initialization when VDF discriminant size is not positive', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.getSigned.resolves(null);

        await t.exception(
            () => msb.handleEpochGenesisInitialization({
                vdfDifficulty: '55000000',
                vdfDiscriminantSize: '0',
            }),
            errorMessageIncludes('VDF discriminant size must be a positive unsigned 16-bit integer.')
        );

        t.ok(loaded.state.getIndexerSequenceState.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });

    test('MainSettlementBus rejects genesis epoch initialization when VDF params already exist', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.getSigned.resolves(b4a.alloc(6, 1));

        await t.exception(
            () => msb.handleEpochGenesisInitialization({
                vdfDifficulty: '55000000',
                vdfDiscriminantSize: '2048',
            }),
            errorMessageIncludes('VDF parameters already exist')
        );

        t.ok(loaded.state.append.notCalled);
        t.ok(loaded.state.getIndexerSequenceState.notCalled);

        await msb.close();
    });

    test('MainSettlementBus appends set VDF params with encoded difficulty', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const txValidity = b4a.from('bb'.repeat(32), 'hex');
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.getSignedVDFParams.resolves({
            vdfDifficulty: 55000000,
            vdfDiscriminantSize: 2048,
        });
        loaded.state.getIndexerSequenceState.resolves(txValidity);

        await msb.handleSetVdfParams({
            vdfDifficulty: '60000000',
        });

        t.ok(loaded.state.getSignedVDFParams.calledOnce);
        t.ok(loaded.state.getIndexerSequenceState.calledOnce);
        t.ok(loaded.state.append.calledOnce);

        const encodedPayload = loaded.state.append.firstCall.args[0];
        const decoded = safeDecodeApplyOperation(encodedPayload);

        t.is(decoded.type, OperationType.SET_VDF_PARAMS);
        t.ok(b4a.equals(decoded.address, addressToBuffer(wallet.address, config.addressPrefix)));
        t.ok(b4a.equals(decoded.vpo.txv, txValidity));
        t.is(decoded.vpo.df.length, 4);
        t.is(decoded.vpo.df.readUInt32BE(0), 60000000);
        t.absent(decoded.vpo.db);

        await msb.close();
    });

    test('MainSettlementBus rejects set VDF params when wallet is disabled', async t => {
        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig({ enableWallet: false });
        const msb = new loaded.MainSettlementBus(config);

        await t.exception(
            () => msb.handleSetVdfParams({
                vdfDifficulty: '60000000',
            }),
            errorMessageIncludes('wallet is not enabled')
        );
    });

    test('MainSettlementBus rejects set VDF params when admin is missing', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(null);

        await t.exception(
            () => msb.handleSetVdfParams({
                vdfDifficulty: '60000000',
            }),
            errorMessageIncludes('admin has not been initialized')
        );

        t.ok(loaded.state.getSignedVDFParams.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });

    test('MainSettlementBus rejects set VDF params for non-admin wallet', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state, {
            address: 'different-admin-address',
        }));

        await t.exception(
            () => msb.handleSetVdfParams({
                vdfDifficulty: '60000000',
            }),
            errorMessageIncludes('you are not the admin')
        );

        t.ok(loaded.state.getSignedVDFParams.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });

    test('MainSettlementBus rejects set VDF params before VDF params are initialized', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.getSignedVDFParams.rejects(
            new Error('VDF parameters are not initialized.')
        );

        await t.exception(
            () => msb.handleSetVdfParams({
                vdfDifficulty: '60000000',
            }),
            errorMessageIncludes('VDF parameters are not initialized.')
        );

        t.ok(loaded.state.getIndexerSequenceState.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });

    test('MainSettlementBus rejects set VDF params when VDF difficulty is not positive', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.getSignedVDFParams.resolves({
            vdfDifficulty: 55000000,
            vdfDiscriminantSize: 2048,
        });

        await t.exception(
            () => msb.handleSetVdfParams({
                vdfDifficulty: '0',
            }),
            errorMessageIncludes('VDF difficulty must be a positive unsigned 32-bit integer.')
        );

        t.ok(loaded.state.getIndexerSequenceState.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });
}
