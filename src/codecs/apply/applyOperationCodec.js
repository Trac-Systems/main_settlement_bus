import b4a from 'b4a';
import applyOperationsGenerated from './applyOperations.generated.cjs';

const { Operation, SetEpochOperation } = applyOperationsGenerated.apply.operations;

// Options for converting protobuf messages to plain objects, ensuring that bytes are returned as Buffers and enums as numbers.
const APPLY_TO_OBJECT_OPTIONS = Object.freeze({
    enums: Number,
    longs: Number,
    bytes: Buffer,
    defaults: false,
    arrays: true,
    oneofs: false
});

const normalizeDecodedApplyOperation = operation => {
    const payload = operation.tro || operation.rao || operation.bdo || operation.txo;
    if (!payload) return operation;

    payload.va ??= null;
    payload.vn ??= null;
    payload.vs ??= null;

    return operation;
}

export const encodeApplyOperation = (payload) => {
    const error = Operation.verify(payload);
    if (error) throw new Error(error);
    return b4a.from(Operation.encode(payload).finish());
}

const decodeApplyOperation = (payload) => {
    return normalizeDecodedApplyOperation(
        Operation.toObject(
            Operation.decode(payload),
            APPLY_TO_OBJECT_OPTIONS
        )
    );
}

/**
 * Safely encodes an operation using the generated apply Operation encoder.
 * If the encoding fails (e.g., due to an invalid payload), returns an empty Buffer.
 *
 * @param {*} payload - Any input that should conform to the `applyOperation` schema.
 * @returns {Buffer} - Encoded Buffer if successful, otherwise an empty Buffer (`b4a.alloc(0)`).
 */
export const safeEncodeApplyOperation = (payload) => {
    try {
        const result = encodeApplyOperation(payload);
        if (b4a.isBuffer(result)) return result
    } catch (error) {
        console.log("safeEncodeApplyOperation error:", error.message);
    }
    return b4a.alloc(0);
}

/**
 * Safely decodes a Buffer into an `Operation` object using the generated apply Operation decoder.
 * Returns `null` if decoding fails or the input is invalid.
 *
 * @param {Buffer} payload - A buffer containing encoded data.
 * @returns {Object|null} - Decoded `applyOperation` object on success, or `null` on failure.
 */
export const safeDecodeApplyOperation = (payload) => {
    try {
        if (!b4a.isBuffer(payload)) return null;
        return decodeApplyOperation(payload);
    } catch (error) {
        console.log(error);
    }
    return null;
}

export const unsafeDecodeApplyOperation= (payload) => {
    return decodeApplyOperation(payload);
}

export const unsafeEncodeApplyOperation = (payload) => {
    return encodeApplyOperation(payload);
}

export const normalizeIncomingMessage = (message) => {
    if (!message) return null;
    if (b4a.isBuffer(message)) {
        return decodeApplyOperation(message);
    }

    if (message.type === 'Buffer' && Array.isArray(message.data)) {
        const buffer = b4a.from(message.data);
        return decodeApplyOperation(buffer);
    }

    return null;
};

const getValidatedEpochProofPayload = (payload) => {
    const isObjectRecord = value => {
        return value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            !b4a.isBuffer(value);
    }

    if (!isObjectRecord(payload)) {
        throw new Error('EpochProof payload must be an object.');
    }

    const { pd, app } = payload;

    if (!b4a.isBuffer(pd) || pd.length === 0) {
        throw new Error('EpochProof pd must be a non-empty buffer.');
    }

    if (!Array.isArray(app)) {
        throw new Error('EpochProof app must be an array.');
    }

    for (const [index, approval] of app.entries()) {
        if (!b4a.isBuffer(approval) || approval.length === 0) {
            throw new Error(`EpochProof app ${index} must be a non-empty buffer.`);
        }
    }

    return { pd, app };
}

/**
 * Encodes an EpochProof using the SetEpochOperation wire format.
 *
 * @param {{pd: Buffer, app: Buffer[]}} payload - Epoch proof payload.
 * @returns {Buffer} Encoded EpochProof.
 */
export const encodeEpochProof = (payload) => {
    const setEpochPayload = getValidatedEpochProofPayload(payload);
    const error = SetEpochOperation.verify(setEpochPayload);
    if (error) throw new Error(error);
    return b4a.from(SetEpochOperation.encode(setEpochPayload).finish());
}

/**
 * Decodes an EpochProof encoded with the SetEpochOperation wire format.
 *
 * @param {Buffer} payload - Encoded EpochProof buffer.
 * @returns {{pd: Buffer, app: Buffer[]}} Decoded EpochProof.
 */
export const decodeEpochProof = (payload) => {
    return getValidatedEpochProofPayload(
        SetEpochOperation.toObject(
            SetEpochOperation.decode(payload),
            APPLY_TO_OBJECT_OPTIONS
        )
    );
}

/**
 * Safely encodes an EpochProof. Returns an empty buffer when the payload is invalid.
 *
 * @param {*} payload - Input expected to match EpochProof.
 * @returns {Buffer} Encoded EpochProof or an empty buffer.
 */
export const safeEncodeEpochProof = (payload) => {
    try {
        return encodeEpochProof(payload);
    } catch (error) {
        console.log("safeEncodeEpochProof error:", error.message);
    }

    return b4a.alloc(0);
}

/**
 * Safely decodes an EpochProof. Returns null when the input is invalid.
 *
 * @param {*} payload - Encoded EpochProof buffer.
 * @returns {{pd: Buffer, app: Buffer[]}|null} Decoded EpochProof or null.
 */
export const safeDecodeEpochProof = (payload) => {
    try {
        if (!b4a.isBuffer(payload)) return null;
        return decodeEpochProof(payload);
    } catch (error) {
        console.log("safeDecodeEpochProof error:", error.message);
    }

    return null;
}
