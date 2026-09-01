import b4a from 'b4a';
import {
    encodeApplyOperation,
    encodeConsensusConfig
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import {
    encodeProofProposal,
    safeDecodeProofProposal
} from '../../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import { encodeVdfConfig } from '../../../../../src/codecs/consensus/v1/vdfConfigCodec.js';
import { EntryType } from '../../../../../src/utils/constants.js';
import { uint16ToBuffer, uint32ToBuffer, uint8ToBuffer } from '../../../../../src/utils/buffer.js';
import {
    VDF_DIFFICULTY,
    VDF_DISCRIMINANT_SIZE,
    appendAndUpdate,
    decodeSetEpochPayload,
    getCurrentEpoch,
    getEpochHash
} from './setEpochScenarioHelpers.js';

export function mutateProofProposal(payload, mutate) {
    const operation = decodeSetEpochPayload(payload);
    const proofProposal = safeDecodeProofProposal(operation?.seo?.pd);
    if (proofProposal === null) {
        throw new Error('SET_EPOCH test fixture contains an invalid proof proposal.');
    }

    mutate(proofProposal);
    operation.seo.pd = encodeProofProposal(proofProposal);
    return encodeApplyOperation(operation);
}

export function buildConsensusConfigRecord({
    schemaVersion = 1,
    configData = encodeVdfConfig({
        difficulty: uint32ToBuffer(VDF_DIFFICULTY),
        discriminantBitSize: uint16ToBuffer(VDF_DISCRIMINANT_SIZE)
    })
} = {}) {
    return encodeConsensusConfig({
        sv: uint8ToBuffer(schemaVersion),
        cd: configData
    });
}

export async function captureEpochState(base) {
    return {
        current: valueAsHex(await getEntryValue(base, EntryType.EPOCH_CURRENT)),
        nextForward: valueAsHex(await getEntryValue(base, EntryType.EPOCH + '1')),
        reverse: await collectEntriesWithPrefix(base, EntryType.EPOCH_HASH)
    };
}

export async function applyWithEntryOverridesAndTrackEpochWrites(base, payload, overrides = new Map()) {
    const epochWrites = [];
    const cleanup = patchNextApply(base, overrides, epochWrites);

    try {
        await appendAndUpdate(base, payload);
    } finally {
        cleanup();
    }

    return epochWrites;
}

export async function assertEpochStateUnchanged(t, base, before, epochWrites) {
    const after = await captureEpochState(base);

    t.is(epochWrites.length, 0, 'rejected SET_EPOCH performs no epoch-state puts');
    t.is(after.current, before.current, 'current epoch pointer is unchanged');
    t.is(after.nextForward, before.nextForward, 'next epoch forward record is unchanged');
    t.is(
        JSON.stringify(after.reverse),
        JSON.stringify(before.reverse),
        'epoch reverse records are unchanged'
    );
}

export async function assertSubsequentValidEpochAppend(t, base, validPayload) {
    await appendAndUpdate(base, validPayload);

    t.is(await getCurrentEpoch(base), 1n, 'a subsequent valid SET_EPOCH still advances the epoch');

    const epochHash = await getEpochHash(base, 1n);
    t.ok(epochHash, 'the subsequent valid SET_EPOCH stores the forward record');

    const reverseEntry = epochHash
        ? await base.view.get(EntryType.EPOCH_HASH + epochHash.toString('hex'))
        : null;
    t.ok(reverseEntry, 'the subsequent valid SET_EPOCH stores the reverse record');
}

function patchNextApply(base, overrides, epochWrites) {
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
            patchBatchGet(batch, overrides);
            patchBatchPut(batch, epochWrites);
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

function patchBatchGet(batch, overrides) {
    const originalGet = batch.get?.bind(batch);
    if (typeof originalGet !== 'function') return;

    batch.get = async key => {
        const normalizedKey = normalizeKey(key);
        if (!overrides.has(normalizedKey)) {
            return originalGet(key);
        }

        const value = overrides.get(normalizedKey);
        return value === null ? null : { value };
    };
}

function patchBatchPut(batch, epochWrites) {
    const originalPut = batch.put?.bind(batch);
    if (typeof originalPut !== 'function') return;

    batch.put = async (key, value, ...args) => {
        const normalizedKey = normalizeKey(key);
        if (isEpochStateKey(normalizedKey)) {
            epochWrites.push(normalizedKey);
        }
        return originalPut(key, value, ...args);
    };
}

function isEpochStateKey(key) {
    return key === EntryType.EPOCH_CURRENT ||
        key.startsWith(EntryType.EPOCH) ||
        key.startsWith(EntryType.EPOCH_HASH);
}

async function getEntryValue(base, key) {
    const entry = await base.view.get(key);
    return entry?.value ?? null;
}

async function collectEntriesWithPrefix(base, prefix) {
    const entries = [];
    for await (const entry of base.view.createReadStream({
        gte: prefix,
        lt: `${prefix}\xff`
    })) {
        entries.push([normalizeKey(entry.key), valueAsHex(entry.value)]);
    }
    entries.sort(([left], [right]) => left.localeCompare(right));
    return entries;
}

function normalizeKey(key) {
    return b4a.isBuffer(key) ? key.toString() : key;
}

function valueAsHex(value) {
    return value === null ? null : value.toString('hex');
}
