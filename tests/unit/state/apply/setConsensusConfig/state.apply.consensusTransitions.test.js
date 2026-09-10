import test from 'brittle';
import b4a from 'b4a';
import Corestore from 'corestore';
import { decodeVersionedConsensusConfig } from '../../../../../src/utils/consensusConfig.js';
import {
    decodeConsensusConfig,
    encodeApplyOperation,
    safeDecodeApplyOperation,
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import { CustomEventType, EntryType } from '../../../../../src/utils/constants.js';
import { applyStateMessageFactory } from '../../../../../src/messages/state/applyStateMessageFactory.js';
import {
    createWallet,
    deriveIndexerSequenceState,
    replicateAndSync,
} from '../../../../helpers/autobaseTestHelpers.js';
import { config, overrideConfig } from '../../../../helpers/config.js';
import { loadStateWithMockConsensus } from '../../../../helpers/mockConsensusState.js';
import { testKeyPair1 } from '../../../../fixtures/apply.fixtures.js';
import {
    appendAndUpdate,
    appendBatchAndUpdate,
    assertCurrentConfigId,
    assertConfigRecordMissing,
    assertOperationRecorded,
    buildSetConsensusConfigPayload,
    initializeGenesisEpoch,
    setupSetConsensusConfigScenario,
} from './setConsensusConfigScenarioHelpers.js';
import { buildAddAdminRequesterPayload } from '../addAdmin/addAdminScenarioHelpers.js';
import { buildSetEpochPayload, getCurrentEpoch } from '../setEpoch/setEpochScenarioHelpers.js';
import {
    expectedEpochWrites,
    snapshotEpochLedger,
    snapshotView,
} from '../setEpoch/setEpochHandlerBranchTestHelpers.js';

// Simulate a future State build with extra private config-validator cases.
// Only the config formats are synthetic. State.apply,
// transaction signatures, replay protection and the no-downgrade guard are real.
let futureStateClass;

async function getFutureStateClass() {
    if (!futureStateClass) {
        futureStateClass = await loadStateWithMockConsensus({
            '../../utils/consensusConfig.js': {
                decodeVersionedConsensusConfig: encoded => {
                    const value = decodeConsensusConfig(encoded);
                    const version = value.sv[0];
                    if ((version === 2 || version === 3) && (
                        b4a.equals(value.cd, b4a.from([version, 1])) ||
                        b4a.equals(value.cd, b4a.from([version, 2]))
                    )) {
                        return { schemaVersion: version, configData: { parameter: value.cd[1] } };
                    }
                    return decodeVersionedConsensusConfig(encoded);
                },
            },
        }, `
            case 2:
            case 3:
                return b4a.equals(consensusConfig.cd, b4a.from([consensusConfig.sv[0], 1])) ||
                    b4a.equals(consensusConfig.cd, b4a.from([consensusConfig.sv[0], 2]));
        `);
    }
    return futureStateClass;
}

async function setup(t) {
    return setupSetConsensusConfigScenario(t, { stateClass: await getFutureStateClass() });
}

function buildUpgrade(context, schemaVersion, parameter = 1) {
    return buildSetConsensusConfigPayload(context, {
        schemaVersion,
        configData: b4a.from([schemaVersion, parameter]),
    });
}

async function readConfig(base, index) {
    const entry = await base.view.get(EntryType.CONSENSUS_CONFIG_RECORD + index);
    return entry?.value ?? null;
}

async function captureErrors(action) {
    const logs = [];
    const originalError = console.error;
    console.error = (...args) => logs.push(args.map(String).join(' '));
    try {
        await action();
    } finally {
        console.error = originalError;
    }
    return logs;
}

function assertLog(t, logs, message) {
    t.ok(logs.some(log => log.includes(message)), message);
}

async function appendInOneApplyBatch(t, base, payloads) {
    const originalApply = base._handlers.apply;
    let appliedTogether = false;
    base._handlers.apply = async (nodes, ...args) => {
        const indexes = payloads.map(payload => nodes.findIndex(
            node => b4a.isBuffer(node.value) && b4a.equals(node.value, payload)
        ));
        if (indexes.every((index, position) => index >= 0 && (position === 0 || index > indexes[position - 1]))) {
            appliedTogether = true;
        }
        return originalApply(nodes, ...args);
    };
    try {
        await appendBatchAndUpdate(base, payloads);
    } finally {
        base._handlers.apply = originalApply;
    }
    t.ok(appliedTogether, 'both operations run in order in the same State.apply batch');
}

if (typeof globalThis.Bare !== 'undefined') {
    test('Synthetic State consensus migrations require Node module mocking', t => {
        t.pass('real VDF config and epoch tests also run in Bare');
    });
} else {
    test('State.apply accepts VDF before a migration in the same batch', async t => {
        const context = await setup(t);
        const base = context.adminBootstrap.base;
        await appendAndUpdate(base, await buildSetConsensusConfigPayload(context, {
            difficulty: 1,
            discriminantBitSize: 1024,
        }));
        const genesisConfig = await readConfig(base, 0);
        const vdfConfig = await readConfig(base, 1);
        const epoch = await buildSetEpochPayload(context, {
            approverNodes: [], epoch: 1n, vdfDifficulty: 1, vdfDiscriminantSize: 1024,
        });
        const upgrade = await buildUpgrade(context, 2);
        const expected = await expectedEpochWrites(epoch);

        await appendInOneApplyBatch(t, base, [epoch, upgrade]);

        t.is(await getCurrentEpoch(base), 1n, 'VDF is accepted while V1 is still active');
        t.alike((await base.view.get(expected.forwardKey))?.value, expected.proofHash);
        t.alike((await base.view.get(expected.reverseKey))?.value, expected.encodedProof);
        await assertCurrentConfigId(t, base, 2);
        t.is(decodeConsensusConfig(await readConfig(base, 2)).sv[0], 2, 'V2 becomes active after the epoch');
        await assertOperationRecorded(t, base, upgrade, true);
        t.alike(await readConfig(base, 0), genesisConfig, 'initial config is unchanged');
        t.alike(await readConfig(base, 1), vdfConfig, 'historical VDF config is unchanged');

        await context.sync();
        t.alike(await snapshotView(context.peers[1].base), await snapshotView(base), 'replay preserves both operations');
    });

    for (const scenario of [
        { name: 'malformed V2 config', version: 2, parameter: 3, error: 'Consensus config validation failed.' },
        { name: 'unsupported V4 config', version: 4, parameter: 1, error: 'Consensus config validation failed.' },
    ]) {
        test(`State.apply leaves no partial migration writes after ${scenario.name} and accepts the next VDF`, async t => {
            const context = await setup(t);
            const base = context.adminBootstrap.base;
            await appendAndUpdate(base, await buildSetConsensusConfigPayload(context, {
                difficulty: 1,
                discriminantBitSize: 1024,
            }));
            const before = await snapshotView(base);
            const rejectedUpgrade = await buildUpgrade(context, scenario.version, scenario.parameter);
            const epoch = await buildSetEpochPayload(context, {
                approverNodes: [], epoch: 1n, vdfDifficulty: 1, vdfDiscriminantSize: 1024,
            });
            const expected = await expectedEpochWrites(epoch);
            const configEvents = [];
            context.adminBootstrap.state.on(CustomEventType.CONSENSUS_CONFIG_CHANGED, () => configEvents.push(true));

            const logs = await captureErrors(() => appendInOneApplyBatch(t, base, [rejectedUpgrade, epoch]));

            assertLog(t, logs, scenario.error);
            await assertCurrentConfigId(t, base, 1);
            await assertConfigRecordMissing(t, base, 2);
            await assertOperationRecorded(t, base, rejectedUpgrade, false);
            t.is(configEvents.length, 0, 'rejected migration emits no config change');
            t.is(await getCurrentEpoch(base), 1n, 'VDF remains active after the rejected migration');
            const expectedView = new Map(before);
            expectedView.set(EntryType.EPOCH_CURRENT, expected.currentEpoch.toString('hex'));
            expectedView.set(expected.forwardKey, expected.proofHash.toString('hex'));
            expectedView.set(expected.reverseKey, expected.encodedProof.toString('hex'));
            t.alike(await snapshotView(base), expectedView, 'only the accepted epoch changes the view');

            await context.sync();
            t.alike(await snapshotView(context.peers[1].base), expectedView, 'replay also ignores the rejected migration');
        });
    }

    test('State.apply preserves a migrated consensus after reopening storage and rejects a fresh downgrade', async t => {
        const StateClass = await getFutureStateClass();
        const directory = await t.tmp();
        const wallet = await createWallet(testKeyPair1.mnemonic);
        let store = new Corestore(directory);
        let state;
        t.teardown(async () => {
            try {
                await state?.close();
            } finally {
                await store.close();
            }
        });

        const local = store.get({ name: 'local' });
        await local.ready();
        const bootstrap = b4a.from(local.key);
        await local.close();
        const stateConfig = overrideConfig({ bootstrap, enableTxApplyLogs: false });
        state = new StateClass(store.session(), wallet, stateConfig);
        await state.ready();
        let base = state.base;
        let context = { adminBootstrap: { base, state, wallet } };
        await appendAndUpdate(base, null);
        await appendAndUpdate(base, await buildAddAdminRequesterPayload(context));
        await initializeGenesisEpoch(context);
        await appendAndUpdate(base, await buildSetConsensusConfigPayload(context, {
            difficulty: 1,
            discriminantBitSize: 1024,
        }));
        const epoch = await buildSetEpochPayload(context, {
            approverNodes: [], epoch: 1n, vdfDifficulty: 1, vdfDiscriminantSize: 1024,
        });
        await appendAndUpdate(base, epoch);
        const upgrade = await buildUpgrade(context, 2);
        await appendAndUpdate(base, upgrade);
        // The next writer block publishes a real checkpoint for the migrated view.
        await appendAndUpdate(base, null);
        await assertCurrentConfigId(t, base, 2);
        t.is(state.getSignedLength(), base.view.core.length, 'the migrated view has a real signed checkpoint');
        t.alike(await state.requireSignedConsensusConfig(), { schemaVersion: 2, configData: { parameter: 1 } });
        const beforeRestart = await snapshotView(base);
        const writerLength = base.local.length;
        const originalBase = base;
        const originalState = state;
        const originalStore = store;

        await state.close();
        await store.close();
        t.ok(originalBase.closed, 'the original Autobase is closed');
        t.ok(originalStore.closed, 'the original disk storage is closed');

        // No admin/genesis initialization or indexer seeding on restart.
        store = new Corestore(directory);
        state = new StateClass(store.session(), wallet, stateConfig);
        await state.ready();
        base = state.base;
        context = { adminBootstrap: { base, state, wallet } };
        t.not(state, originalState, 'restart creates a fresh State instance');
        t.not(base, originalBase, 'restart creates a fresh Autobase instance');
        t.not(store, originalStore, 'restart creates a fresh Corestore instance');
        t.alike(base.local.key, bootstrap, 'the writer identity survives restart');
        t.is(base.local.length, writerLength, 'opening storage does not append new initialization operations');
        t.alike(await snapshotView(base), beforeRestart, 'config history, genesis, epochs and transaction markers survive restart');
        t.alike(await state.requireSignedConsensusConfig(), { schemaVersion: 2, configData: { parameter: 1 } }, 'signed state still selects V2');
        t.is(await state.requireCurrentEpoch(), 1n, 'restart does not reset the epoch to genesis');

        const downgrade = await buildSetConsensusConfigPayload(context);
        const logs = await captureErrors(() => appendAndUpdate(base, downgrade));
        assertLog(t, logs, 'Consensus config schema version cannot decrease.');
        await assertOperationRecorded(t, base, downgrade, false);
        t.alike(await snapshotView(base), beforeRestart, 'a newly signed downgrade cannot change the reopened state');

        // A separate, empty reader reconstructs the same state from the full feed.
        const readerStore = new Corestore(await t.tmp());
        const reader = new StateClass(readerStore.session(), await createWallet(), stateConfig);
        reader.base.fastForwardEnabled = false;
        const replayed = [];
        const apply = reader.base._handlers.apply;
        reader.base._handlers.apply = async (nodes, ...args) => {
            replayed.push(...nodes.map(node => node.value));
            return apply(nodes, ...args);
        };
        t.teardown(async () => {
            try {
                await reader.close();
            } finally {
                await readerStore.close();
            }
        });
        await reader.ready();
        await captureErrors(() => replicateAndSync([base, reader.base]));
        const epochIndex = replayed.findIndex(value => b4a.isBuffer(value) && b4a.equals(value, epoch));
        const upgradeIndex = replayed.findIndex(value => b4a.isBuffer(value) && b4a.equals(value, upgrade));
        t.ok(epochIndex >= 0 && upgradeIndex > epochIndex, 'the fresh reader applies historical VDF before the migration, without fast-forward');
        t.alike(await snapshotView(reader.base), beforeRestart, 'full replay matches the reopened state');
        t.alike(await reader.requireSignedConsensusConfig(), await state.requireSignedConsensusConfig(), 'restart and replay select the same active consensus');
    });

    test('State.apply migrates forward and rejects downgrades in the same and later batches', async t => {
        const context = await setup(t);
        const base = context.adminBootstrap.base;
        const genesis = await snapshotEpochLedger(base);
        const genesisConfig = await readConfig(base, 0);
        const events = [];
        context.adminBootstrap.state.on(CustomEventType.CONSENSUS_CONFIG_CHANGED, () => events.push(true));

        const upgrade2 = await buildUpgrade(context, 2);
        const downgrade1 = await buildSetConsensusConfigPayload(context);
        const logs = await captureErrors(() => appendBatchAndUpdate(base, [upgrade2, downgrade1]));
        assertLog(t, logs, 'Consensus config schema version cannot decrease.');
        await assertCurrentConfigId(t, base, 1);
        await assertOperationRecorded(t, base, upgrade2, true);
        await assertOperationRecorded(t, base, downgrade1, false);
        t.is(events.length, 1, 'only the accepted migration emits a config event');

        const update2 = await buildUpgrade(context, 2, 2);
        await appendAndUpdate(base, update2);
        await assertCurrentConfigId(t, base, 2);
        t.is(decodeConsensusConfig(await readConfig(base, 2)).sv[0], 2, 'config index is not the schema version');

        const upgrade3 = await buildUpgrade(context, 3);
        await appendAndUpdate(base, upgrade3);
        await assertCurrentConfigId(t, base, 3);

        const downgrade2 = await buildUpgrade(context, 2);
        const freshDowngrade1 = await buildSetConsensusConfigPayload(context);
        const laterLogs = await captureErrors(() => appendBatchAndUpdate(base, [downgrade2, freshDowngrade1]));
        assertLog(t, laterLogs, 'Consensus config schema version cannot decrease.');
        await assertCurrentConfigId(t, base, 3);
        await assertConfigRecordMissing(t, base, 4);
        await assertOperationRecorded(t, base, downgrade2, false);
        await assertOperationRecorded(t, base, freshDowngrade1, false);
        t.is(events.length, 3, 'rejected downgrades do not publish config changes');
        t.alike(await snapshotEpochLedger(base), genesis, 'migrations do not recreate or reset genesis');
        t.alike(await readConfig(base, 0), genesisConfig, 'initial config remains immutable');

        await context.sync();
        const reader = context.peers[1].base;
        await assertCurrentConfigId(t, reader, 3);
        for (let index = 0; index <= 3; index++) {
            t.alike(await readConfig(reader, index), await readConfig(base, index), 'replay preserves config history');
        }
        t.alike(await snapshotEpochLedger(reader), genesis, 'replayed genesis has the original hash');
    });

    test('State.apply upgrades directly from V1 to V3, rejects lower versions and accepts V3 parameter updates', async t => {
        const context = await setup(t);
        const base = context.adminBootstrap.base;
        const genesis = await snapshotEpochLedger(base);
        const initialConfig = await readConfig(base, 0);
        const upgrade3 = await buildUpgrade(context, 3);
        await appendAndUpdate(base, upgrade3);
        await assertCurrentConfigId(t, base, 1);
        await assertOperationRecorded(t, base, upgrade3, true);
        t.is(decodeConsensusConfig(await readConfig(base, 1)).sv[0], 3, 'V3 is active without an intermediate V2 record');
        const afterUpgrade = await snapshotView(base);

        for (const version of [1, 2]) {
            const downgrade = version === 1
                ? await buildSetConsensusConfigPayload(context)
                : await buildUpgrade(context, version);
            const logs = await captureErrors(() => appendAndUpdate(base, downgrade));
            assertLog(t, logs, 'Consensus config schema version cannot decrease.');
            await assertOperationRecorded(t, base, downgrade, false);
            t.alike(await snapshotView(base), afterUpgrade, `V3 to V${version} leaves the entire view unchanged`);
        }

        const update3 = await buildUpgrade(context, 3, 2);
        await appendAndUpdate(base, update3);
        await assertCurrentConfigId(t, base, 2);
        await assertOperationRecorded(t, base, update3, true);
        t.alike(decodeConsensusConfig(await readConfig(base, 2)), { sv: b4a.from([3]), cd: b4a.from([3, 2]) },
            'a parameter update changes data but keeps the active version at V3');
        t.alike(await readConfig(base, 0), initialConfig, 'the direct upgrade preserves the initial config');
        t.alike(await snapshotEpochLedger(base), genesis, 'the direct upgrade and parameter update preserve genesis');

        await captureErrors(() => context.sync());
        t.alike(await snapshotView(context.peers[1].base), await snapshotView(base), 'replay preserves the direct upgrade and parameter update');
    });

    test('State.apply rejects a forged version/config and still accepts a correctly signed migration', async t => {
        const context = await setup(t);
        const base = context.adminBootstrap.base;
        const original = await buildSetConsensusConfigPayload(context);
        const forged = safeDecodeApplyOperation(original);
        forged.cco.cc = { sv: b4a.from([2]), cd: b4a.from([2, 1]) };
        const forgedPayload = encodeApplyOperation(forged);
        const logs = await captureErrors(() => appendAndUpdate(base, forgedPayload));
        assertLog(t, logs, 'Message hash does not match the tx_hash.');
        await assertCurrentConfigId(t, base, 0);
        await assertOperationRecorded(t, base, forgedPayload, false);

        const upgrade = await buildUpgrade(context, 2);
        await appendAndUpdate(base, upgrade);
        await assertCurrentConfigId(t, base, 1);
        await assertOperationRecorded(t, base, upgrade, true);
    });

    test('State.apply cannot restore an older config by replaying its transaction or genesis', async t => {
        const context = await setup(t);
        const base = context.adminBootstrap.base;
        const genesisConfig = await readConfig(base, 0);
        const initialUpdate = await buildSetConsensusConfigPayload(context);
        await appendAndUpdate(base, initialUpdate);
        await appendAndUpdate(base, await buildUpgrade(context, 2));
        const epochState = await snapshotEpochLedger(base);
        const activeConfig = await readConfig(base, 2);

        const replayLogs = await captureErrors(() => appendAndUpdate(base, initialUpdate));
        assertLog(t, replayLogs, 'Operation has already been applied.');

        const wallet = context.adminBootstrap.wallet;
        const genesisOperation = await applyStateMessageFactory(wallet, config).buildCompleteSetGenesisEpochMessage(
            wallet.address,
            await deriveIndexerSequenceState(base),
            genesisConfig
        );
        const logs = await captureErrors(() => appendAndUpdate(base, encodeApplyOperation(genesisOperation)));
        assertLog(t, logs, 'Current epoch is set. Cannot set a new genesis epoch');
        await assertCurrentConfigId(t, base, 2);
        await assertConfigRecordMissing(t, base, 3);
        t.alike(await readConfig(base, 2), activeConfig);
        t.alike(await snapshotEpochLedger(base), epochState);
    });

    test('State.apply replays historical VDF but rejects V1 and V2 epoch envelopes when V3 is active', async t => {
        const context = await setup(t);
        const base = context.adminBootstrap.base;
        await appendAndUpdate(base, await buildSetConsensusConfigPayload(context, {
            difficulty: 1,
            discriminantBitSize: 1024,
        }));
        const proofOptions = { approverNodes: [], vdfDifficulty: 1, vdfDiscriminantSize: 1024 };
        const historicalVdf = await buildSetEpochPayload(context, { ...proofOptions, epoch: 1n });
        await appendAndUpdate(base, historicalVdf);
        t.is(await getCurrentEpoch(base), 1n, 'VDF is accepted before migration');
        const epochState = await snapshotEpochLedger(base);
        const pendingVdf = await buildSetEpochPayload(context, { ...proofOptions, epoch: 2n });
        const upgrade = await buildUpgrade(context, 3);

        const logs = await captureErrors(() => appendInOneApplyBatch(t, base, [upgrade, pendingVdf]));
        assertLog(t, logs, 'Epoch schema version does not match the current consensus config.');
        await assertCurrentConfigId(t, base, 2);
        t.is(decodeConsensusConfig(await readConfig(base, 2)).sv[0], 3, 'only V3 is active after the config update');
        t.alike(await snapshotEpochLedger(base), epochState, 'pending VDF is not written after the config update');

        // No V2 proof implementation is needed: reject its envelope before decoding data.
        const relabeled = safeDecodeApplyOperation(pendingVdf);
        relabeled.seo.sv = b4a.from([2]);
        const staleV2Logs = await captureErrors(() => appendAndUpdate(base, encodeApplyOperation(relabeled)));
        assertLog(t, staleV2Logs, 'Epoch schema version does not match the current consensus config.');
        t.alike(await snapshotEpochLedger(base), epochState, 'V2 cannot append an epoch while V3 is active');

        relabeled.seo.sv = b4a.from([3]);
        const relabelLogs = await captureErrors(() => appendAndUpdate(base, encodeApplyOperation(relabeled)));
        assertLog(t, relabelLogs, 'Unsupported epoch schema version.');
        t.alike(await snapshotEpochLedger(base), epochState, 'unknown proof formats never fall back to VDF');

        await context.sync();
        const reader = context.peers[1].base;
        t.alike(await snapshotEpochLedger(reader), epochState, 'history replays through the migration boundary');
        await assertCurrentConfigId(t, reader, 2);
    });
}
