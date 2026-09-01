import { test } from 'brittle';
import b4a from 'b4a';
import InvalidPayloadValidationScenario from '../common/payload-structure/invalidPayloadValidationScenario.js';
import RequesterAddressValidationScenario from '../common/requesterAddressValidationScenario.js';
import createRequesterPublicKeyValidationScenario from '../common/requesterPublicKeyValidationScenario.js';
import AdminEntryMissingScenario from '../common/access-control/adminEntryMissingScenario.js';
import AdminEntryDecodeFailureScenario from '../common/access-control/adminEntryDecodeFailureScenario.js';
import AdminOnlyGuardScenario from '../common/access-control/adminOnlyGuardScenario.js';
import AdminPublicKeyDecodeFailureScenario from '../common/access-control/adminPublicKeyDecodeFailureScenario.js';
import AdminConsistencyMismatchScenario from '../common/access-control/adminConsistencyMismatchScenario.js';
import InvalidHashValidationScenario from '../common/payload-structure/invalidHashValidationScenario.js';
import InvalidSignatureValidationScenario, {
    SignatureMutationStrategy
} from '../common/payload-structure/invalidSignatureValidationScenario.js';
import InvalidMessageComponentValidationScenario, {
    MessageComponentStrategy
} from '../common/invalidMessageComponentValidationScenario.js';
import IndexerSequenceStateInvalidScenario from '../common/indexer/indexerSequenceStateInvalidScenario.js';
import TransactionValidityMismatchScenario from '../common/transactionValidityMismatchScenario.js';
import { registerConsensusControlPayloadValidationSuite } from '../common/consensusControlPayloadValidationSuite.js';
import {
    GENESIS_DIFFICULTY,
    GENESIS_DISCRIMINANT_BIT_SIZE,
    UPDATED_DIFFICULTY,
    UPDATED_DISCRIMINANT_BIT_SIZE,
    appendAndUpdate,
    appendBatchAndUpdate,
    applyWithCurrentPointerOverride,
    assertConfigRecordMissing,
    assertConsensusConfigUninitialized,
    assertCurrentConfigId,
    assertOperationRecorded,
    assertSetConsensusConfigFailureState,
    assertVdfConfigRecord,
    buildPayloadWithTxValidity,
    buildSetConsensusConfigPayload,
    initializeGenesisEpoch,
    mutateConfigDataWithoutResigning,
    mutatePayloadForInvalidSchema,
    setupSetConsensusConfigScenario
} from './setConsensusConfigScenarioHelpers.js';
import { safeDecodeApplyOperation } from '../../../../../src/codecs/apply/applyOperationCodec.js';
import {
    CONSENSUS_CONFIG_DATA_MAX_SIZE,
    CustomEventType,
} from '../../../../../src/utils/constants.js';
import { config as stateConfig } from '../../../../helpers/config.js';

const assertRejected = (t, context, validPayload, invalidPayload) =>
    assertSetConsensusConfigFailureState(t, context, invalidPayload ?? validPayload);
const assertRejectedLocally = (t, context, validPayload, invalidPayload) =>
    assertSetConsensusConfigFailureState(
        t,
        context,
        invalidPayload ?? validPayload,
        { skipSync: true }
    );

new InvalidPayloadValidationScenario({
    title: 'State.apply SET_CONSENSUS_CONFIG rejects malformed contract payloads',
    setupScenario: setupSetConsensusConfigScenario,
    buildValidPayload: buildSetConsensusConfigPayload,
    mutatePayload: mutatePayloadForInvalidSchema,
    assertStateUnchanged: assertRejected,
    expectedLogs: ['Contract schema validation failed.']
}).performScenario();

registerRejectedConfigCase({
    title: 'State.apply SET_CONSENSUS_CONFIG rejects schema version 0 with valid config data',
    buildOptions: { schemaVersion: 0 },
    expectedLog: 'Contract schema validation failed.'
});

for (const configDataLength of [0, 3073]) {
    registerRejectedConfigCase({
        title: `State.apply SET_CONSENSUS_CONFIG rejects schema-invalid data length ${configDataLength}`,
        buildOptions: { configData: b4a.alloc(configDataLength, 1) },
        expectedLog: 'Contract schema validation failed.'
    });
}

