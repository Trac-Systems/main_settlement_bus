import test from 'brittle';
import b4a from 'b4a';

import applyOperationsGenerated from '../../../src/codecs/apply/applyOperations.generated.cjs';
import {
    decodeEpochProof,
    encodeEpochProof,
    normalizeIncomingMessage,
    safeDecodeEpochProof,
    safeDecodeApplyOperation,
    safeEncodeEpochProof,
    safeEncodeApplyOperation,
} from '../../../src/codecs/apply/applyOperationCodec.js';
import fixtures from '../../fixtures/applyOperation.fixtures.js';

const { Operation, SetEpochOperation } = applyOperationsGenerated.apply.operations;

const APPLY_TO_OBJECT_OPTIONS = Object.freeze({
    enums: Number,
    longs: Number,
    bytes: Buffer,
    defaults: false,
    arrays: true,
    oneofs: false
});

const applyPayloads = new Map([
    ['txComplete', fixtures.validTransactionOperation],
    ['txPartial', fixtures.validPartialTransactionOperation],
    ['addIndexer', fixtures.validAddIndexer],
    ['removeIndexer', fixtures.validRemoveIndexer],
    ['appendWhitelist', fixtures.validAppendWhitelist],
    ['banValidator', fixtures.validBanValidator],
    ['addAdmin', fixtures.validAddAdmin],
    ['addWriterComplete', fixtures.validCompleteAddWriter],
    ['addWriterPartial', fixtures.validPartialAddWriter],
    ['removeWriterComplete', fixtures.validCompleteRemoveWriter],
    ['removeWriterPartial', fixtures.validPartialRemoveWriter],
    ['adminRecoveryComplete', fixtures.validCompleteAdminRecovery],
    ['adminRecoveryPartial', fixtures.validPartialAdminRecovery],
    ['bootstrapDeploymentComplete', fixtures.validCompleteBootstrapDeployment],
    ['bootstrapDeploymentPartial', fixtures.validPartialBootstrapDeployment],
    ['transferComplete', fixtures.validTransferOperation],
    ['transferPartial', fixtures.validPartialTransferOperation],
    ['balanceInitialization', fixtures.validBalanceInitOperation],
    ['disableInitialization', fixtures.validDisableInitialization],
    ['setEpoch', fixtures.validSetEpochOperation],
]);

const APPLY_PAYLOAD_KEYS = Object.freeze(['txo', 'tro', 'aco', 'cao', 'rao', 'bdo', 'bio', 'seo']);

const formatInvalidPayload = payload => {
    if (typeof payload === 'bigint') return `${payload}n`;

    try {
        const value = JSON.stringify(payload);
        return value.length > 128 ? `(payload size: ${value.length} bytes)` : value;
    } catch {
        const value = String(payload);
        return value.length > 128 ? `(payload size: ${value.length} bytes)` : value;
    }
}

const withConsoleLogMuted = fn => {
    const originalLog = console.log;
    console.log = () => {};
    try {
        return fn();
    } finally {
        console.log = originalLog;
    }
}

const normalizeDecodedApplyOperation = operation => {
    const payload = operation.tro || operation.rao || operation.bdo || operation.txo;
    if (!payload) return operation;

    payload.va ??= null;
    payload.vn ??= null;
    payload.vs ??= null;

    return operation;
}

const encodeApplyOperation = payload => {
    const error = Operation.verify(payload);
    if (error) throw new Error(error);
    return b4a.from(Operation.encode(payload).finish());
}

const decodeApplyOperation = payload => {
    return normalizeDecodedApplyOperation(
        Operation.toObject(
            Operation.decode(payload),
            APPLY_TO_OBJECT_OPTIONS
        )
    );
}

const getApplyPayloadKey = operation => {
    return APPLY_PAYLOAD_KEYS.find(key => operation[key]);
}

const shuffleObject = (obj) => {
    const keys = Object.keys(obj);
    for (let i = keys.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [keys[i], keys[j]] = [keys[j], keys[i]];
    }

    const shuffled = {};
    for (const key of keys) shuffled[key] = obj[key];
    return shuffled;
}

const getValidEpochProof = () => ({
    pd: b4a.from(fixtures.validSetEpochOperation.seo.pd),
    app: fixtures.validSetEpochOperation.seo.app.map(approval => b4a.from(approval))
});

test('Apply generated codec encodes and decodes operation payloads', t => {
    for (const [key, payload] of applyPayloads) {
        const encoded = encodeApplyOperation(payload);
        const decoded = decodeApplyOperation(encoded);

        t.alike(decoded, payload, `Payload ${key} encodes and decodes correctly`);
    }
});

test('Apply generated codec throws when multiple oneof fields are set', t => {
    try {
        encodeApplyOperation(fixtures.invalidPayloadWithMultipleOneOfKeys);
        t.fail('encode() should throw due to multiple oneof fields set');
    } catch (err) {
        t.ok(
            err instanceof Error && err.message.includes('multiple values'),
            'Should throw an error about multiple oneof fields'
        );
    }
});

test('Apply generated codec decode throws on buffer with unknown wire type', t => {
    const bufWithWire7 = b4a.from([0x0F]);

    try {
        decodeApplyOperation(bufWithWire7);
        t.fail('Expected decode to throw on unknown wire type');
    } catch (err) {
        t.ok(err instanceof Error, 'Should throw an error instance for unknown wire type');
    }
});

