import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { setupStateNetwork } from '../../../../helpers/StateNetworkFactory.js';
import {
    defaultOpenHyperbeeView,
    deriveIndexerSequenceState,
    eventFlush,
    seedBootstrapIndexer
} from '../../../../helpers/autobaseTestHelpers.js';
import { applyStateMessageFactory } from '../../../../../src/messages/state/applyStateMessageFactory.js';
import {
    safeDecodeApplyOperation,
    safeDecodeEpochProof,
    safeEncodeApplyOperation,
    safeEncodeConsensusConfig
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import {
    decodeVdfConfig,
    encodeVdfConfig
} from '../../../../../src/codecs/consensus/v1/vdfConfigCodec.js';
import { safeDecodeProofProposal } from '../../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import {
    AUTOBASE_VALUE_ENCODING,
    ConsensusProtocolVersion,
    EntryType,
    HASH_BYTE_LENGTH,
    SIGNATURE_BYTE_LENGTH,
    VDF_PROOF_BYTE_LENGTHS
} from '../../../../../src/utils/constants.js';
import {
    safeReadUint32BE,
    safeUint8ToBuffer,
    uint16ToBuffer,
    uint32ToBuffer
} from '../../../../../src/utils/buffer.js';
import { config } from '../../../../helpers/config.js';
import { buildAddAdminRequesterPayload } from '../addAdmin/addAdminScenarioHelpers.js';

export const GENESIS_DIFFICULTY = 55_000_000;
export const GENESIS_DISCRIMINANT_BIT_SIZE = 2048;

export async function setupSetGenesisEpochScenario(t, { nodes = 2 } = {}) {
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

    return context;
}