new RequesterAddressValidationScenario({
    title: 'State.apply SET_CONSENSUS_CONFIG rejects an invalid requester address',
    setupScenario: setupSetConsensusConfigScenario,
    buildValidPayload: buildSetConsensusConfigPayload,
    assertStateUnchanged: assertRejected,
    expectedLogs: ['Requester address is invalid.']
}).performScenario();

createRequesterPublicKeyValidationScenario({
    title: 'State.apply SET_CONSENSUS_CONFIG rejects an undecodable requester public key',
    setupScenario: setupSetConsensusConfigScenario,
    buildValidPayload: buildSetConsensusConfigPayload,
    assertStateUnchanged: assertRejected,
    expectedLogs: ['Failed to decode requester public key.']
}).performScenario();

new AdminEntryMissingScenario({
    title: 'State.apply SET_CONSENSUS_CONFIG rejects a missing admin entry',
    setupScenario: setupSetConsensusConfigScenario,
    buildValidPayload: buildSetConsensusConfigPayload,
    assertStateUnchanged: assertRejectedLocally,
    expectedLogs: ['Invalid admin entry.']
}).performScenario();

new AdminEntryDecodeFailureScenario({
    title: 'State.apply SET_CONSENSUS_CONFIG rejects an undecodable admin entry',
    setupScenario: setupSetConsensusConfigScenario,
    buildValidPayload: buildSetConsensusConfigPayload,
    assertStateUnchanged: assertRejectedLocally,
    expectedLogs: ['Failed to decode admin entry.']
}).performScenario();

new AdminOnlyGuardScenario({
    title: 'State.apply SET_CONSENSUS_CONFIG rejects a non-admin writer',
    setupScenario: setupSetConsensusConfigScenario,
    buildValidPayload: buildSetConsensusConfigPayload,
    assertStateUnchanged: assertRejectedLocally,
    expectedLogs: ['Node is not allowed to perform this operation. (ADMIN ONLY)']
}).performScenario();

new AdminPublicKeyDecodeFailureScenario({
    title: 'State.apply SET_CONSENSUS_CONFIG rejects an undecodable admin public key',
    setupScenario: setupSetConsensusConfigScenario,
    buildValidPayload: buildSetConsensusConfigPayload,
    assertStateUnchanged: assertRejectedLocally,
    expectedLogs: ['Failed to decode admin public key.']
}).performScenario();

new AdminConsistencyMismatchScenario({
    title: 'State.apply SET_CONSENSUS_CONFIG rejects requester/admin key mismatch',
    setupScenario: setupSetConsensusConfigScenario,
    buildValidPayload: buildSetConsensusConfigPayload,
    assertStateUnchanged: assertRejectedLocally,
    expectedLogs: ['System admin and node public keys do not match.']
}).performScenario();

for (const schemaVersion of [2, 255]) {
    registerRejectedConfigCase({
        title: `State.apply SET_CONSENSUS_CONFIG rejects unsupported schema version ${schemaVersion}`,
        buildOptions: { schemaVersion, configData: b4a.from([1]) },
        expectedLog: 'Consensus config validation failed.'
    });
}

for (const configDataLength of [1, 5, 7, 3072]) {
    registerRejectedConfigCase({
        title: `State.apply SET_CONSENSUS_CONFIG rejects schema-v1 data length ${configDataLength}`,
        buildOptions: { configData: b4a.alloc(configDataLength, 1) },
        expectedLog: 'Consensus config validation failed.'
    });
}

registerRejectedConfigCase({
    title: 'State.apply SET_CONSENSUS_CONFIG rejects zero VDF difficulty',
    buildOptions: { difficulty: 0 },
    expectedLog: 'Consensus config validation failed.'
});

registerRejectedConfigCase({
    title: 'State.apply SET_CONSENSUS_CONFIG rejects zero VDF discriminant bit size',
    buildOptions: { discriminantBitSize: 0 },
    expectedLog: 'Consensus config validation failed.'
});

registerRejectedConfigCase({
    title: 'State.apply SET_CONSENSUS_CONFIG rejects unsupported VDF discriminant bit size',
    buildOptions: { discriminantBitSize: 3072 },
    expectedLog: 'Consensus config validation failed.'
});

