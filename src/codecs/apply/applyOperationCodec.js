import b4a from 'b4a';
import applyOperationsGenerated from './applyOperations.generated.cjs';
import _ from 'lodash';
const { Operation, SetEpochOperation, HtlcLockData, ConsensusControlOperation } = applyOperationsGenerated.apply.operations;

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
    const payload = operation.tro || operation.rao || operation.bdo || operation.txo || operation.hlo;
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
    if (!_.isPlainObject(payload)) {
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

const getValidatedHtlcLockDataPayload = (payload) => {
    if (!_.isPlainObject(payload)) {
        throw new Error('HtlcLockData payload must be an object.');
    }

    const { hl, ra, ca, ee } = payload;
    for (const [name, value] of Object.entries({ hl, ra, ca, ee })) {
        if (!b4a.isBuffer(value) || value.length === 0) {
            throw new Error(`HtlcLockData ${name} must be a non-empty buffer.`);
        }
    }

    return { hl, ra, ca, ee };
}

/**
 * Encodes the HTLC lock data using the HtlcLockData wire format.
 * The outer HtlcLockOperation carries the result as opaque ld bytes, matching seo.pd.
 *
 * @param {{hl: Buffer, ra: Buffer, ca: Buffer, ee: Buffer}} payload
 * @returns {Buffer} Encoded HTLC lock data.
 */
export const encodeHtlcLockData = (payload) => {
    const htlcLockData = getValidatedHtlcLockDataPayload(payload);
    const error = HtlcLockData.verify(htlcLockData);
    if (error) throw new Error(error);
    return b4a.from(HtlcLockData.encode(htlcLockData).finish());
}

/**
 * Decodes HTLC lock data encoded with the HtlcLockData wire format.
 *
 * @param {Buffer} payload
 * @returns {{hl: Buffer, ra: Buffer, ca: Buffer, ee: Buffer}}
 */
export const decodeHtlcLockData = (payload) => {
    if (!b4a.isBuffer(payload)) {
        throw new Error('Encoded HtlcLockData must be a buffer.');
    }

    return getValidatedHtlcLockDataPayload(
        HtlcLockData.toObject(
            HtlcLockData.decode(payload),
            APPLY_TO_OBJECT_OPTIONS
        )
    );
}

export const safeEncodeHtlcLockData = (payload) => {
    try {
        return encodeHtlcLockData(payload);
    } catch (error) {
        console.log("safeEncodeHtlcLockData error:", error.message);
    }

    return b4a.alloc(0);
}

export const safeDecodeHtlcLockData = (payload) => {
    try {
        return decodeHtlcLockData(payload);
    } catch (error) {
        console.log("safeDecodeHtlcLockData error:", error.message);
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
