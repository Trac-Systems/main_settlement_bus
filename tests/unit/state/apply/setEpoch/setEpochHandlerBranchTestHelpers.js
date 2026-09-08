import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { CustomEventType, EntryType } from '../../../../../src/utils/constants.js';
import {
    safeDecodeEpochProofV1,
    safeEncodeEpochProofV1
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import {
    appendAndUpdate,
    decodeSetEpochPayload
} from './setEpochScenarioHelpers.js';

export async function snapshotEpochLedger(base, targetEpoch = 1n) {
    const currentEpochEntry = await base.view.get(EntryType.EPOCH_CURRENT);
    const targetEpochEntry = await base.view.get(EntryType.EPOCH + targetEpoch.toString());
    const reverseEntries = [];

    for await (const entry of base.view.createReadStream({
        gte: EntryType.EPOCH_HASH,
        lt: `${EntryType.EPOCH_HASH}\xff`
    })) {
        reverseEntries.push([
            normalizeKey(entry.key),
            entry.value.toString('hex')
        ]);
    }

    reverseEntries.sort(([left], [right]) => left.localeCompare(right));
    return {
        currentEpoch: currentEpochEntry?.value.toString('hex') ?? null,
        targetEpoch: targetEpochEntry?.value.toString('hex') ?? null,
        reverseEntries
    };
}

export async function appendCapturingEpochEvents(context, payload) {
    const events = [];
    const listener = event => events.push(event);
    context.adminBootstrap.state.on(CustomEventType.EPOCH_CREATED, listener);

    try {
        await appendAndUpdate(context.adminBootstrap.base, payload);
    } finally {
        context.adminBootstrap.state.off(CustomEventType.EPOCH_CREATED, listener);
    }

    return events;
}

export async function applyRejectedEpoch(t, context, payload, label) {
    const base = context.adminBootstrap.base;
    const before = await snapshotEpochLedger(base);
    const events = await appendCapturingEpochEvents(context, payload);
    const after = await snapshotEpochLedger(base);

    t.alike(after, before, `${label}: epoch pointer and forward/reverse records are unchanged`);
    t.is(events.length, 0, `${label}: EPOCH_CREATED is not emitted`);
}

export async function expectedEpochWrites(payload, epoch = 1n) {
    const operation = decodeSetEpochPayload(payload);
    const epochProof = safeDecodeEpochProofV1(operation.seo.data);
    if (epochProof === null) {
        throw new Error('SET_EPOCH test fixture contains invalid epoch data.');
    }
    const encodedProof = safeEncodeEpochProofV1(epochProof);
    const proofHash = await tracCryptoApi.hash.blake3Safe(encodedProof);
    const currentEpoch = b4a.alloc(8);
    currentEpoch.writeBigUInt64BE(epoch);

    return {
        currentEpoch,
        forwardKey: EntryType.EPOCH + epoch.toString(),
        proofHash,
        reverseKey: EntryType.EPOCH_HASH + proofHash.toString('hex'),
        encodedProof
    };
}

export async function snapshotView(base) {
    const entries = new Map();
    for await (const entry of base.view.createReadStream()) {
        entries.set(normalizeKey(entry.key), entry.value.toString('hex'));
    }
    return entries;
}

export function changedViewKeys(before, after) {
    const keys = new Set([...before.keys(), ...after.keys()]);
    return [...keys]
        .filter(key => before.get(key) !== after.get(key))
        .sort();
}

export async function appendWithEpochProofEncodingFailure(context, payload) {
    const { encodedProof } = await expectedEpochWrites(payload);
    const originalFrom = b4a.from;
    let injected = false;

    b4a.from = (value, ...args) => {
        const encoded = originalFrom(value, ...args);
        if (!injected && b4a.equals(encoded, encodedProof)) {
            injected = true;
            throw new Error('injected SET_EPOCH proof encoding failure');
        }
        return encoded;
    };

    try {
        const events = await appendCapturingEpochEvents(context, payload);
        return { events, injected };
    } finally {
        b4a.from = originalFrom;
    }
}

export async function appendWithEpochProofHashFailure(context, payload) {
    const { encodedProof } = await expectedEpochWrites(payload);
    const originalBlake3Safe = tracCryptoApi.hash.blake3Safe;
    let injected = false;

    tracCryptoApi.hash.blake3Safe = async value => {
        if (!injected && b4a.equals(value, encodedProof)) {
            injected = true;
            return b4a.alloc(0);
        }
        return originalBlake3Safe(value);
    };

    try {
        const events = await appendCapturingEpochEvents(context, payload);
        return { events, injected };
    } finally {
        tracCryptoApi.hash.blake3Safe = originalBlake3Safe;
    }
}

function normalizeKey(key) {
    return b4a.isBuffer(key) ? key.toString() : key;
}