registerRejectedConfigCase({
    title: 'State.apply SET_CONSENSUS_CONFIG rejects an all-zero VDF config',
    buildOptions: { difficulty: 0, discriminantBitSize: 0 },
    expectedLog: 'Consensus config validation failed.'
});

new InvalidHashValidationScenario({
    title: 'State.apply SET_CONSENSUS_CONFIG rejects a mismatched transaction hash',
    setupScenario: setupSetConsensusConfigScenario,
    buildValidPayload: buildSetConsensusConfigPayload,
    assertStateUnchanged: assertRejected,
    expectedLogs: ['Message hash does not match the tx_hash.']
}).performScenario();

test('State.apply SET_CONSENSUS_CONFIG rejects a payload signed for another network', async t => {
    const context = await setupSetConsensusConfigScenario(t);
    const foreignNetworkId = stateConfig.networkId === 0xffff
        ? stateConfig.networkId - 1
        : stateConfig.networkId + 1;
    const payload = await buildSetConsensusConfigPayload(context, {
        messageConfig: {
            addressPrefix: stateConfig.addressPrefix,
            networkId: foreignNetworkId
        }
    });
    const { logs, result } = captureApplyErrors(() =>
        appendAndUpdate(context.adminBootstrap.base, payload)
    );
    await result;

    await assertSetConsensusConfigFailureState(t, context, payload);
    assertLog(t, logs, 'Message hash does not match the tx_hash.');
});

test('State.apply SET_CONSENSUS_CONFIG rejects non-canonical protobuf config bytes', async t => {
    const context = await setupSetConsensusConfigScenario(t);
    const payload = await buildSetConsensusConfigPayload(context, {
        transformEncodedConfig: canonicalConfig => b4a.concat([
            canonicalConfig,
            b4a.from([0x78, 0x01])
        ])
    });
    const operation = safeDecodeApplyOperation(payload);
    t.ok(operation?.cco?.cc, 'non-canonical protobuf config decodes into the contract payload');

    const { logs, result } = captureApplyErrors(() =>
        appendAndUpdate(context.adminBootstrap.base, payload)
    );
    await result;

    await assertSetConsensusConfigFailureState(t, context, payload);
    assertLog(t, logs, 'Message hash does not match the tx_hash.');
});

new InvalidHashValidationScenario({
    title: 'State.apply SET_CONSENSUS_CONFIG binds config bytes into the transaction hash',
    setupScenario: setupSetConsensusConfigScenario,
    buildValidPayload: buildSetConsensusConfigPayload,
    mutatePayload: mutateConfigDataWithoutResigning,
    assertStateUnchanged: assertRejected,
    expectedLogs: ['Message hash does not match the tx_hash.']
}).performScenario();

for (const [label, strategy] of [
    ['transaction validity', MessageComponentStrategy.TX_VALIDITY],
    ['nonce', MessageComponentStrategy.NONCE]
]) {
    new InvalidMessageComponentValidationScenario({
        title: `State.apply SET_CONSENSUS_CONFIG binds ${label} into the transaction hash`,
        setupScenario: setupSetConsensusConfigScenario,
        buildValidPayload: buildSetConsensusConfigPayload,
        assertStateUnchanged: assertRejected,
        strategy,
        expectedLogs: ['Message hash does not match the tx_hash.']
    }).performScenario();
}

for (const [label, strategy] of [
    ['foreign', SignatureMutationStrategy.FOREIGN_SIGNATURE],
    ['tampered', SignatureMutationStrategy.TYPE_MISMATCH]
]) {
    new InvalidSignatureValidationScenario({
        title: `State.apply SET_CONSENSUS_CONFIG rejects a ${label} admin signature`,
        setupScenario: setupSetConsensusConfigScenario,
        buildValidPayload: buildSetConsensusConfigPayload,
        assertStateUnchanged: assertRejected,
        strategy,
        expectedLogs: ['Failed to verify message signature.']
    }).performScenario();
}

new IndexerSequenceStateInvalidScenario({
    title: 'State.apply SET_CONSENSUS_CONFIG fails closed when indexer state is unavailable',
    setupScenario: setupSetConsensusConfigScenario,
    buildValidPayload: buildSetConsensusConfigPayload,
    assertStateUnchanged: assertRejectedLocally,
    expectedLogs: ['Indexer sequence state is invalid.']
}).performScenario();

