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
    appendAndUpdate,
    appendBatchAndUpdate,
    applyWithConsensusConfigEncodingFailure,
    applyWithEntryOverrides,
    applyWithGenesisEpochEncodingFailure,
    applyWithGenesisEpochHashFailure,
    applyWithMessageConstructionFailure,
    assertGenesisInitialized,
    assertGenesisUninitialized,
    assertOperationRecorded,
    assertSetGenesisEpochFailureState,
    buildPayloadWithTxValidity,
    buildSetGenesisEpochPayload,
    mutateConfigDataWithoutResigning,
    mutatePayloadBuffer,
    mutatePayloadForInvalidSchema,
    setupSetGenesisEpochScenario
} from './setGenesisEpochScenarioHelpers.js';
import {
    safeDecodeApplyOperation,
    safeEncodeConsensusConfig
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import {
    CONSENSUS_CONFIG_DATA_MAX_SIZE,
    CustomEventType,
    EntryType,
    HASH_BYTE_LENGTH,
    NONCE_BYTE_LENGTH,
    SIGNATURE_BYTE_LENGTH
} from '../../../../../src/utils/constants.js';
import { config as stateConfig } from '../../../../helpers/config.js';

const assertRejected = (t, context, validPayload, invalidPayload) =>
    assertSetGenesisEpochFailureState(t, context, invalidPayload ?? validPayload);
const assertRejectedLocally = (t, context, validPayload, invalidPayload) =>
    assertSetGenesisEpochFailureState(
        t,
        context,
        invalidPayload ?? validPayload,
        { skipSync: true }
    );

// #stateValidationSchema.validateConsensusControlOperation(op)
new InvalidPayloadValidationScenario({
    title: 'State.apply SET_GENESIS_EPOCH rejects malformed contract payloads',
    setupScenario: setupSetGenesisEpochScenario,
    buildValidPayload: buildSetGenesisEpochPayload,
    mutatePayload: mutatePayloadForInvalidSchema,
    assertStateUnchanged: assertRejected,
    expectedLogs: ['Contract schema validation failed.']
}).performScenario();

for (const [label, path, length] of [
    ['short requester address', ['address'], stateConfig.addressLength - 1],
    ['long requester address', ['address'], stateConfig.addressLength + 1],
    ['long transaction hash', ['cco', 'tx'], HASH_BYTE_LENGTH + 1],
    ['short transaction validity', ['cco', 'txv'], HASH_BYTE_LENGTH - 1],
    ['long transaction validity', ['cco', 'txv'], HASH_BYTE_LENGTH + 1],
    ['empty consensus schema version', ['cco', 'cc', 'sv'], 0],
    ['long consensus schema version', ['cco', 'cc', 'sv'], 2],
    ['empty consensus config data', ['cco', 'cc', 'cd'], 0],
    [
        'oversized consensus config data',
        ['cco', 'cc', 'cd'],
        CONSENSUS_CONFIG_DATA_MAX_SIZE + 1
    ],
    ['short nonce', ['cco', 'in'], NONCE_BYTE_LENGTH - 1],
    ['long nonce', ['cco', 'in'], NONCE_BYTE_LENGTH + 1],
    ['short signature', ['cco', 'is'], SIGNATURE_BYTE_LENGTH - 1],
    ['long signature', ['cco', 'is'], SIGNATURE_BYTE_LENGTH + 1]
]) {
    new InvalidPayloadValidationScenario({
        title: `State.apply SET_GENESIS_EPOCH rejects a ${label}`,
        setupScenario: setupSetGenesisEpochScenario,
        buildValidPayload: buildSetGenesisEpochPayload,
        mutatePayload: (t, payload) => mutatePayloadBuffer(t, payload, path, length),
        assertStateUnchanged: assertRejected,
        expectedLogs: ['Contract schema validation failed.']
    }).performScenario();
}

registerRejectedConfigCase({
    title: 'State.apply SET_GENESIS_EPOCH rejects schema version 0 with valid config data',
    buildOptions: { schemaVersion: 0 },
    expectedLog: 'Contract schema validation failed.'
});

// requesterAddressString === null
new RequesterAddressValidationScenario({
    title: 'State.apply SET_GENESIS_EPOCH rejects an invalid requester address',
    setupScenario: setupSetGenesisEpochScenario,
    buildValidPayload: buildSetGenesisEpochPayload,
    assertStateUnchanged: assertRejected,
    expectedLogs: ['Requester address is invalid.']
}).performScenario();

// requesterPublicKey === NULL_BUFFER
createRequesterPublicKeyValidationScenario({
    title: 'State.apply SET_GENESIS_EPOCH rejects an undecodable requester public key',
    setupScenario: setupSetGenesisEpochScenario,
    buildValidPayload: buildSetGenesisEpochPayload,
    assertStateUnchanged: assertRejected,
    expectedLogs: ['Failed to decode requester public key.']
}).performScenario();

// adminEntry === null
new AdminEntryMissingScenario({
    title: 'State.apply SET_GENESIS_EPOCH rejects a missing admin entry',
    setupScenario: setupSetGenesisEpochScenario,
    buildValidPayload: buildSetGenesisEpochPayload,
    assertStateUnchanged: assertRejectedLocally,
    expectedLogs: ['Invalid admin entry.']
}).performScenario();

// decodedAdminEntry === null
new AdminEntryDecodeFailureScenario({
    title: 'State.apply SET_GENESIS_EPOCH rejects an undecodable admin entry',
    setupScenario: setupSetGenesisEpochScenario,
    buildValidPayload: buildSetGenesisEpochPayload,
    assertStateUnchanged: assertRejectedLocally,
    expectedLogs: ['Failed to decode admin entry.']
}).performScenario();

// !this.#isAdminApply(decodedAdminEntry, node)
new AdminOnlyGuardScenario({
    title: 'State.apply SET_GENESIS_EPOCH rejects a non-admin writer',
    setupScenario: setupSetGenesisEpochScenario,
    buildValidPayload: buildSetGenesisEpochPayload,
    assertStateUnchanged: assertRejectedLocally,
    expectedLogs: ['Node is not allowed to perform this operation. (ADMIN ONLY)']
}).performScenario();

// adminPublicKey === NULL_BUFFER
new AdminPublicKeyDecodeFailureScenario({
    title: 'State.apply SET_GENESIS_EPOCH rejects an undecodable admin public key',
    setupScenario: setupSetGenesisEpochScenario,
    buildValidPayload: buildSetGenesisEpochPayload,
    assertStateUnchanged: assertRejectedLocally,
    expectedLogs: ['Failed to decode admin public key.']
}).performScenario();

// adminPublicKey !== requesterPublicKey
new AdminConsistencyMismatchScenario({
    title: 'State.apply SET_GENESIS_EPOCH rejects requester/admin key mismatch',
    setupScenario: setupSetGenesisEpochScenario,
    buildValidPayload: buildSetGenesisEpochPayload,
    assertStateUnchanged: assertRejectedLocally,
    expectedLogs: ['System admin and node public keys do not match.']
}).performScenario();

// encodedConsensusConfig.length === 0
test('State.apply SET_GENESIS_EPOCH fails closed when consensus config encoding fails', async t => {
    const context = await setupSetGenesisEpochScenario(t);
    const payload = await buildSetGenesisEpochPayload(context);
    const { logs, result } = captureApplyErrors(() =>
        applyWithConsensusConfigEncodingFailure(context, payload)
    );
    const injected = await result;

    t.ok(injected, 'consensus config encoder failure was injected');
    await assertSetGenesisEpochFailureState(t, context, payload, { skipSync: true });
    assertLog(t, logs, 'Failed to encode consensus config.');
});

// !this.#validateConsensusConfigApply(op.cco.cc)
for (const schemaVersion of [2, 255]) {
    registerRejectedConfigCase({
        title: `State.apply SET_GENESIS_EPOCH rejects unsupported schema version ${schemaVersion}`,
        buildOptions: { schemaVersion, configData: b4a.from([1]) },
        expectedLog: 'Consensus config validation failed.'
    });
}

for (const configDataLength of [
    1,
    2,
    3,
    4,
    5,
    7,
    8,
    31,
    32,
    255,
    256,
    1024,
    CONSENSUS_CONFIG_DATA_MAX_SIZE - 1,
    CONSENSUS_CONFIG_DATA_MAX_SIZE
]) {
    registerRejectedConfigCase({
        title: `State.apply SET_GENESIS_EPOCH rejects schema-v1 data length ${configDataLength}`,
        buildOptions: { configData: b4a.alloc(configDataLength, 1) },
        expectedLog: 'Consensus config validation failed.'
    });
}

registerRejectedConfigCase({
    title: 'State.apply SET_GENESIS_EPOCH rejects zero VDF difficulty',
    buildOptions: { difficulty: 0 },
    expectedLog: 'Consensus config validation failed.'
});

registerRejectedConfigCase({
    title: 'State.apply SET_GENESIS_EPOCH rejects zero VDF discriminant bit size',
    buildOptions: { discriminantBitSize: 0 },
    expectedLog: 'Consensus config validation failed.'
});

registerRejectedConfigCase({
    title: 'State.apply SET_GENESIS_EPOCH rejects unsupported VDF discriminant bit size',
    buildOptions: { discriminantBitSize: 3072 },
    expectedLog: 'Consensus config validation failed.'
});

registerRejectedConfigCase({
    title: 'State.apply SET_GENESIS_EPOCH rejects an all-zero VDF config',
    buildOptions: { difficulty: 0, discriminantBitSize: 0 },
    expectedLog: 'Consensus config validation failed.'
});

// message.length === 0
test('State.apply SET_GENESIS_EPOCH fails closed when requester message construction fails', async t => {
    const context = await setupSetGenesisEpochScenario(t);
    const payload = await buildSetGenesisEpochPayload(context);
    const { logs, result } = captureApplyErrors(() =>
        applyWithMessageConstructionFailure(context, payload)
    );
    const injected = await result;

    t.ok(injected, 'requester message construction failure was injected');
    await assertSetGenesisEpochFailureState(t, context, payload, { skipSync: true });
    assertLog(t, logs, 'Invalid requester message.');
});

// hash !== op.cco.tx
new InvalidHashValidationScenario({
    title: 'State.apply SET_GENESIS_EPOCH rejects a mismatched transaction hash',
    setupScenario: setupSetGenesisEpochScenario,
    buildValidPayload: buildSetGenesisEpochPayload,
    assertStateUnchanged: assertRejected,
    expectedLogs: ['Message hash does not match the tx_hash.']
}).performScenario();

test('State.apply SET_GENESIS_EPOCH rejects a payload signed for another network', async t => {
    const context = await setupSetGenesisEpochScenario(t);
    const foreignNetworkId = stateConfig.networkId === 0xffff
        ? stateConfig.networkId - 1
        : stateConfig.networkId + 1;
    const payload = await buildSetGenesisEpochPayload(context, {
        messageConfig: {
            addressPrefix: stateConfig.addressPrefix,
            networkId: foreignNetworkId
        }
    });
    const { logs, result } = captureApplyErrors(() =>
        appendAndUpdate(context.adminBootstrap.base, payload)
    );
    await result;

    await assertSetGenesisEpochFailureState(t, context, payload);
    assertLog(t, logs, 'Message hash does not match the tx_hash.');
});

for (const [label, transformEncodedConfig] of [
    [
        'unknown protobuf fields',
        canonicalConfig => b4a.concat([canonicalConfig, b4a.from([0x78, 0x01])])
    ],
    [
        'a duplicated protobuf config field',
        canonicalConfig => b4a.concat([canonicalConfig, canonicalConfig])
    ]
]) {
    test(`State.apply SET_GENESIS_EPOCH rejects config bytes with ${label}`, async t => {
        const context = await setupSetGenesisEpochScenario(t);
        const payload = await buildSetGenesisEpochPayload(context, {
            transformEncodedConfig
        });
        const operation = safeDecodeApplyOperation(payload);
        t.ok(
            operation?.cco?.cc,
            'non-canonical protobuf config decodes into the contract payload'
        );

        const { logs, result } = captureApplyErrors(() =>
            appendAndUpdate(context.adminBootstrap.base, payload)
        );
        await result;

        await assertSetGenesisEpochFailureState(t, context, payload);
        assertLog(t, logs, 'Message hash does not match the tx_hash.');
    });
}

new InvalidHashValidationScenario({
    title: 'State.apply SET_GENESIS_EPOCH binds config bytes into the transaction hash',
    setupScenario: setupSetGenesisEpochScenario,
    buildValidPayload: buildSetGenesisEpochPayload,
    mutatePayload: mutateConfigDataWithoutResigning,
    assertStateUnchanged: assertRejected,
    expectedLogs: ['Message hash does not match the tx_hash.']
}).performScenario();

for (const [label, strategy] of [
    ['transaction validity', MessageComponentStrategy.TX_VALIDITY],
    ['nonce', MessageComponentStrategy.NONCE]
]) {
    new InvalidMessageComponentValidationScenario({
        title: `State.apply SET_GENESIS_EPOCH binds ${label} into the transaction hash`,
        setupScenario: setupSetGenesisEpochScenario,
        buildValidPayload: buildSetGenesisEpochPayload,
        assertStateUnchanged: assertRejected,
        strategy,
        expectedLogs: ['Message hash does not match the tx_hash.']
    }).performScenario();
}

// !isMessageVerified
for (const [label, strategy] of [
    ['foreign', SignatureMutationStrategy.FOREIGN_SIGNATURE],
    ['tampered', SignatureMutationStrategy.TYPE_MISMATCH]
]) {
    new InvalidSignatureValidationScenario({
        title: `State.apply SET_GENESIS_EPOCH rejects a ${label} admin signature`,
        setupScenario: setupSetGenesisEpochScenario,
        buildValidPayload: buildSetGenesisEpochPayload,
        assertStateUnchanged: assertRejected,
        strategy,
        expectedLogs: ['Failed to verify message signature.']
    }).performScenario();
}

// indexersSequenceState === null
new IndexerSequenceStateInvalidScenario({
    title: 'State.apply SET_GENESIS_EPOCH fails closed when indexer state is unavailable',
    setupScenario: setupSetGenesisEpochScenario,
    buildValidPayload: buildSetGenesisEpochPayload,
    assertStateUnchanged: assertRejectedLocally,
    expectedLogs: ['Indexer sequence state is invalid.']
}).performScenario();

// op.cco.txv !== indexersSequenceState
new TransactionValidityMismatchScenario({
    title: 'State.apply SET_GENESIS_EPOCH rejects a correctly signed stale tx validity',
    setupScenario: setupSetGenesisEpochScenario,
    buildValidPayload: buildSetGenesisEpochPayload,
    assertStateUnchanged: assertRejected,
    txValidityPath: ['cco', 'txv'],
    rebuildPayloadWithTxValidity: ({ context, mutatedTxValidity }) =>
        buildPayloadWithTxValidity(context, mutatedTxValidity),
    expectedLogs: ['Transaction was not executed.']
}).performScenario();

// opEntry !== null
test('State.apply SET_GENESIS_EPOCH detects a duplicate transaction inside one batch', async t => {
    const context = await setupSetGenesisEpochScenario(t);
    const payload = await buildSetGenesisEpochPayload(context);
    const { logs, result } = captureApplyErrors(() =>
        appendBatchAndUpdate(context.adminBootstrap.base, [payload, payload])
    );
    await result;

    await assertGenesisInitialized(t, context.adminBootstrap.base, payload);
    assertLog(t, logs, 'Operation has already been applied.');
});

test('State.apply SET_GENESIS_EPOCH detects the same transaction in consecutive batches', async t => {
    const context = await setupSetGenesisEpochScenario(t);
    const payload = await buildSetGenesisEpochPayload(context);

    await appendAndUpdate(context.adminBootstrap.base, payload);
    await assertGenesisInitialized(t, context.adminBootstrap.base, payload);

    const { logs, result } = captureApplyErrors(() =>
        appendAndUpdate(context.adminBootstrap.base, payload)
    );
    await result;

    await assertGenesisInitialized(t, context.adminBootstrap.base, payload);
    assertLog(t, logs, 'Operation has already been applied.');
});

// currentEpoch !== null
test('State.apply SET_GENESIS_EPOCH ignores any non-null current epoch entry', async t => {
    const context = await setupSetGenesisEpochScenario(t);
    const payload = await buildSetGenesisEpochPayload(context);
    const { logs, result } = captureApplyErrors(() =>
        applyWithEntryOverrides(
            context,
            payload,
            new Map([[EntryType.EPOCH_CURRENT, b4a.from([0xff])]])
        )
    );
    await result;

    await assertGenesisUninitialized(t, context.adminBootstrap.base, payload);
    assertLog(t, logs, 'Current epoch is set. Cannot set a new genesis epoch');
});

test('State.apply SET_GENESIS_EPOCH ignores a second distinct genesis in one batch', async t => {
    const context = await setupSetGenesisEpochScenario(t);
    const firstPayload = await buildSetGenesisEpochPayload(context);
    const secondPayload = await buildSetGenesisEpochPayload(context);
    const firstOperation = safeDecodeApplyOperation(firstPayload);
    const secondOperation = safeDecodeApplyOperation(secondPayload);

    t.not(
        firstOperation.cco.tx.toString('hex'),
        secondOperation.cco.tx.toString('hex'),
        'independently signed genesis operations have distinct transaction hashes'
    );

    const { logs, result } = captureApplyErrors(() =>
        appendBatchAndUpdate(context.adminBootstrap.base, [firstPayload, secondPayload])
    );
    await result;

    await assertGenesisInitialized(t, context.adminBootstrap.base, firstPayload);
    await assertOperationRecorded(t, context.adminBootstrap.base, secondPayload, false);
    assertLog(t, logs, 'Current epoch is set. Cannot set a new genesis epoch');
});

// genesisEpochHash !== null
test('State.apply SET_GENESIS_EPOCH ignores any non-null epoch-zero hash entry', async t => {
    const context = await setupSetGenesisEpochScenario(t);
    const payload = await buildSetGenesisEpochPayload(context);
    const { logs, result } = captureApplyErrors(() =>
        applyWithEntryOverrides(
            context,
            payload,
            new Map([[EntryType.EPOCH + '0', b4a.from([0xff])]])
        )
    );
    await result;

    await assertGenesisUninitialized(t, context.adminBootstrap.base, payload);
    assertLog(t, logs, 'Genesis epoch is set. Cannot set a new one');
});

// currentConsensusConfigIndex !== null || genesisConsensusConfig !== null
for (const [label, overridesFactory] of [
    [
        'an existing current consensus config pointer',
        () => new Map([[EntryType.CONSENSUS_CONFIG_CURRENT, b4a.from([0xff])]])
    ],
    [
        'an existing genesis consensus config record',
        encodedConfig => new Map([[EntryType.CONSENSUS_CONFIG_RECORD + 0, encodedConfig]])
    ],
    [
        'both existing genesis consensus config entries',
        encodedConfig => new Map([
            [EntryType.CONSENSUS_CONFIG_CURRENT, b4a.from([0xff])],
            [EntryType.CONSENSUS_CONFIG_RECORD + 0, encodedConfig]
        ])
    ]
]) {
    test(`State.apply SET_GENESIS_EPOCH ignores ${label}`, async t => {
        const context = await setupSetGenesisEpochScenario(t);
        const payload = await buildSetGenesisEpochPayload(context);
        const operation = safeDecodeApplyOperation(payload);
        const encodedConfig = safeEncodeConsensusConfig(operation.cco.cc);
        const { logs, result } = captureApplyErrors(() =>
            applyWithEntryOverrides(context, payload, overridesFactory(encodedConfig))
        );
        await result;

        await assertGenesisUninitialized(t, context.adminBootstrap.base, payload);
        assertLog(
            t,
            logs,
            'Genesis consensus config is set. Cannot set a new genesis epoch'
        );
    });
}

test('State.apply SET_GENESIS_EPOCH fails when final epoch proof encoding fails', async t => {
    const context = await setupSetGenesisEpochScenario(t);
    const payload = await buildSetGenesisEpochPayload(context);
    const { logs, result } = captureApplyErrors(() =>
        applyWithGenesisEpochEncodingFailure(context, payload)
    );
    const injected = await result;

    t.ok(injected, 'safeEncodeEpochProofV1 failure was injected');
    await assertSetGenesisEpochFailureState(t, context, payload, { skipSync: true });
    assertLog(t, logs, 'Could not initialize genesis epoch');
});

test('State.apply SET_GENESIS_EPOCH fails when final epoch proof hashing fails', async t => {
    const context = await setupSetGenesisEpochScenario(t);
    const payload = await buildSetGenesisEpochPayload(context);
    const events = [];
    context.adminBootstrap.state.on(
        CustomEventType.GENESIS_EPOCH_CREATED,
        event => events.push(event)
    );
    const { logs, result } = captureApplyErrors(() =>
        applyWithGenesisEpochHashFailure(context, payload)
    );
    const injected = await result;

    t.ok(injected, 'genesis epoch proof hash failure was injected');
    await assertSetGenesisEpochFailureState(t, context, payload, { skipSync: true });
    t.is(events.length, 0, 'hash failure does not emit GENESIS_EPOCH_CREATED');
    assertLog(t, logs, 'Failed to hash genesis epoch proof.');
});

// Status.SUCCESS
test('State.apply SET_GENESIS_EPOCH initializes and replicates the complete genesis state', async t => {
    const context = await setupSetGenesisEpochScenario(t, { nodes: 3 });
    const payload = await buildSetGenesisEpochPayload(context);
    let epochCreated;
    context.adminBootstrap.state.once(CustomEventType.GENESIS_EPOCH_CREATED, event => { epochCreated = event; });

    await appendAndUpdate(context.adminBootstrap.base, payload);
    await assertGenesisInitialized(t, context.adminBootstrap.base, payload);
    t.alike(epochCreated, { epoch: 0n, proposerAddress: context.adminBootstrap.wallet.address }, 'genesis emits GENESIS_EPOCH_CREATED');

    await context.sync();
    for (const reader of context.peers.slice(1)) {
        await assertGenesisInitialized(t, reader.base, payload);
    }
});

for (const [label, difficulty, discriminantBitSize] of [
    ['1024-bit discriminant', 1, 1024],
    ['2048-bit discriminant and difficulty containing zero bytes', 0x00010000, 2048],
    ['4096-bit discriminant and maximum difficulty', 0xffffffff, 4096]
]) {
    test(`State.apply SET_GENESIS_EPOCH accepts ${label} valid VDF parameters`, async t => {
        const context = await setupSetGenesisEpochScenario(t);
        const payload = await buildSetGenesisEpochPayload(context, {
            difficulty,
            discriminantBitSize
        });

        await appendAndUpdate(context.adminBootstrap.base, payload);
        await assertGenesisInitialized(t, context.adminBootstrap.base, payload, {
            difficulty,
            discriminantBitSize
        });
    });
}

registerConsensusControlPayloadValidationSuite({
    operationName: 'SET_GENESIS_EPOCH',
    setupScenario: setupSetGenesisEpochScenario,
    buildValidPayload: buildSetGenesisEpochPayload,
    buildSemanticAttackPayloads: buildGenesisSemanticAttackPayloads,
    appendAndUpdate,
    appendBatchAndUpdate,
    assertStateBeforeOperation: (t, context, payload) =>
        assertSetGenesisEpochFailureState(t, context, payload, { skipSync: true }),
    assertAppliedAndReplicated: async (t, context, payload) => {
        await assertGenesisInitialized(t, context.adminBootstrap.base, payload);
        await context.sync();
        for (const reader of context.peers.slice(1)) {
            await assertGenesisInitialized(t, reader.base, payload);
        }
    }
});

async function buildGenesisSemanticAttackPayloads(context) {
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
        buildOptions.map(options => buildSetGenesisEpochPayload(context, options))
    );
}

function registerRejectedConfigCase({ title, buildOptions, expectedLog }) {
    test(title, async t => {
        const context = await setupSetGenesisEpochScenario(t);
        const payload = await buildSetGenesisEpochPayload(context, buildOptions);
        const { logs, result } = captureApplyErrors(() =>
            appendAndUpdate(context.adminBootstrap.base, payload)
        );
        await result;

        await assertSetGenesisEpochFailureState(t, context, payload);
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

function assertLog(t, logs, expected) {
    const found = logs.some(args => args.some(arg => String(arg).includes(expected)));
    t.ok(found, `expected apply log "${expected}" was emitted`);
}
