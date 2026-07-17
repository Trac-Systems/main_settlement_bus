import { test } from 'brittle';
import sinon from 'sinon';
import EventEmitter from 'bare-events';
import b4a from 'b4a';
import { WalletProvider } from 'trac-wallet';
import { OperationType } from '../../src/utils/constants.js';
import { safeDecodeApplyOperation } from '../../src/codecs/apply/applyOperationCodec.js';
import { encodeLedgerConfigTransactionReceipt } from '../../src/codecs/apply/ledgerConfigCodec.js';
import {
    calculateCommitId,
    calculateConfigId,
} from '../../src/core/ledger-config/ledgerConfigMerkle.js';
import { createZeroCommitId } from '../../src/core/ledger-config/ledgerConfigConstants.js';
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
    let contentStoreInstance = null;
    let synchronizerInstance = null;
    const buildLedgerConfigDiagnostics = sinon.stub().resolves({
        signedLedgerConfig: { descriptor: { configVersion: 1 } },
    });

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
            this.get = sinon.stub().resolves(null);
            this.getSigned = sinon.stub().resolves(null);
            this.getCurrentEpoch = sinon.stub().resolves(null);
            this.getEpoch = sinon.stub().resolves(null);
            this.getEpochProof = sinon.stub().resolves(null);
            this.getSignedLedgerConfig = sinon.stub().resolves(null);
            this.getSignedLedgerConfigRoot = sinon.stub().resolves(null);
            this.requireLedgerConfigConsensusReady = sinon.stub().resolves(null);
            this.getIndexerSequenceState = sinon.stub().resolves(b4a.from('11'.repeat(32), 'hex'));
            this.append = sinon.stub().resolves();
            this.ledgerConfigAdapterRegistry = {
                require: sinon.stub().returns({ validate: sinon.stub().returns({}) }),
            };
            this.setLedgerConfigSynchronizer = sinon.stub();
            this.isWritable = sinon.stub().returns(false);
            this.isIndexer = sinon.stub().returns(false);
            this.getUnsignedLength = sinon.stub().returns(0);
            this.getSignedLength = sinon.stub().returns(0);
            this.getTransactionConfirmedLength = sinon.stub().resolves(null);
            this.confirmedTransactionsBetween = sinon.stub().resolves([]);
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

    class LedgerConfigContentStoreMock {
        constructor() {
            this.ready = sinon.stub().resolves(this);
            this.putSnapshot = sinon.stub().resolves(b4a.alloc(32, 1));
            this.putCandidate = sinon.stub().resolves();
            this.close = sinon.stub().resolves();
            contentStoreInstance = this;
        }
    }

    class LedgerConfigSynchronizerMock extends EventEmitter {
        constructor() {
            super();
            this.status = 'CONFIG_UNAVAILABLE';
            this.activeConfig = null;
            this.synchronize = sinon.stub().resolves(null);
            this.requireConsensusReady = sinon.stub().rejects(new Error('not ready'));
            this.close = sinon.stub().resolves();
            synchronizerInstance = this;
        }
    }

    const { MainSettlementBus } = await esmock('../../src/index.js', {
        corestore: CorestoreMock,
        '../../src/core/state/State.js': StateMock,
        '../../src/core/network/Network.js': NetworkMock,
        '../../src/core/ledger-config/index.js': {
            LedgerConfigContentStore: LedgerConfigContentStoreMock,
            LedgerConfigSynchronizer: LedgerConfigSynchronizerMock,
            buildLedgerConfigDiagnostics,
            canonicalizeSnapshot: snapshot => snapshot,
            createZeroCommitId: () => b4a.alloc(32),
            LEDGER_CONFIG_COMMITMENT_SCHEME: 'binary-merkle-v1',
            LEDGER_CONFIG_FORMAT_VERSION: 1,
            PROOF_OF_TIME_CONFIG_KEYS: {
                VDF_DIFFICULTY: 'vdf/difficulty',
                VDF_DISCRIMINANT_SIZE_BITS: 'vdf/discriminant-size-bits',
            },
            PROOF_OF_TIME_SCHEMA_ID: 'trac/autobase-proof-of-time/v1',
            CONFIG_UNAVAILABLE: 'CONFIG_UNAVAILABLE',
            CONFIG_VERIFYING: 'CONFIG_VERIFYING',
            NOT_READY: 'NOT_READY',
            SYNCING_LEDGER: 'SYNCING_LEDGER',
        },
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
        get contentStore() {
            return contentStoreInstance;
        },
        get synchronizer() {
            return synchronizerInstance;
        },
        buildLedgerConfigDiagnostics,
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

async function buildLedgerConfigTransactionRecord(config, wallet) {
    const txHash = b4a.alloc(32, 0x31);
    const previousCommitId = createZeroCommitId();
    const configRoot = b4a.alloc(32, 0x42);
    const container = {
        formatVersion: 1,
        commitmentScheme: 'binary-merkle-v1',
        schemaId: 'trac/autobase-proof-of-time/v1',
        entries: [],
    };
    const configId = await calculateConfigId(container, configRoot);
    const commitId = await calculateCommitId(previousCommitId, configId);
    const descriptor = {
        formatVersion: container.formatVersion,
        commitmentScheme: container.commitmentScheme,
        schemaId: container.schemaId,
        configVersion: 1,
        configRoot,
        configId,
        commitId,
        contentRef: b4a.alloc(32, 0x53),
    };
    const encoded = encodeLedgerConfigTransactionReceipt({
        operationType: OperationType.SET_LEDGER_CONFIG,
        txHash,
        requesterAddress: addressToBuffer(wallet.address, config.addressPrefix),
        previousCommitId,
        descriptor,
    });

    return { txHash, txHashHex: b4a.toString(txHash, 'hex'), descriptor, encoded };
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

    test('MainSettlementBus exposes JSON-safe LedgerConfig diagnostics', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildConfig();
        const msb = new loaded.MainSettlementBus(config);

        await msb.ready();
        const diagnostics = await msb.getLedgerConfigDiagnostics();

        t.alike(diagnostics, {
            signedLedgerConfig: { descriptor: { configVersion: 1 } },
        });
        t.ok(loaded.buildLedgerConfigDiagnostics.calledOnceWithExactly({
            state: loaded.state,
            synchronizer: loaded.synchronizer,
            contentStore: loaded.contentStore,
            addressPrefix: config.addressPrefix,
        }));

        await msb.close();
    });

    test('MainSettlementBus transaction APIs expose compact LedgerConfig receipts', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);
        const record = await buildLedgerConfigTransactionRecord(config, wallet);

        await msb.ready();
        loaded.state.getSigned.withArgs(record.txHashHex).resolves(record.encoded);
        loaded.state.get.withArgs(record.txHashHex).resolves(record.encoded);

        const confirmed = await msb.getConfirmedTxInfo(record.txHashHex);
        t.is(confirmed.recordType, 'ledger-config-receipt');
        t.is(confirmed.decoded.type, OperationType.SET_LEDGER_CONFIG);
        t.is(confirmed.decoded.record_type, 'ledger_config_receipt_v1');
        t.ok(b4a.equals(confirmed.decoded.receipt.tx, record.txHash));
        t.ok(b4a.equals(
            confirmed.decoded.receipt.descriptor.commit_id,
            record.descriptor.commitId
        ));
        t.is(
            confirmed.decoded.receipt.snapshot,
            undefined,
            'receipt does not expose the snapshot witness'
        );

        const unconfirmed = await msb.getUnconfirmedTxInfo(record.txHashHex);
        t.is(unconfirmed.recordType, 'ledger-config-receipt');

        const details = await msb.getTxDetails(record.txHashHex);
        t.is(details.record_type, 'ledger_config_receipt_v1');
        t.is(details.receipt.tx, record.txHashHex);
        t.is(details.receipt.descriptor.commit_id, b4a.toString(record.descriptor.commitId, 'hex'));

        const bulk = await msb.fetchBulkTxPayloads([record.txHashHex]);
        t.is(bulk.missing.length, 0);
        t.is(bulk.results.length, 1);
        t.is(bulk.results[0].hash, record.txHashHex);
        t.is(bulk.results[0].payload.record_type, 'ledger_config_receipt_v1');

        await msb.close();
    });

    test('MainSettlementBus appends genesis bound to the current signed configId', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const txValidity = b4a.from('aa'.repeat(32), 'hex');
        const configId = b4a.from('77'.repeat(32), 'hex');
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();
        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.requireLedgerConfigConsensusReady.resolves({
            descriptor: {
                schemaId: 'trac/autobase-proof-of-time/v1',
                configId,
            },
        });
        loaded.state.getCurrentEpoch.resolves(null);
        loaded.state.getIndexerSequenceState.resolves(txValidity);

        await msb.handleEpochGenesisInitialization();

        t.ok(loaded.state.requireLedgerConfigConsensusReady.calledOnce);
        t.ok(loaded.state.getCurrentEpoch.calledOnce);
        t.ok(loaded.state.append.calledOnce);

        const decoded = safeDecodeApplyOperation(loaded.state.append.firstCall.args[0]);
        t.is(decoded.type, OperationType.SET_GENESIS_EPOCH);
        t.ok(b4a.equals(decoded.address, addressToBuffer(wallet.address, config.addressPrefix)));
        t.ok(b4a.equals(decoded.sgo.txv, txValidity));
        t.ok(b4a.equals(decoded.sgo.config_id, configId));

        await msb.close();
    });

    test('MainSettlementBus rejects genesis epoch initialization when wallet is disabled', async t => {
        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig({ enableWallet: false });
        const msb = new loaded.MainSettlementBus(config);

        await t.exception(
            () => msb.handleEpochGenesisInitialization(),
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
            () => msb.handleEpochGenesisInitialization(),
            errorMessageIncludes('admin has not been initialized')
        );

        t.ok(loaded.state.requireLedgerConfigConsensusReady.notCalled);
        t.ok(loaded.state.append.notCalled);
        await msb.close();
    });

    test('MainSettlementBus rejects genesis epoch initialization for a non-admin wallet', async t => {
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
            () => msb.handleEpochGenesisInitialization(),
            errorMessageIncludes('you are not the admin')
        );

        t.ok(loaded.state.requireLedgerConfigConsensusReady.notCalled);
        t.ok(loaded.state.append.notCalled);
        await msb.close();
    });

    test('MainSettlementBus fails closed when signed LedgerConfig is unavailable for genesis', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();
        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.requireLedgerConfigConsensusReady.rejects(
            new Error('LedgerConfig is not consensus-ready.')
        );

        await t.exception(
            () => msb.handleEpochGenesisInitialization(),
            errorMessageIncludes('not consensus-ready')
        );

        t.ok(loaded.state.getIndexerSequenceState.notCalled);
        t.ok(loaded.state.append.notCalled);
        await msb.close();
    });

    test('MainSettlementBus rejects a non-Proof-of-Time config for genesis', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();
        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.requireLedgerConfigConsensusReady.resolves({
            descriptor: {
                schemaId: 'example/unsupported/v1',
                configId: b4a.alloc(32, 1),
            },
        });

        await t.exception(
            () => msb.handleEpochGenesisInitialization(),
            errorMessageIncludes('unsupported LedgerConfig schema')
        );

        t.ok(loaded.state.getCurrentEpoch.notCalled);
        t.ok(loaded.state.append.notCalled);
        await msb.close();
    });

    test('MainSettlementBus rejects duplicate genesis initialization', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();
        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.requireLedgerConfigConsensusReady.resolves({
            descriptor: {
                schemaId: 'trac/autobase-proof-of-time/v1',
                configId: b4a.alloc(32, 1),
            },
        });
        loaded.state.getCurrentEpoch.resolves(0n);

        await t.exception(
            () => msb.handleEpochGenesisInitialization(),
            errorMessageIncludes('genesis epoch already exists')
        );

        t.ok(loaded.state.append.notCalled);
        await msb.close();
    });

    test('MainSettlementBus publishes a canonical Model B witness through the builder', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);
        const snapshot = {
            formatVersion: 1,
            commitmentScheme: 'binary-merkle-v1',
            schemaId: 'trac/autobase-proof-of-time/v1',
            entries: [
                {key: b4a.from('vdf/difficulty'), value: b4a.from([0x03, 0x47, 0x3b, 0x80])},
                {key: b4a.from('vdf/discriminant-size-bits'), value: b4a.from([0x08, 0x00])},
            ],
        };

        await msb.ready();
        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.getSignedLedgerConfig.resolves(null);

        const tx = await msb.handleSetLedgerConfig(snapshot);
        t.ok(loaded.contentStore.putSnapshot.calledOnceWithExactly(snapshot));
        t.ok(loaded.state.ledgerConfigAdapterRegistry.require.calledOnceWithExactly(snapshot.schemaId));
        t.ok(loaded.state.append.calledOnce);

        const decoded = safeDecodeApplyOperation(loaded.state.append.firstCall.args[0]);
        t.is(decoded.type, OperationType.SET_LEDGER_CONFIG);
        t.ok(b4a.equals(decoded.lco.previous_commit_id, b4a.alloc(32)));
        t.is(decoded.lco.snapshot.schema_id, snapshot.schemaId);
        t.is(tx, b4a.toString(decoded.lco.tx, 'hex'));

        await msb.close();
    });

    test('MainSettlementBus can publish a recovery config while the previous content is unavailable', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);
        const previousCommitId = b4a.alloc(32, 9);
        const snapshot = {
            formatVersion: 1,
            commitmentScheme: 'binary-merkle-v1',
            schemaId: 'trac/autobase-proof-of-time/v1',
            entries: [
                { key: b4a.from('vdf/difficulty'), value: b4a.from([0x03, 0x47, 0x3b, 0x80]) },
                { key: b4a.from('vdf/discriminant-size-bits'), value: b4a.from([0x08, 0x00]) },
            ],
        };

        await msb.ready();
        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));
        loaded.state.getSignedLedgerConfig.resolves({
            descriptor: { commitId: previousCommitId },
        });
        loaded.state.requireLedgerConfigConsensusReady.rejects(
            new Error('Previous snapshot is unavailable.')
        );

        await msb.handleSetLedgerConfig(snapshot);

        t.ok(loaded.state.requireLedgerConfigConsensusReady.notCalled);
        const decoded = safeDecodeApplyOperation(loaded.state.append.firstCall.args[0]);
        t.ok(b4a.equals(decoded.lco.previous_commit_id, previousCommitId));

        await msb.close();
    });

    test('MainSettlementBus builds a complete Proof-of-Time snapshot through Model B', async t => {
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());

        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const wallet = await createWallet(config);
        const msb = new loaded.MainSettlementBus(config, wallet);

        await msb.ready();
        loaded.state.getAdminEntry.resolves(adminEntryFor(wallet, loaded.state));

        await msb.handleSetProofOfTimeLedgerConfig({
            vdfDifficulty: '60000000',
            vdfDiscriminantSize: '2048',
        });

        const decoded = safeDecodeApplyOperation(loaded.state.append.firstCall.args[0]);
        t.is(decoded.type, OperationType.SET_LEDGER_CONFIG);
        t.is(decoded.lco.snapshot.schema_id, 'trac/autobase-proof-of-time/v1');
        const entries = new Map(decoded.lco.snapshot.entries.map(entry => [
            b4a.toString(entry.key, 'utf8'),
            entry.value,
        ]));
        t.is(entries.get('vdf/difficulty').readUInt32BE(0), 60_000_000);
        t.is(entries.get('vdf/discriminant-size-bits').readUInt16BE(0), 2048);

        await msb.close();
    });

    test('MainSettlementBus validates Proof-of-Time snapshot integer bounds', async t => {
        const loaded = await loadMainSettlementBus();
        const config = buildGenesisConfig();
        const msb = new loaded.MainSettlementBus(config);

        await t.exception(
            () => msb.handleSetProofOfTimeLedgerConfig({
                vdfDifficulty: '4294967296',
                vdfDiscriminantSize: '2048',
            }),
            errorMessageIncludes('positive unsigned 32-bit integer')
        );

        await t.exception(
            () => msb.handleSetProofOfTimeLedgerConfig({
                vdfDifficulty: '60000000',
                vdfDiscriminantSize: '65536',
            }),
            errorMessageIncludes('positive unsigned 16-bit integer')
        );
    });
}