new TransactionValidityMismatchScenario({
    title: 'State.apply SET_CONSENSUS_CONFIG rejects a correctly signed stale tx validity',
    setupScenario: setupSetConsensusConfigScenario,
    buildValidPayload: buildSetConsensusConfigPayload,
    assertStateUnchanged: assertRejected,
    txValidityPath: ['cco', 'txv'],
    rebuildPayloadWithTxValidity: ({ context, mutatedTxValidity }) =>
        buildPayloadWithTxValidity(context, mutatedTxValidity),
    expectedLogs: ['Transaction was not executed.']
}).performScenario();

test('State.apply SET_CONSENSUS_CONFIG detects a duplicate transaction inside one batch', async t => {
    const context = await setupSetConsensusConfigScenario(t);
    const events = captureConfigChangedEvents(context);
    const payload = await buildSetConsensusConfigPayload(context);
    const { logs, result } = captureApplyErrors(() =>
        appendBatchAndUpdate(context.adminBootstrap.base, [payload, payload])
    );
    await result;

    await assertCurrentConfigId(t, context.adminBootstrap.base, 1);
    await assertVdfConfigRecord(
        t,
        context.adminBootstrap.base,
        1,
        UPDATED_DIFFICULTY,
        UPDATED_DISCRIMINANT_BIT_SIZE
    );
    await assertConfigRecordMissing(t, context.adminBootstrap.base, 2);
    await assertOperationRecorded(t, context.adminBootstrap.base, payload, true);
    t.is(events.length, 1);
    assertLog(t, logs, 'Operation has already been applied.');
});

test('State.apply SET_CONSENSUS_CONFIG detects the same transaction in consecutive batches', async t => {
    const context = await setupSetConsensusConfigScenario(t);
    const payload = await buildSetConsensusConfigPayload(context);

    await appendAndUpdate(context.adminBootstrap.base, payload);
    await assertCurrentConfigId(t, context.adminBootstrap.base, 1);

    const { logs, result } = captureApplyErrors(() =>
        appendAndUpdate(context.adminBootstrap.base, payload)
    );
    await result;

    await assertCurrentConfigId(t, context.adminBootstrap.base, 1);
    await assertVdfConfigRecord(
        t,
        context.adminBootstrap.base,
        1,
        UPDATED_DIFFICULTY,
        UPDATED_DISCRIMINANT_BIT_SIZE
    );
    await assertConfigRecordMissing(t, context.adminBootstrap.base, 2);
    await assertOperationRecorded(t, context.adminBootstrap.base, payload, true);
    assertLog(t, logs, 'Operation has already been applied.');
});

test('State.apply SET_CONSENSUS_CONFIG ignores updates before genesis initialization', async t => {
    const context = await setupSetConsensusConfigScenario(t, { initializeGenesis: false });
    const events = captureConfigChangedEvents(context);
    const payload = await buildSetConsensusConfigPayload(context);
    const { logs, result } = captureApplyErrors(() =>
        appendAndUpdate(context.adminBootstrap.base, payload)
    );
    await result;

    await assertConsensusConfigUninitialized(t, context.adminBootstrap.base, payload);
    t.is(events.length, 0);
    assertLog(t, logs, 'Initial consensus config has not been initialized yet');
});

test('State.apply SET_CONSENSUS_CONFIG ignores an injected missing current pointer', async t => {
    const context = await setupSetConsensusConfigScenario(t);
    const payload = await buildSetConsensusConfigPayload(context);
    const { logs, result } = captureApplyErrors(() =>
        applyWithCurrentPointerOverride(context, payload, null)
    );
    await result;

    await assertSetConsensusConfigFailureState(t, context, payload, { skipSync: true });
    assertLog(t, logs, 'Initial consensus config has not been initialized yet');
});

