import { test } from 'brittle';
import sinon from 'sinon';
import EventEmitter from 'bare-events';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { WalletProvider } from 'trac-wallet';
import { OperationType } from '../../src/utils/constants.js';
import {
    encodeConsensusConfig,
    safeDecodeApplyOperation
} from '../../src/codecs/apply/applyOperationCodec.js';
import { decodeVdfConfig } from '../../src/codecs/consensus/v1/vdfConfigCodec.js';
import { addressToBuffer } from '../../src/core/state/utils/address.js';
import { createMessage } from '../../src/utils/buffer.js';
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
            this.getSignedConsensusConfig = sinon.stub().resolves(null);
            this.requireSignedConsensusConfig = sinon.stub().resolves({
                schemaVersion: 1,
                configData: {
                    difficulty: 55_000_000,
                    discriminantBitSize: 2048,
                }
            });
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

function validConsensusConfig() {
    return {
        schemaVersion: 1,
        configData: {
            difficulty: 60_000_000,
            discriminantBitSize: 2048,
        },
    };
}

function validGenesisConsensusConfig(configData = {}) {
    return {
        schemaVersion: 1,
        configData: {
            difficulty: 55_000_000,
            discriminantBitSize: 2048,
            ...configData,
        },
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

    test('MainSettlementBus appends genesis epoch initialization with generic consensus config', async t => {
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

        await msb.handleEpochGenesisInitialization(validGenesisConsensusConfig());

        t.ok(loaded.state.getSignedConsensusConfig.calledOnce);
        t.ok(loaded.state.getIndexerSequenceState.calledOnce);
        t.ok(loaded.state.append.calledOnce);

        const encodedPayload = loaded.state.append.firstCall.args[0];
        const decoded = safeDecodeApplyOperation(encodedPayload);

        t.is(decoded.type, OperationType.SET_GENESIS_EPOCH);
        t.ok(b4a.equals(decoded.address, addressToBuffer(wallet.address, config.addressPrefix)));
        t.ok(b4a.equals(decoded.cco.txv, txValidity));
        t.is(decoded.cco.cc.sv.readUInt8(0), 1);

        const decodedVdfConfig = decodeVdfConfig(decoded.cco.cc.cd);
        t.is(decodedVdfConfig.difficulty.readUInt32BE(0), 55_000_000);
        t.is(decodedVdfConfig.discriminantBitSize.readUInt16BE(0), 2048);

        const encodedConsensusConfig = encodeConsensusConfig(decoded.cco.cc);
        const message = createMessage(
            config.networkId,
            decoded.cco.txv,
            encodedConsensusConfig,
            decoded.cco.in,
            OperationType.SET_GENESIS_EPOCH
        );
        const expectedHash = await tracCryptoApi.hash.blake3(message);
        t.ok(b4a.equals(decoded.cco.tx, expectedHash));

        await msb.close();
    });

    test('MainSettlementBus rejects genesis epoch initialization when wallet is disabled', async t => {
        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig({ enableWallet: false });
        const msb = new loaded.MainSettlementBus(config);

        await t.exception(
            () => msb.handleEpochGenesisInitialization(validGenesisConsensusConfig()),
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
            () => msb.handleEpochGenesisInitialization(validGenesisConsensusConfig()),
            errorMessageIncludes('admin has not been initialized')
        );

        t.ok(loaded.state.getSignedConsensusConfig.notCalled);
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
            () => msb.handleEpochGenesisInitialization(validGenesisConsensusConfig()),
            errorMessageIncludes('wallet is not initialized')
        );

        t.ok(loaded.state.getSignedConsensusConfig.notCalled);
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
            () => msb.handleEpochGenesisInitialization(validGenesisConsensusConfig()),
            errorMessageIncludes('you are not the admin')
        );

        t.ok(loaded.state.getSignedConsensusConfig.notCalled);
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
            () => msb.handleEpochGenesisInitialization(validGenesisConsensusConfig()),
            errorMessageIncludes('you are not the admin')
        );

        t.ok(loaded.state.getSignedConsensusConfig.notCalled);
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
        loaded.state.getSignedConsensusConfig.resolves(null);

        await t.exception(
            () => msb.handleEpochGenesisInitialization(validGenesisConsensusConfig({difficulty: 0})),
            errorMessageIncludes('VDF difficulty must be a positive unsigned 32-bit integer.')
        );

        t.ok(loaded.state.getIndexerSequenceState.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });

    test('MainSettlementBus rejects genesis epoch initialization with an unsupported VDF discriminant bit size', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.getSignedConsensusConfig.resolves(null);

        await t.exception(
            () => msb.handleEpochGenesisInitialization(validGenesisConsensusConfig({discriminantBitSize: 0})),
            errorMessageIncludes('VDF discriminant bit size must be one of: 1024, 2048, 4096.')
        );

        t.ok(loaded.state.getIndexerSequenceState.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });

    test('MainSettlementBus rejects invalid generic genesis config before submission', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.getSignedConsensusConfig.resolves(null);

        const invalidConfigs = [
            null,
            [],
            'config',
            {},
            { schemaVersion: 1 },
            { configData: {} },
            { schemaVersion: 1, configData: {}, extra: true },
            { schemaVersion: '1', configData: {} },
            { schemaVersion: 0, configData: {} },
            { schemaVersion: 256, configData: {} },
            { schemaVersion: 2, configData: {} },
        ];

        for (const invalidConfig of invalidConfigs) {
            await t.exception(() => msb.handleEpochGenesisInitialization(invalidConfig));
        }

        t.ok(loaded.state.getIndexerSequenceState.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });

    test('MainSettlementBus rejects genesis epoch initialization when consensus config already exists', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.getSignedConsensusConfig.resolves({
            schemaVersion: 1,
            configData: {
                difficulty: 16_843_009,
                discriminantBitSize: 257,
            }
        });

        await t.exception(
            () => msb.handleEpochGenesisInitialization(validGenesisConsensusConfig()),
            errorMessageIncludes('consensus config already exists')
        );

        t.ok(loaded.state.append.notCalled);
        t.ok(loaded.state.getIndexerSequenceState.notCalled);

        await msb.close();
    });

    test('MainSettlementBus appends a generic version-1 consensus config operation', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const txValidity = b4a.from('bb'.repeat(32), 'hex');
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.getIndexerSequenceState.resolves(txValidity);

        await msb.handleSetConsensusConfig(validConsensusConfig());

        t.ok(loaded.state.requireSignedConsensusConfig.notCalled);
        t.ok(loaded.state.getIndexerSequenceState.calledOnce);
        t.ok(loaded.state.append.calledOnce);

        const encodedPayload = loaded.state.append.firstCall.args[0];
        const decoded = safeDecodeApplyOperation(encodedPayload);

        t.is(decoded.type, OperationType.SET_CONSENSUS_CONFIG);
        t.ok(b4a.equals(decoded.address, addressToBuffer(wallet.address, config.addressPrefix)));
        t.ok(b4a.equals(decoded.cco.txv, txValidity));
        t.is(decoded.cco.cc.sv.readUInt8(0), 1);

        const decodedVdfConfig = decodeVdfConfig(decoded.cco.cc.cd);
        t.is(decodedVdfConfig.difficulty.readUInt32BE(0), 60_000_000);
        t.is(decodedVdfConfig.discriminantBitSize.readUInt16BE(0), 2048);

        const encodedConsensusConfig = encodeConsensusConfig(decoded.cco.cc);
        const message = createMessage(
            config.networkId,
            decoded.cco.txv,
            encodedConsensusConfig,
            decoded.cco.in,
            OperationType.SET_CONSENSUS_CONFIG
        );
        const expectedHash = await tracCryptoApi.hash.blake3(message);
        t.ok(b4a.equals(decoded.cco.tx, expectedHash));

        await msb.close();
    });

    test('MainSettlementBus rejects setting consensus config when wallet is disabled', async t => {
        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig({ enableWallet: false });
        const msb = new loaded.MainSettlementBus(config);

        await t.exception(
            () => msb.handleSetConsensusConfig(validConsensusConfig()),
            errorMessageIncludes('wallet is not enabled')
        );
    });

    test('MainSettlementBus rejects setting consensus config when admin is missing', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(null);

        await t.exception(
            () => msb.handleSetConsensusConfig(validConsensusConfig()),
            errorMessageIncludes('admin has not been initialized')
        );

        t.ok(loaded.state.requireSignedConsensusConfig.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });

    test('MainSettlementBus rejects setting consensus config for non-admin wallet', async t => {
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
            () => msb.handleSetConsensusConfig(validConsensusConfig()),
            errorMessageIncludes('you are not the admin')
        );

        t.ok(loaded.state.requireSignedConsensusConfig.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });

    test('MainSettlementBus rejects invalid generic consensus config input before submission', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));

        const invalidConfigs = [
            null,
            [],
            'config',
            {},
            { schemaVersion: 1 },
            { configData: {} },
            { schemaVersion: 1, configData: {}, extra: true },
            { schemaVersion: '1', configData: {} },
            { schemaVersion: 0, configData: {} },
            { schemaVersion: 256, configData: {} },
            { schemaVersion: 2, configData: {} },
        ];

        for (const invalidConfig of invalidConfigs) {
            await t.exception(() => msb.handleSetConsensusConfig(invalidConfig));
        }

        t.ok(loaded.state.requireSignedConsensusConfig.notCalled);
        t.ok(loaded.state.getIndexerSequenceState.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });

    test('MainSettlementBus rejects invalid schema-version-1 configData before submission', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();

        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));

        const invalidConfigData = [
            null,
            [],
            'config',
            {},
            { difficulty: 60_000_000 },
            { discriminantBitSize: 2048 },
            { difficulty: 60_000_000, discriminantBitSize: 2048, extra: true },
            { difficulty: '60000000', discriminantBitSize: 2048 },
            { difficulty: 1.5, discriminantBitSize: 2048 },
            { difficulty: 0, discriminantBitSize: 2048 },
            { difficulty: -1, discriminantBitSize: 2048 },
            { difficulty: 0x100000000, discriminantBitSize: 2048 },
            { difficulty: 60_000_000, discriminantBitSize: '2048' },
            { difficulty: 60_000_000, discriminantBitSize: 1.5 },
            { difficulty: 60_000_000, discriminantBitSize: 0 },
            { difficulty: 60_000_000, discriminantBitSize: -1 },
            { difficulty: 60_000_000, discriminantBitSize: 1025 },
            { difficulty: 60_000_000, discriminantBitSize: 0x10000 },
        ];

        for (const configData of invalidConfigData) {
            await t.exception(() => msb.handleSetConsensusConfig({
                schemaVersion: 1,
                configData,
            }));
        }

        t.ok(loaded.state.requireSignedConsensusConfig.notCalled);
        t.ok(loaded.state.getIndexerSequenceState.notCalled);
        t.ok(loaded.state.append.notCalled);

        await msb.close();
    });
}
