import b4a from 'b4a';
import { setupStateNetwork } from '../../../../helpers/StateNetworkFactory.js';
import {
    defaultOpenHyperbeeView,
    deriveIndexerSequenceState,
    eventFlush,
    seedBootstrapIndexer
} from '../../../../helpers/autobaseTestHelpers.js';
import { applyStateMessageFactory } from '../../../../../src/messages/state/applyStateMessageFactory.js';
import {
    decodeConsensusConfig,
    encodeConsensusConfig,
    safeDecodeApplyOperation,
    safeEncodeApplyOperation
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import {
    decodeVdfConfig,
    encodeVdfConfig
} from '../../../../../src/codecs/consensus/v1/vdfConfigCodec.js';
import {
    AUTOBASE_VALUE_ENCODING,
    EntryType
} from '../../../../../src/utils/constants.js';
import {
    safeReadUint32BE,
    uint16ToBuffer,
    uint32ToBuffer
} from '../../../../../src/utils/buffer.js';
import { config } from '../../../../helpers/config.js';
import { buildAddAdminRequesterPayload } from '../addAdmin/addAdminScenarioHelpers.js';

export const GENESIS_DIFFICULTY = 55_000_000;
export const GENESIS_DISCRIMINANT_BIT_SIZE = 2048;
export const UPDATED_DIFFICULTY = 60_000_000;
export const UPDATED_DISCRIMINANT_BIT_SIZE = 4096;

export async function setupSetConsensusConfigScenario(
    t,
    { initializeGenesis = true, nodes = 2 } = {}
) {
    const context = await setupStateNetwork({
        nodes,
        valueEncoding: AUTOBASE_VALUE_ENCODING,
        open: defaultOpenHyperbeeView,
        stateOptions: { enableTxApplyLogs: false }
    });

    seedBootstrapIndexer(context);
    t.teardown(async () => context.teardown());

    await appendAndUpdate(
        context.adminBootstrap.base,
        await buildAddAdminRequesterPayload(context)
    );

    if (initializeGenesis) {
        await initializeGenesisEpoch(context);
    }

    return context;
}

export async function buildSetConsensusConfigPayload(
    context,
    {
        difficulty = UPDATED_DIFFICULTY,
        discriminantBitSize = UPDATED_DISCRIMINANT_BIT_SIZE,
        schemaVersion = 1,
        configData,
        wallet = context.adminBootstrap.wallet,
        txValidity,
        messageConfig = config,
        transformEncodedConfig
    } = {}
) {
    const effectiveTxValidity = txValidity ??
        await deriveIndexerSequenceState(context.adminBootstrap.base);
    const effectiveConfigData = configData ?? encodeVdfConfig({
        difficulty: uint32ToBuffer(difficulty),
        discriminantBitSize: uint16ToBuffer(discriminantBitSize)
    });
    const canonicalConsensusConfig = encodeConsensusConfig({
        sv: b4a.from([schemaVersion]),
        cd: effectiveConfigData
    });
    const encodedConsensusConfig = transformEncodedConfig
        ? transformEncodedConfig(canonicalConsensusConfig)
        : canonicalConsensusConfig;
    const payload = await applyStateMessageFactory(wallet, messageConfig)
        .buildCompleteSetConsensusConfigMessage(
            wallet.address,
            effectiveTxValidity,
            encodedConsensusConfig
        );

    return safeEncodeApplyOperation(payload);
}

export async function appendAndUpdate(base, payload) {
    await base.append(payload);
    await base.update();
    await eventFlush();
}

export async function appendBatchAndUpdate(base, payloads) {
    await base.append(payloads);
    await base.update();
    await eventFlush();
}

export async function assertCurrentConfigId(t, base, expectedId) {
    const entry = await base.view.get(EntryType.CONSENSUS_CONFIG_CURRENT);
    if (expectedId === null) {
        t.is(entry, null, 'current consensus config pointer is absent');
        return;
    }

    t.ok(entry, 'current consensus config pointer exists');
    if (!entry) return;

    t.is(entry.value.length, 4, 'current consensus config pointer has canonical uint32 width');
    t.ok(
        b4a.equals(entry.value, uint32ToBuffer(expectedId)),
        `current consensus config pointer stores canonical bytes for ${expectedId}`
    );
    t.is(
        safeReadUint32BE(entry?.value),
        expectedId,
        `current consensus config pointer is ${expectedId}`
    );
}

export async function assertVdfConfigRecord(
    t,
    base,
    configId,
    expectedDifficulty,
    expectedDiscriminantBitSize
) {
    const entry = await base.view.get(EntryType.CONSENSUS_CONFIG_RECORD + configId);
    t.ok(entry, `consensus config record ${configId} exists`);
    if (!entry) return;

    const expectedEncodedConfig = encodeConsensusConfig({
        sv: b4a.from([1]),
        cd: encodeVdfConfig({
            difficulty: uint32ToBuffer(expectedDifficulty),
            discriminantBitSize: uint16ToBuffer(expectedDiscriminantBitSize)
        })
    });
    t.ok(
        b4a.equals(entry.value, expectedEncodedConfig),
        `consensus config record ${configId} stores canonical bytes`
    );

    const decodedConsensusConfig = decodeConsensusConfig(entry.value);
    t.is(decodedConsensusConfig.sv.readUInt8(0), 1, `record ${configId} uses schema version 1`);

    const decodedVdfConfig = decodeVdfConfig(decodedConsensusConfig.cd);
    t.is(
        decodedVdfConfig.difficulty.readUInt32BE(0),
        expectedDifficulty,
        `record ${configId} difficulty matches`
    );
    t.is(
        decodedVdfConfig.discriminantBitSize.readUInt16BE(0),
        expectedDiscriminantBitSize,
        `record ${configId} discriminant bit size matches`
    );
}

export async function assertConfigRecordMissing(t, base, configId) {
    const entry = await base.view.get(EntryType.CONSENSUS_CONFIG_RECORD + configId);
    t.is(entry, null, `consensus config record ${configId} is absent`);
}

export async function assertOperationRecorded(t, base, payload, expected) {
    const operation = safeDecodeApplyOperation(payload);
    t.ok(operation?.cco?.tx, 'SET_CONSENSUS_CONFIG payload decodes');

    const entry = operation?.cco?.tx
        ? await base.view.get(operation.cco.tx.toString('hex'))
        : null;
    if (expected) {
        t.ok(entry, 'SET_CONSENSUS_CONFIG transaction is recorded');
        if (!entry) return;

        t.ok(
            b4a.equals(entry.value, payload),
            'transaction marker stores the complete original operation payload'
        );
    } else {
        t.is(entry, null, 'SET_CONSENSUS_CONFIG transaction is not recorded');
    }
}

export async function assertGenesisConfigUnchanged(t, base) {
    await assertCurrentConfigId(t, base, 0);
    await assertVdfConfigRecord(
        t,
        base,
        0,
        GENESIS_DIFFICULTY,
        GENESIS_DISCRIMINANT_BIT_SIZE
    );
    await assertConfigRecordMissing(t, base, 1);
    await assertConfigRecordMissing(t, base, 'null');
}

export async function assertSetConsensusConfigFailureState(
    t,
    context,
    payload,
    { skipSync = false } = {}
) {
    await assertGenesisConfigUnchanged(t, context.adminBootstrap.base);
    await assertOperationRecorded(t, context.adminBootstrap.base, payload, false);

    if (!skipSync) {
        await context.sync();
        for (const reader of context.peers.slice(1)) {
            await assertGenesisConfigUnchanged(t, reader.base);
            await assertOperationRecorded(t, reader.base, payload, false);
        }
    }
}

export async function assertConsensusConfigUninitialized(t, base, payload = null) {
    await assertCurrentConfigId(t, base, null);
    await assertConfigRecordMissing(t, base, 0);
    await assertConfigRecordMissing(t, base, 1);
    await assertConfigRecordMissing(t, base, 'null');
    if (payload) {
        await assertOperationRecorded(t, base, payload, false);
    }
}

export function mutatePayloadForInvalidSchema(t, validPayload) {
    const operation = safeDecodeApplyOperation(validPayload);
    t.ok(operation?.cco, 'fixtures decode');
    operation.cco.tx = b4a.alloc(31);
    return safeEncodeApplyOperation(operation);
}

export function mutateConfigDataWithoutResigning(t, validPayload) {
    const operation = safeDecodeApplyOperation(validPayload);
    t.ok(operation?.cco?.cc?.cd, 'fixtures decode');
    const mutated = b4a.from(operation.cco.cc.cd);
    mutated[0] ^= 0x01;
    if (mutated[0] === 0 && mutated.subarray(0, 4).every(byte => byte === 0)) {
        mutated[0] = 1;
    }
    operation.cco.cc.cd = mutated;
    return safeEncodeApplyOperation(operation);
}

export async function buildPayloadWithTxValidity(context, txValidity) {
    return buildSetConsensusConfigPayload(context, { txValidity });
}

export async function applyWithCurrentPointerOverride(context, payload, pointerValue) {
    const base = context.adminBootstrap.base;
    const cleanup = patchCurrentPointerForNextApply(base, pointerValue);
    try {
        await appendAndUpdate(base, payload);
    } finally {
        cleanup();
    }
}

function patchCurrentPointerForNextApply(base, pointerValue) {
    const originalApply = base._handlers.apply;
    let shouldPatchNextApply = true;

    base._handlers.apply = async (nodes, view, baseContext) => {
        if (!shouldPatchNextApply) {
            return originalApply(nodes, view, baseContext);
        }

        shouldPatchNextApply = false;
        const previousBatch = view.batch;
        const boundBatch = previousBatch.bind(view);

        view.batch = function patchedBatch(...args) {
            const batch = boundBatch(...args);
            const originalGet = batch.get?.bind(batch);
            if (typeof originalGet === 'function') {
                let overridden = false;
                batch.get = async key => {
                    if (!overridden && isCurrentConfigKey(key)) {
                        overridden = true;
                        if (pointerValue === null) return null;
                        const entry = await originalGet(key);
                        return entry ? { ...entry, value: pointerValue } : { value: pointerValue };
                    }
                    return originalGet(key);
                };
            }
            return batch;
        };

        try {
            return await originalApply(nodes, view, baseContext);
        } finally {
            view.batch = previousBatch;
        }
    };

    return () => {
        base._handlers.apply = originalApply;
    };
}

function isCurrentConfigKey(key) {
    if (typeof key === 'string') {
        return key === EntryType.CONSENSUS_CONFIG_CURRENT;
    }
    return b4a.isBuffer(key) &&
        b4a.equals(key, b4a.from(EntryType.CONSENSUS_CONFIG_CURRENT));
}

export async function initializeGenesisEpoch(context) {
    const adminNode = context.adminBootstrap;
    const txValidity = await deriveIndexerSequenceState(adminNode.base);
    const encodedConsensusConfig = encodeConsensusConfig({
        sv: b4a.from([1]),
        cd: encodeVdfConfig({
            difficulty: uint32ToBuffer(GENESIS_DIFFICULTY),
            discriminantBitSize: uint16ToBuffer(GENESIS_DISCRIMINANT_BIT_SIZE)
        })
    });
    const payload = await applyStateMessageFactory(adminNode.wallet, config)
        .buildCompleteSetGenesisEpochMessage(
            adminNode.wallet.address,
            txValidity,
            encodedConsensusConfig
        );

    await appendAndUpdate(adminNode.base, safeEncodeApplyOperation(payload));

    const currentEntry = await adminNode.base.view.get(EntryType.CONSENSUS_CONFIG_CURRENT);
    const genesisConfigEntry = await adminNode.base.view.get(EntryType.CONSENSUS_CONFIG_RECORD + 0);
    if (safeReadUint32BE(currentEntry?.value) !== 0 || !genesisConfigEntry?.value) {
        throw new Error('Failed to initialize genesis consensus config for scenario.');
    }
}