test('State.apply SET_CONSENSUS_CONFIG applies an ignored pre-genesis update once after genesis', async t => {
    const context = await setupSetConsensusConfigScenario(t, { initializeGenesis: false });
    const payload = await buildSetConsensusConfigPayload(context);

    await appendAndUpdate(context.adminBootstrap.base, payload);
    await assertConsensusConfigUninitialized(t, context.adminBootstrap.base, payload);

    await initializeGenesisEpoch(context);
    await appendAndUpdate(context.adminBootstrap.base, payload);

    await assertCurrentConfigId(t, context.adminBootstrap.base, 1);
    await assertVdfConfigRecord(
        t,
        context.adminBootstrap.base,
        0,
        GENESIS_DIFFICULTY,
        GENESIS_DISCRIMINANT_BIT_SIZE
    );
    await assertVdfConfigRecord(
        t,
        context.adminBootstrap.base,
        1,
        UPDATED_DIFFICULTY,
        UPDATED_DISCRIMINANT_BIT_SIZE
    );
    await assertOperationRecorded(t, context.adminBootstrap.base, payload, true);

    const { logs, result } = captureApplyErrors(() =>
        appendAndUpdate(context.adminBootstrap.base, payload)
    );
    await result;

    await assertCurrentConfigId(t, context.adminBootstrap.base, 1);
    await assertConfigRecordMissing(t, context.adminBootstrap.base, 2);
    assertLog(t, logs, 'Operation has already been applied.');
});

test('State.apply SET_CONSENSUS_CONFIG rejects an overflowing current pointer without partial writes', async t => {
    const context = await setupSetConsensusConfigScenario(t);
    const payload = await buildSetConsensusConfigPayload(context);
    const { logs, result } = captureApplyErrors(() =>
        applyWithCurrentPointerOverride(context, payload, b4a.alloc(4, 0xff))
    );
    await result;

    await assertSetConsensusConfigFailureState(t, context, payload, { skipSync: true });
    assertLog(t, logs, 'Consensus config index overflow.');
});

test('State.apply SET_CONSENSUS_CONFIG appends a config and replicates immutable history', async t => {
    const context = await setupSetConsensusConfigScenario(t);
    const events = captureConfigChangedEvents(context);
    const payload = await buildSetConsensusConfigPayload(context);

    await appendAndUpdate(context.adminBootstrap.base, payload);

    await assertCurrentConfigId(t, context.adminBootstrap.base, 1);
    await assertVdfConfigRecord(
        t,
        context.adminBootstrap.base,
        0,
        GENESIS_DIFFICULTY,
        GENESIS_DISCRIMINANT_BIT_SIZE
    );
    await assertVdfConfigRecord(
        t,
        context.adminBootstrap.base,
        1,
        UPDATED_DIFFICULTY,
        UPDATED_DISCRIMINANT_BIT_SIZE
    );
    await assertConfigRecordMissing(t, context.adminBootstrap.base, 2);
    await assertOperationRecorded(t, context.adminBootstrap.base, payload, true);
    t.alike(events, [[]]);

    await context.sync();
    const reader = context.peers[1];
    await assertCurrentConfigId(t, reader.base, 1);
    await assertVdfConfigRecord(
        t,
        reader.base,
        0,
        GENESIS_DIFFICULTY,
        GENESIS_DISCRIMINANT_BIT_SIZE
    );
    await assertVdfConfigRecord(
        t,
        reader.base,
        1,
        UPDATED_DIFFICULTY,
        UPDATED_DISCRIMINANT_BIT_SIZE
    );
    await assertOperationRecorded(t, reader.base, payload, true);
});

test('State.apply SET_CONSENSUS_CONFIG advances config sequence across consecutive batches', async t => {
    const context = await setupSetConsensusConfigScenario(t);
    const firstPayload = await buildSetConsensusConfigPayload(context, {
        difficulty: 1,
        discriminantBitSize: 1024
    });

    await appendAndUpdate(context.adminBootstrap.base, firstPayload);

    await assertCurrentConfigId(t, context.adminBootstrap.base, 1);
    await assertVdfConfigRecord(t, context.adminBootstrap.base, 1, 1, 1024);
    await assertConfigRecordMissing(t, context.adminBootstrap.base, 2);

    const secondPayload = await buildSetConsensusConfigPayload(context, {
        difficulty: 0xffffffff,
        discriminantBitSize: 4096
    });
    await appendAndUpdate(context.adminBootstrap.base, secondPayload);

    await assertCurrentConfigId(t, context.adminBootstrap.base, 2);
    await assertVdfConfigRecord(t, context.adminBootstrap.base, 1, 1, 1024);
    await assertVdfConfigRecord(t, context.adminBootstrap.base, 2, 0xffffffff, 4096);
    await assertConfigRecordMissing(t, context.adminBootstrap.base, 3);
    await assertOperationRecorded(t, context.adminBootstrap.base, firstPayload, true);
    await assertOperationRecorded(t, context.adminBootstrap.base, secondPayload, true);
});

