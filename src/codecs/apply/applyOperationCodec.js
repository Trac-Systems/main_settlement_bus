import b4a from 'b4a';
import applyOperationsGenerated from './applyOperations.generated.cjs';
import _ from 'lodash';
const { Operation, SetEpochOperation, ConsensusControlOperation } = applyOperationsGenerated.apply.operations;

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

const validateEpochProofV1 = (payload) => {
    if (!_.isPlainObject(payload)) {
        throw new Error('EpochProofV1 payload must be an object.');
    }

    const { pd, app } = payload;

    if (!b4a.isBuffer(pd) || pd.length === 0) {
        throw new Error('EpochProofV1 pd must be a non-empty buffer.');
    }

    if (!Array.isArray(app)) {
        throw new Error('EpochProofV1 app must be an array.');
    }

    for (const [index, approval] of app.entries()) {
        if (!b4a.isBuffer(approval) || approval.length === 0) {
            throw new Error(`EpochProofV1 app ${index} must be a non-empty buffer.`);
        }
    }

    return { pd, app };
}

/**
 * Encodes an EpochProofV1 using the SetEpochOperation wire format.
 *
 * @param {{pd: Buffer, app: Buffer[]}} payload - Epoch proof payload.
 * @returns {Buffer} Encoded EpochProofV1.
 */
export const encodeEpochProofV1 = (payload) => {
    const setEpochPayload = validateEpochProofV1(payload);
    const error = SetEpochOperation.verify(setEpochPayload);
    if (error) throw new Error(error);
    return b4a.from(SetEpochOperation.encode(setEpochPayload).finish());
}

/**
 * Decodes an EpochProofV1 encoded with the SetEpochOperation wire format.
 *
 * @param {Buffer} payload - Encoded EpochProofV1 buffer.
 * @returns {{pd: Buffer, app: Buffer[]}} Decoded EpochProofV1.
 */
export const decodeEpochProofV1 = (payload) => {
    return validateEpochProofV1(
        SetEpochOperation.toObject(
            SetEpochOperation.decode(payload),
            APPLY_TO_OBJECT_OPTIONS
        )
    );
}

/**
 * Safely encodes an EpochProofV1. Returns an empty buffer when the payload is invalid.
 *
 * @param {*} payload - Input expected to match EpochProofV1.
 * @returns {Buffer} Encoded EpochProofV1 or an empty buffer.
 */
export const safeEncodeEpochProofV1 = (payload) => {
    try {
        return encodeEpochProofV1(payload);
    } catch (error) {
        console.log("safeEncodeEpochProofV1 error:", error.message);
    }

    return b4a.alloc(0);
}

/**
 * Safely decodes an EpochProofV1. Returns null when the input is invalid.
 *
 * @param {*} payload - Encoded EpochProofV1 buffer.
 * @returns {{pd: Buffer, app: Buffer[]}|null} Decoded EpochProofV1 or null.
 */
export const safeDecodeEpochProofV1 = (payload) => {
    try {
        if (!b4a.isBuffer(payload)) return null;
        return decodeEpochProofV1(payload);
    } catch (error) {
        console.log("safeDecodeEpochProofV1 error:", error.message);
    }

    return null;
}

const getValidatedConsensusConfigPayload = (payload) => {
    if (!_.isPlainObject(payload)) {
        throw new Error('ConsensusConfig payload must be an object.');
    }

    const { sv, cd} = payload;

    if (!b4a.isBuffer(sv) || sv.length !== 1) {
        throw new Error('Schema version must be a one-byte buffer.');
    }

    if (!b4a.isBuffer(cd)) {
        throw new Error('ConsensusConfig configData must be a buffer.');
    }

    return { sv, cd };
}

/**
 * Encodes a ConsensusConfig using the ConsensusControlOperation wire format.
 *
 * @param {{sv: Buffer, cd: Buffer}} payload - Consensus config payload.
 * @returns {Buffer} Encoded ConsensusConfig.
 */
export const encodeConsensusConfig = (payload) => {
    const consensusConfigPayload = getValidatedConsensusConfigPayload(payload);
    const consensusControlPayload = { cc: consensusConfigPayload };
    const error = ConsensusControlOperation.verify(consensusControlPayload);
    if (error) throw new Error(error);
    return b4a.from(ConsensusControlOperation.encode(consensusControlPayload).finish());
}

/**
 * Decodes a ConsensusConfig encoded with the ConsensusControlOperation wire format.
 *
 * @param {Buffer} payload - Encoded ConsensusConfig buffer.
 * @returns {{sv: Buffer, cd: Buffer}} Decoded ConsensusConfig.
 */
export const decodeConsensusConfig = (payload) => {
    if (!b4a.isBuffer(payload)) {
        throw new Error('Encoded ConsensusConfig must be a buffer.');
    }

    const consensusControlPayload = ConsensusControlOperation.toObject(
        ConsensusControlOperation.decode(payload),
        APPLY_TO_OBJECT_OPTIONS
    );

    return getValidatedConsensusConfigPayload(consensusControlPayload.cc);
}

/**
 * Safely encodes a ConsensusConfig. Returns an empty buffer when the payload is invalid.
 *
 * @param {*} payload - Input expected to match ConsensusConfig.
 * @returns {Buffer} Encoded ConsensusConfig or an empty buffer.
 */
export const safeEncodeConsensusConfig = (payload) => {
    try {
        return encodeConsensusConfig(payload);
    } catch {
        return b4a.alloc(0);
    }
}

/**
 * Safely decodes a ConsensusConfig. Returns null when the input is invalid.
 *
 * @param {*} payload - Encoded ConsensusConfig buffer.
 * @returns {{sv: Buffer, cd: Buffer}|null} Decoded ConsensusConfig or null.
 */
export const safeDecodeConsensusConfig = (payload) => {
    try {
        return decodeConsensusConfig(payload);
    } catch {
        return null;
    }
}
