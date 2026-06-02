import b4a from 'b4a';
import applyOperationsGenerated from './applyOperations.generated.cjs';

const { Operation } = applyOperationsGenerated.apply.operations;

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

const encodeApplyOperation = (payload) => {
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