test('State.apply SET_CONSENSUS_CONFIG applies two distinct updates atomically in one batch', async t => {
    const context = await setupSetConsensusConfigScenario(t);
    const events = captureConfigChangedEvents(context);
    const minimumPayload = await buildSetConsensusConfigPayload(context, {
        difficulty: 1,
        discriminantBitSize: 1024
    });
    const maximumPayload = await buildSetConsensusConfigPayload(context, {
        difficulty: 0xffffffff,
        discriminantBitSize: 4096
    });

    await appendBatchAndUpdate(
        context.adminBootstrap.base,
        [minimumPayload, maximumPayload]
    );

    await assertCurrentConfigId(t, context.adminBootstrap.base, 2);
    await assertVdfConfigRecord(
        t,
        context.adminBootstrap.base,
        0,
        GENESIS_DIFFICULTY,
        GENESIS_DISCRIMINANT_BIT_SIZE
    );
    await assertVdfConfigRecord(t, context.adminBootstrap.base, 1, 1, 1024);
    await assertVdfConfigRecord(t, context.adminBootstrap.base, 2, 0xffffffff, 4096);
    await assertConfigRecordMissing(t, context.adminBootstrap.base, 3);
    await assertOperationRecorded(t, context.adminBootstrap.base, minimumPayload, true);
    await assertOperationRecorded(t, context.adminBootstrap.base, maximumPayload, true);
    t.is(events.length, 2);
});

test('State.apply SET_CONSENSUS_CONFIG accepts every supported discriminant size in one batch', async t => {
    const context = await setupSetConsensusConfigScenario(t);
    const payloads = await Promise.all([
        buildSetConsensusConfigPayload(context, {
            difficulty: 1,
            discriminantBitSize: 1024
        }),
        buildSetConsensusConfigPayload(context, {
            difficulty: 0x00010000,
            discriminantBitSize: 2048
        }),
        buildSetConsensusConfigPayload(context, {
            difficulty: 0xffffffff,
            discriminantBitSize: 4096
        })
    ]);

    await appendBatchAndUpdate(context.adminBootstrap.base, payloads);

    await assertCurrentConfigId(t, context.adminBootstrap.base, 3);
    await assertVdfConfigRecord(t, context.adminBootstrap.base, 1, 1, 1024);
    await assertVdfConfigRecord(t, context.adminBootstrap.base, 2, 0x00010000, 2048);
    await assertVdfConfigRecord(t, context.adminBootstrap.base, 3, 0xffffffff, 4096);
    await assertConfigRecordMissing(t, context.adminBootstrap.base, 4);
    for (const payload of payloads) {
        await assertOperationRecorded(t, context.adminBootstrap.base, payload, true);
    }
});

test('State.apply SET_CONSENSUS_CONFIG records repeated values as distinct signed history entries', async t => {
    const context = await setupSetConsensusConfigScenario(t);
    const firstPayload = await buildSetConsensusConfigPayload(context);
    const secondPayload = await buildSetConsensusConfigPayload(context);
    const firstOperation = safeDecodeApplyOperation(firstPayload);
    const secondOperation = safeDecodeApplyOperation(secondPayload);

    t.not(
        firstOperation.cco.tx.toString('hex'),
        secondOperation.cco.tx.toString('hex'),
        'independently signed updates have distinct transaction hashes'
    );

    await appendBatchAndUpdate(context.adminBootstrap.base, [firstPayload, secondPayload]);

    await assertCurrentConfigId(t, context.adminBootstrap.base, 2);
    await assertVdfConfigRecord(
        t,
        context.adminBootstrap.base,
        1,
        UPDATED_DIFFICULTY,
        UPDATED_DISCRIMINANT_BIT_SIZE
    );
    await assertVdfConfigRecord(
        t,
        context.adminBootstrap.base,
        2,
        UPDATED_DIFFICULTY,
        UPDATED_DISCRIMINANT_BIT_SIZE
    );
    await assertOperationRecorded(t, context.adminBootstrap.base, firstPayload, true);
    await assertOperationRecorded(t, context.adminBootstrap.base, secondPayload, true);
});

