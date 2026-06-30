/**
 * @typedef {object} ConsensusEpochProofProposalBaseEventContext
 * @property {object} message Decoded consensus v1 message.
 * @property {object} connection Peer connection context.
 * @property {string} sessionId Consensus message session ID.
 * @property {Buffer|string} [remotePublicKey] Peer public key from the connection.
 * @property {string} [remotePublicKeyHex] Peer public key normalized as hex.
 */

/**
 * @typedef {ConsensusEpochProofProposalBaseEventContext & {
 *   proofProposal?: object,
 *   resultCode?: number,
 *   error?: Error
 * }} ConsensusEpochProofProposalRequestEventContext
 */

/**
 * @typedef {ConsensusEpochProofProposalBaseEventContext & {
 *   pendingRequestEntry?: object,
 *   proofProposal?: object,
 *   approval?: object,
 *   resultCode?: number,
 *   error?: Error
 * }} ConsensusEpochProofProposalApprovalEventContext
 */

class ConsensusEpochProofProposalEventHandler {
    /**
     * Placeholder for handling receipt of an epoch proof proposal request.
     * @param {ConsensusEpochProofProposalRequestEventContext} _context
     */
    async onEpochProposalReceived(_context) {
        // TODO: Handle epoch proof proposal received event.
    }

    /**
     * Placeholder for handling successful epoch proof proposal validation.
     * @param {ConsensusEpochProofProposalRequestEventContext} _context
     */
    async onEpochProposalValidationSuccess(_context) {
        // TODO: Handle epoch proof proposal validation success event.
    }

    /**
     * Placeholder for handling failed epoch proof proposal validation.
     * @param {ConsensusEpochProofProposalRequestEventContext} _context
     */
    async onEpochProposalValidationFailure(_context) {
        // TODO: Handle epoch proof proposal validation failure event.
    }

    /**
     * Placeholder for handling receipt of an epoch proof proposal approval response.
     * @param {ConsensusEpochProofProposalApprovalEventContext} _context
     */
    async onApprovalResponseReceived(_context) {
        // TODO: Handle approval response received event.
    }

    /**
     * Placeholder for handling successful epoch proof proposal approval validation.
     * @param {ConsensusEpochProofProposalApprovalEventContext} _context
     */
    async onApprovalResponseSuccess(_context) {
        // TODO: Handle approval response success event.
    }

    /**
     * Placeholder for handling failed epoch proof proposal approval validation.
     * @param {ConsensusEpochProofProposalApprovalEventContext} _context
     */
    async onApprovalResponseFailure(_context) {
        // TODO: Handle approval response failure event.
    }

    /**
     * Placeholder for handling approval responses without a matching pending request.
     * @param {ConsensusEpochProofProposalApprovalEventContext} _context
     */
    async onApprovalResponseWithoutPendingRequest(_context) {
        // TODO: Handle approval response without pending request event.
    }
}

export default ConsensusEpochProofProposalEventHandler;