test('Apply generated codec encode/decode is order-independent for all operation types', t => {
    for (const [key, payload] of applyPayloads) {
        const payloadKey = getApplyPayloadKey(payload);
        const shuffledPayload = {
            ...payload,
            [payloadKey]: shuffleObject(payload[payloadKey])
        };

        const encoded = encodeApplyOperation(shuffledPayload);
        const decoded = decodeApplyOperation(encoded);

        t.alike(decoded, payload, `Payload ${key} encodes and decodes correctly with shuffled fields`);
    }
});

test('safeEncodeApplyOperation returns an empty buffer on encode errors', t => {
    withConsoleLogMuted(() => {
        const encoded = safeEncodeApplyOperation(fixtures.invalidPayloadWithMultipleOneOfKeys);
        t.ok(b4a.isBuffer(encoded));
        t.is(encoded.length, 0);
    });
});

test('safeEncodeApplyOperation and safeDecodeApplyOperation roundtrip operation payloads', t => {
    for (const [key, payload] of applyPayloads) {
        const encoded = safeEncodeApplyOperation(payload);
        const decoded = safeDecodeApplyOperation(encoded);

        t.ok(b4a.isBuffer(encoded) && encoded.length > 0, `${key} encodes to a non-empty buffer`);
        t.alike(decoded, payload, `${key} decodes back correctly`);
    }
});

test('safeEncodeApplyOperation handles invalid payloads by returning a buffer', t => {
    withConsoleLogMuted(() => {
        for (const invalidPayload of fixtures.invalidPayloads) {
            const encoded = safeEncodeApplyOperation(invalidPayload);

            t.ok(b4a.isBuffer(encoded), `payload: ${formatInvalidPayload(invalidPayload)}`);
        }
    });
});

test('safeDecodeApplyOperation returns null or object for invalid payloads', t => {
    withConsoleLogMuted(() => {
        for (const invalidPayload of fixtures.invalidPayloads) {
            const decoded = safeDecodeApplyOperation(invalidPayload);

            t.ok(decoded === null || typeof decoded === 'object', `payload: ${formatInvalidPayload(invalidPayload)}`);
        }
    });
});

test('safeDecodeApplyOperation returns null for invalid input', t => {
    withConsoleLogMuted(() => {
        t.is(safeDecodeApplyOperation(null), null);
        t.is(safeDecodeApplyOperation({}), null);
        t.is(safeDecodeApplyOperation('not-a-buffer'), null);
        t.is(safeDecodeApplyOperation(b4a.from([0x0F])), null);
    });
});

test('normalizeIncomingMessage decodes buffers and JSON buffers', t => {
    const payload = fixtures.validTransactionOperation;
    const encoded = encodeApplyOperation(payload);

    const decodedFromBuffer = normalizeIncomingMessage(encoded);
    t.alike(decodedFromBuffer, payload);

    const decodedFromJsonBuffer = normalizeIncomingMessage({ type: 'Buffer', data: Array.from(encoded) });
    t.alike(decodedFromJsonBuffer, payload);

    t.is(normalizeIncomingMessage(null), null);
    t.is(normalizeIncomingMessage({ type: 'nope', data: [] }), null);
});

test('EpochProof codec encodes and decodes SetEpochOperation wire payload', t => {
    const epochProof = getValidEpochProof();
    const encoded = encodeEpochProof(epochProof);
    const decodedWirePayload = SetEpochOperation.toObject(
        SetEpochOperation.decode(encoded),
        APPLY_TO_OBJECT_OPTIONS
    );
    const decodedEpochProof = decodeEpochProof(encoded);

    t.ok(b4a.isBuffer(encoded) && encoded.length > 0);
    t.alike(decodedWirePayload, epochProof);
    t.alike(decodedEpochProof, epochProof);
});

test('EpochProof codec rejects non-record payloads', t => {
    t.exception(
        () => encodeEpochProof([]),
        /EpochProof payload must be an object/
    );

    t.exception(
        () => encodeEpochProof(b4a.from([0x01])),
        /EpochProof payload must be an object/
    );
});

test('EpochProof safe helpers encode and decode valid payloads', t => {
    const epochProof = getValidEpochProof();
    const encoded = safeEncodeEpochProof(epochProof);
    const decoded = safeDecodeEpochProof(encoded);

    t.ok(b4a.isBuffer(encoded) && encoded.length > 0);
    t.alike(decoded, epochProof);
});

test('EpochProof safe helpers handle invalid payloads', t => {
    withConsoleLogMuted(() => {
        const proofData = b4a.from(fixtures.validSetEpochOperation.seo.pd);

        t.is(safeEncodeEpochProof(null).length, 0);
        t.is(safeEncodeEpochProof({ pd: proofData, app: null }).length, 0);
        t.is(safeEncodeEpochProof({ pd: b4a.alloc(0), app: [] }).length, 0);
        t.is(safeEncodeEpochProof({ pd: proofData, app: [b4a.alloc(0)] }).length, 0);
        t.is(safeEncodeEpochProof({ data: proofData, approvals: [] }).length, 0);

        t.is(safeDecodeEpochProof(null), null);
        t.is(safeDecodeEpochProof({}), null);
        t.is(safeDecodeEpochProof('not-a-buffer'), null);
        t.is(safeDecodeEpochProof(b4a.alloc(0)), null);
        t.is(safeDecodeEpochProof(b4a.from([0x0F])), null);
    });
});