registerConsensusControlPayloadValidationSuite({
    operationName: 'SET_CONSENSUS_CONFIG',
    setupScenario: setupSetConsensusConfigScenario,
    buildValidPayload: buildSetConsensusConfigPayload,
    buildSemanticAttackPayloads: buildConfigSemanticAttackPayloads,
    appendAndUpdate,
    appendBatchAndUpdate,
    assertStateBeforeOperation: (t, context, payload) =>
        assertSetConsensusConfigFailureState(t, context, payload, { skipSync: true }),
    assertAppliedAndReplicated: assertConfigUpdateAppliedAndReplicated
});

async function buildConfigSemanticAttackPayloads(context) {
    const buildOptions = [
        {schemaVersion: 2, configData: b4a.from([1])},
        {
            schemaVersion: 255,
            configData: b4a.alloc(CONSENSUS_CONFIG_DATA_MAX_SIZE, 0xff)
        },
        {configData: b4a.from([1])},
        {configData: b4a.alloc(CONSENSUS_CONFIG_DATA_MAX_SIZE, 0xff)},
        {difficulty: 0, discriminantBitSize: 1024},
        {difficulty: 1, discriminantBitSize: 1},
        {difficulty: 1, discriminantBitSize: 1023},
        {difficulty: 1, discriminantBitSize: 1025},
        {difficulty: 1, discriminantBitSize: 2047},
        {difficulty: 1, discriminantBitSize: 2049},
        {difficulty: 1, discriminantBitSize: 3072},
        {difficulty: 1, discriminantBitSize: 4095},
        {difficulty: 1, discriminantBitSize: 4097},
        {difficulty: 0xffffffff, discriminantBitSize: 0xffff}
    ];

    return Promise.all(
        buildOptions.map(options => buildSetConsensusConfigPayload(context, options))
    );
}

async function assertConfigUpdateAppliedAndReplicated(t, context, payload) {
    await assertConfigUpdateApplied(t, context.adminBootstrap.base, payload);
    await context.sync();
    for (const reader of context.peers.slice(1)) {
        await assertConfigUpdateApplied(t, reader.base, payload);
    }
}

async function assertConfigUpdateApplied(t, base, payload) {
    await assertCurrentConfigId(t, base, 1);
    await assertVdfConfigRecord(
        t,
        base,
        0,
        GENESIS_DIFFICULTY,
        GENESIS_DISCRIMINANT_BIT_SIZE
    );
    await assertVdfConfigRecord(
        t,
        base,
        1,
        UPDATED_DIFFICULTY,
        UPDATED_DISCRIMINANT_BIT_SIZE
    );
    await assertConfigRecordMissing(t, base, 2);
    await assertOperationRecorded(t, base, payload, true);
}

function registerRejectedConfigCase({ title, buildOptions, expectedLog }) {
    test(title, async t => {
        const context = await setupSetConsensusConfigScenario(t);
        const events = captureConfigChangedEvents(context);
        const payload = await buildSetConsensusConfigPayload(context, buildOptions);
        const { logs, result } = captureApplyErrors(() =>
            appendAndUpdate(context.adminBootstrap.base, payload)
        );
        await result;

        await assertSetConsensusConfigFailureState(t, context, payload);
        t.is(events.length, 0);
        assertLog(t, logs, expectedLog);
    });
}

function captureApplyErrors(apply) {
    const logs = [];
    const originalConsoleError = console.error;
    console.error = (...args) => logs.push(args);

    const result = Promise.resolve()
        .then(apply)
        .finally(() => {
            console.error = originalConsoleError;
        });

    return { logs, result };
}

function captureConfigChangedEvents(context) {
    const events = [];
    context.adminBootstrap.state.on(
        CustomEventType.CONSENSUS_CONFIG_CHANGED,
        (...args) => events.push(args),
    );
    return events;
}

function assertLog(t, logs, expected) {
    const found = logs.some(args => args.some(arg => String(arg).includes(expected)));
    t.ok(found, `expected apply log "${expected}" was emitted`);
}
