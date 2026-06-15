import b4a from 'b4a';
import consensusV1Generated from './consensusV1.generated.cjs';

const {
    ConsensusMessageHeader,
    ProofProposalApproval,
    ProofProposal
} = consensusV1Generated.consensus.v1;

// Options for converting protobuf messages to plain objects, ensuring that bytes are returned as Buffers and enums as numbers.
const CONSENSUS_TO_OBJECT_OPTIONS = Object.freeze({
    enums: Number,
    longs: Number,
    bytes: Buffer,
    defaults: false,
    arrays: true,
    oneofs: false
});

const encodeMessage = (Message, payload) => {
    const error = Message.verify(payload);
    if (error) throw new Error(error);
    return b4a.from(Message.encode(payload).finish());
}

const decodeMessage = (Message, payload) => {
    return Message.toObject(
        Message.decode(payload),
        CONSENSUS_TO_OBJECT_OPTIONS
    );
}

/**
 * Encodes a consensus v1 message header for regular consensus network messages.
 *
 * @param {Object} payload - ConsensusMessageHeader payload.
 * @returns {Buffer} Encoded consensus message.
 */
export const encodeConsensusMessage = (payload) => {
    return encodeMessage(ConsensusMessageHeader, payload);
}

/**
 * Decodes a consensus v1 message header from regular consensus network messages.
 *
 * @param {Buffer} payload - Encoded ConsensusMessageHeader buffer.
 * @returns {Object} Decoded consensus message.
 */
export const decodeConsensusMessage = (payload) => {
    return decodeMessage(ConsensusMessageHeader, payload);
}

/**
 * Encodes a ProofProposalApproval for regular consensus usage.
 *
 * @param {Object} payload - ProofProposalApproval payload.
 * @returns {Buffer} Encoded approval.
 */
export const encodeProofProposalApproval = (payload) => {
    return encodeMessage(ProofProposalApproval, payload);
}

/**
 * Decodes a ProofProposalApproval for regular consensus usage.
 *
 * @param {Buffer} payload - Encoded ProofProposalApproval buffer.
 * @returns {Object} Decoded approval.
 */
export const decodeProofProposalApproval = (payload) => {
    return decodeMessage(ProofProposalApproval, payload);
}

/**
 * Encodes a ProofProposal for regular consensus usage.
 *
 * @param {Object} payload - ProofProposalApproval payload.
 * @returns {Buffer} Encoded approval.
 */
export const encodeProofProposal = (payload) => {
    return encodeMessage(ProofProposal, payload);
}

/**
 * Decodes a ProofProposal for regular consensus usage.
 *
 * @param {Buffer} payload - Encoded ProofProposal buffer.
 * @returns {Object} Decoded .
 */
export const decodeProofProposal = (payload) => {
    return decodeMessage(ProofProposal, payload);
}

/**
 * Safely encodes a ProofProposalApproval for apply-function validation paths.
 * Returns an empty buffer when the approval payload is invalid.
 *
 * @param {*} payload - Input expected to match ProofProposalApproval.
 * @returns {Buffer} Encoded approval or an empty buffer.
 */
export const safeEncodeProofProposalApproval = (payload) => {
    try {
        return encodeProofProposalApproval(payload);
    } catch (error) {
        console.log("safeEncodeProofProposalApproval error:", error.message);
    }

    return b4a.alloc(0);
}

/**
 * Safely decodes a ProofProposalApproval for apply-function validation paths.
 * Returns null when the input is not a buffer or cannot be decoded.
 *
 * @param {*} payload - Encoded ProofProposalApproval buffer.
 * @returns {Object|null} Decoded approval or null.
 */
export const safeDecodeProofProposalApproval = (payload) => {
    try {
        if (!b4a.isBuffer(payload)) return null;
        return decodeProofProposalApproval(payload);
    } catch (error) {
        console.log("safeDecodeProofProposalApproval error:", error.message);
    }
    return null;
}

/**
 * Safely encodes a ProofProposal for apply-function validation paths.
 * Returns an empty buffer when the payload is invalid.
 *
 * @param {*} payload - Input expected to match ProofProposal.
 * @returns {Buffer} Encoded or an empty buffer.
 */
export const safeEncodeProofProposal = (payload) => {
    try {
        return encodeProofProposal(payload);
    } catch (error) {
        console.log("safeEncodeProofProposal error:", error.message);
    }

    return b4a.alloc(0);
}

/**
 * Safely decodes a ProofProposal for apply-function validation paths.
 * Returns null when the input is not a buffer or cannot be decoded.
 *
 * @param {*} payload - Encoded ProofProposal buffer.
 * @returns {Object|null} Decoded or null.
 */
export const safeDecodeProofProposal = (payload) => {
    try {
        if (!b4a.isBuffer(payload)) return null;
        return decodeProofProposal(payload);
    } catch (error) {
        console.log("safeDecodeProofProposal error:", error.message);
    }
    return null;
}