export async function buildSetGenesisEpochPayload(
    context,
    {
        difficulty = GENESIS_DIFFICULTY,
        discriminantBitSize = GENESIS_DISCRIMINANT_BIT_SIZE,
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
    const canonicalConsensusConfig = safeEncodeConsensusConfig({
        sv: b4a.from([schemaVersion]),
        cd: effectiveConfigData
    });
    const encodedConsensusConfig = transformEncodedConfig
        ? transformEncodedConfig(canonicalConsensusConfig)
        : canonicalConsensusConfig;
    const payload = await applyStateMessageFactory(wallet, messageConfig)
        .buildCompleteSetGenesisEpochMessage(
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

export async function assertGenesisUninitialized(t, base, payload = null) {
    t.is(
        await base.view.get(EntryType.EPOCH_CURRENT),
        null,
        'current epoch pointer is absent'
    );
    t.is(
        await base.view.get(EntryType.EPOCH + '0'),
        null,
        'genesis epoch hash is absent'
    );
    t.is(
        await base.view.get(EntryType.CONSENSUS_CONFIG_CURRENT),
        null,
        'current consensus config pointer is absent'
    );
    t.is(
        await base.view.get(EntryType.CONSENSUS_CONFIG_RECORD + 0),
        null,
        'genesis consensus config record is absent'
    );

    const epochProofEntries = await collectEntriesWithPrefix(base, EntryType.EPOCH_HASH);
    t.is(epochProofEntries.length, 0, 'genesis epoch proof ledger is empty');

    if (payload) {
        await assertOperationRecorded(t, base, payload, false);
    }
}

export async function assertSetGenesisEpochFailureState(
    t,
    context,
    payload,
    { skipSync = false } = {}
) {
    await assertGenesisUninitialized(t, context.adminBootstrap.base, payload);

    if (!skipSync) {
        await context.sync();
        for (const reader of context.peers.slice(1)) {
            await assertGenesisUninitialized(t, reader.base, payload);
        }
    }
}

export async function assertGenesisInitialized(
    t,
    base,
    payload,
    {
        difficulty = GENESIS_DIFFICULTY,
        discriminantBitSize = GENESIS_DISCRIMINANT_BIT_SIZE
    } = {}
) {
    const operation = safeDecodeApplyOperation(payload);
    t.ok(operation?.cco?.cc, 'SET_GENESIS_EPOCH payload decodes');
    if (!operation?.cco?.cc) return;

    const encodedConsensusConfig = safeEncodeConsensusConfig(operation.cco.cc);
    t.ok(encodedConsensusConfig.length > 0, 'genesis consensus config encodes canonically');

    const currentEpochEntry = await base.view.get(EntryType.EPOCH_CURRENT);
    t.ok(currentEpochEntry, 'current epoch pointer exists');
    if (!currentEpochEntry) return;
    t.is(currentEpochEntry.value.length, 8, 'current epoch pointer has uint64 width');
    t.ok(
        b4a.equals(currentEpochEntry.value, b4a.alloc(8)),
        'current epoch pointer stores epoch zero'
    );

    const epochZeroEntry = await base.view.get(EntryType.EPOCH + '0');
    t.ok(epochZeroEntry, 'genesis epoch hash exists');
    if (!epochZeroEntry) return;
    t.is(epochZeroEntry.value.length, HASH_BYTE_LENGTH, 'genesis epoch hash has canonical width');

    const epochProofKey = EntryType.EPOCH_HASH + epochZeroEntry.value.toString('hex');
    const epochProofEntry = await base.view.get(epochProofKey);
    t.ok(epochProofEntry, 'genesis epoch proof exists under its content hash');
    if (!epochProofEntry) return;

    const calculatedEpochProofHash = await tracCryptoApi.hash.blake3Safe(epochProofEntry.value);
    t.ok(
        b4a.equals(calculatedEpochProofHash, epochZeroEntry.value),
        'epoch zero points to the stored genesis proof'
    );

    const epochProof = safeDecodeEpochProof(epochProofEntry.value);
    t.ok(epochProof, 'stored genesis epoch proof decodes');
    if (!epochProof) return;
    t.is(epochProof.app.length, 0, 'genesis epoch proof has no approvals');

    const proofProposal = safeDecodeProofProposal(epochProof.pd);
    t.ok(proofProposal, 'stored genesis proof proposal decodes');
    if (!proofProposal) return;

    t.ok(
        b4a.equals(
            proofProposal.protocol_version,
            safeUint8ToBuffer(ConsensusProtocolVersion.V1)
        ),
        'genesis proof uses consensus protocol version 1'
    );
    t.ok(
        b4a.equals(proofProposal.network_id, uint16ToBuffer(config.networkId)),
        'genesis proof stores the configured network id'
    );
    t.ok(b4a.equals(proofProposal.epoch, b4a.alloc(8)), 'genesis proof stores epoch zero');
    t.ok(
        b4a.equals(
            proofProposal.previous_epoch_record_hash,
            b4a.alloc(HASH_BYTE_LENGTH)
        ),
        'genesis proof has a zero previous epoch hash'
    );
    t.ok(
        b4a.equals(proofProposal.proposer, operation.address),
        'genesis proof proposer is the requesting admin'
    );

    t.ok(
        b4a.equals(proofProposal.difficulty, operation.cco.cc.cd.subarray(0, 4)),
        'genesis proof stores the configured VDF difficulty'
    );
    t.ok(
        b4a.equals(proofProposal.discriminant_bit_size, operation.cco.cc.cd.subarray(4)),
        'genesis proof stores the configured VDF discriminant bit size'
    );
    t.ok(
        b4a.equals(
            proofProposal.proof,
            b4a.alloc(VDF_PROOF_BYTE_LENGTHS[discriminantBitSize])
        ),
        'genesis proof starts with an empty VDF proof'
    );
    t.ok(
        b4a.equals(proofProposal.signature, b4a.alloc(SIGNATURE_BYTE_LENGTH)),
        'genesis proof starts with an empty signature'
    );

    const currentConfigEntry = await base.view.get(EntryType.CONSENSUS_CONFIG_CURRENT);
    t.ok(currentConfigEntry, 'current consensus config pointer exists');
    if (!currentConfigEntry) return;
    t.is(currentConfigEntry.value.length, 4, 'current consensus config pointer has uint32 width');
    t.is(safeReadUint32BE(currentConfigEntry.value), 0, 'genesis consensus config is current');

    const configRecordEntry = await base.view.get(EntryType.CONSENSUS_CONFIG_RECORD + 0);
    t.ok(configRecordEntry, 'genesis consensus config record exists');
    if (!configRecordEntry) return;
    t.ok(
        b4a.equals(configRecordEntry.value, encodedConsensusConfig),
        'genesis consensus config record stores canonical bytes'
    );

    const decodedVdfConfig = decodeVdfConfig(operation.cco.cc.cd);
    t.is(
        decodedVdfConfig.difficulty.readUInt32BE(0),
        difficulty,
        'genesis VDF difficulty matches'
    );
    t.is(
        decodedVdfConfig.discriminantBitSize.readUInt16BE(0),
        discriminantBitSize,
        'genesis VDF discriminant bit size matches'
    );

    t.is(await base.view.get(EntryType.EPOCH + '1'), null, 'epoch one is absent');
    t.is(
        await base.view.get(EntryType.CONSENSUS_CONFIG_RECORD + 1),
        null,
        'consensus config record one is absent'
    );
    t.is(
        (await collectEntriesWithPrefix(base, EntryType.EPOCH_HASH)).length,
        1,
        'exactly one epoch proof is stored'
    );

    await assertOperationRecorded(t, base, payload, true);
}

export async function assertOperationRecorded(t, base, payload, expected) {
    const operation = safeDecodeApplyOperation(payload);
    t.ok(operation?.cco?.tx, 'SET_GENESIS_EPOCH transaction hash decodes');

    const entry = operation?.cco?.tx
        ? await base.view.get(operation.cco.tx.toString('hex'))
        : null;
    if (expected) {
        t.ok(entry, 'SET_GENESIS_EPOCH transaction is recorded');
        if (!entry) return;
        t.ok(
            b4a.equals(entry.value, payload),
            'transaction marker stores the complete original operation payload'
        );
    } else {
        t.is(entry, null, 'SET_GENESIS_EPOCH transaction is not recorded');
    }
}

export function mutatePayloadForInvalidSchema(t, validPayload) {
    return mutatePayloadBuffer(t, validPayload, ['cco', 'tx'], HASH_BYTE_LENGTH - 1);
}

export function mutatePayloadBuffer(t, validPayload, path, length) {
    const operation = safeDecodeApplyOperation(validPayload);
    t.ok(operation, 'fixtures decode');

    let parent = operation;
    for (const key of path.slice(0, -1)) {
        parent = parent?.[key];
    }
    if (!parent) return validPayload;

    parent[path.at(-1)] = b4a.alloc(length, 1);
    return safeEncodeApplyOperation(operation);
}

export function mutateConfigDataWithoutResigning(t, validPayload) {
    const operation = safeDecodeApplyOperation(validPayload);
    t.ok(operation?.cco?.cc?.cd, 'fixtures decode');
    const mutated = b4a.from(operation.cco.cc.cd);
    mutated[0] ^= 0x01;
    operation.cco.cc.cd = mutated;
    return safeEncodeApplyOperation(operation);
}

export async function buildPayloadWithTxValidity(context, txValidity) {
    return buildSetGenesisEpochPayload(context, { txValidity });
}

export async function applyWithEntryOverrides(context, payload, overrides) {
    const base = context.adminBootstrap.base;
    const cleanup = patchEntriesForNextApply(base, overrides);
    try {
        await appendAndUpdate(base, payload);
    } finally {
        cleanup();
    }
}

export async function applyWithConsensusConfigEncodingFailure(context, payload) {
    const operation = safeDecodeApplyOperation(payload);
    const encodedConsensusConfig = safeEncodeConsensusConfig(operation?.cco?.cc);
    const originalFrom = b4a.from;
    let injected = false;

    b4a.from = (value, ...args) => {
        if (!injected && buffersHaveSameBytes(value, encodedConsensusConfig)) {
            injected = true;
            throw new Error('forced consensus config encoding failure');
        }
        return originalFrom(value, ...args);
    };

    try {
        await appendAndUpdate(context.adminBootstrap.base, payload);
    } finally {
        b4a.from = originalFrom;
    }

    return injected;
}

export async function applyWithMessageConstructionFailure(context, payload) {
    const operation = safeDecodeApplyOperation(payload);
    const encodedConsensusConfig = safeEncodeConsensusConfig(operation?.cco?.cc);
    const originalConcat = b4a.concat;
    let injected = false;

    b4a.concat = (buffers, ...args) => {
        if (
            !injected &&
            Array.isArray(buffers) &&
            buffers.length === 5 &&
            buffersHaveSameBytes(buffers[2], encodedConsensusConfig)
        ) {
            injected = true;
            return b4a.alloc(0);
        }
        return originalConcat(buffers, ...args);
    };

    try {
        await appendAndUpdate(context.adminBootstrap.base, payload);
    } finally {
        b4a.concat = originalConcat;
    }

    return injected;
}

export async function applyWithGenesisEpochEncodingFailure(context, payload) {
    const originalFrom = b4a.from;
    let injected = false;

    b4a.from = (value, ...args) => {
        const encodedValue = originalFrom(value, ...args);
        if (!injected && isEncodedGenesisEpochProof(encodedValue)) {
            injected = true;
            throw new Error('forced genesis epoch encoding failure');
        }
        return encodedValue;
    };

    try {
        await appendAndUpdate(context.adminBootstrap.base, payload);
    } finally {
        b4a.from = originalFrom;
    }

    return injected;
}

export async function applyWithGenesisEpochHashFailure(context, payload) {
    const originalBlake3Safe = tracCryptoApi.hash.blake3Safe;
    let injected = false;

    tracCryptoApi.hash.blake3Safe = async (value, ...args) => {
        if (!injected && isEncodedGenesisEpochProof(value)) {
            injected = true;
            return b4a.alloc(0);
        }
        return originalBlake3Safe(value, ...args);
    };

    try {
        await appendAndUpdate(context.adminBootstrap.base, payload);
    } finally {
        tracCryptoApi.hash.blake3Safe = originalBlake3Safe;
    }

    return injected;
}

function patchEntriesForNextApply(base, overrides) {
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
                batch.get = async key => {
                    const normalizedKey = normalizeKey(key);
                    if (!overrides.has(normalizedKey)) {
                        return originalGet(key);
                    }

                    const value = overrides.get(normalizedKey);
                    return value === null ? null : { value };
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

async function collectEntriesWithPrefix(base, prefix) {
    const entries = [];
    for await (const entry of base.view.createReadStream({
        gte: prefix,
        lt: `${prefix}\xff`
    })) {
        entries.push(entry);
    }
    return entries;
}

function normalizeKey(key) {
    return b4a.isBuffer(key) ? key.toString() : key;
}

function buffersHaveSameBytes(left, right) {
    if (!left || !right || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index++) {
        if (left[index] !== right[index]) return false;
    }
    return true;
}

function isEncodedGenesisEpochProof(value) {
    const epochProof = safeDecodeEpochProof(value);
    if (!epochProof || epochProof.app.length !== 0) return false;

    const proofProposal = safeDecodeProofProposal(epochProof.pd);
    return proofProposal !== null;
}
