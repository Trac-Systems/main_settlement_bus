export const EpochAppenderSelectionErrorCode = Object.freeze({
    SELECTION_STATE_INVALID: 'SELECTION_STATE_INVALID',
    RESERVATION_INVALID: 'RESERVATION_INVALID',
    PUBLICATION_MARKER_INVALID: 'PUBLICATION_MARKER_INVALID',
    PERSISTENCE_FAILED: 'PERSISTENCE_FAILED',
    SELECTOR_CLOSED: 'SELECTOR_CLOSED',
    SELECTOR_UNAVAILABLE: 'SELECTOR_UNAVAILABLE',
    REQUEST_STALE: 'REQUEST_STALE',
    REQUEST_CANCELLED: 'REQUEST_CANCELLED',
    ELECTION_SUPERSEDED: 'ELECTION_SUPERSEDED',
    ELECTION_BUSY: 'ELECTION_BUSY',
    ALREADY_WAITING: 'ALREADY_WAITING',
    PUBLICATION_UNRESOLVED: 'PUBLICATION_UNRESOLVED',
    REPLIES_INCOMPLETE: 'REPLIES_INCOMPLETE',
    REPLY_TIMEOUT: 'REPLY_TIMEOUT',
    CONTEXT_CHANGED: 'CONTEXT_CHANGED',
    NOT_IN_COHORT: 'NOT_IN_COHORT',
    UNEXPECTED_PEER: 'UNEXPECTED_PEER',
    LOGICAL_COUNTER_INVALID: 'LOGICAL_COUNTER_INVALID',
    LOGICAL_CLOCK_EXHAUSTED: 'LOGICAL_CLOCK_EXHAUSTED',
    SIGNED_CHECKPOINT_UNAVAILABLE: 'SIGNED_CHECKPOINT_UNAVAILABLE',
    SIGNED_VIEW_INVALID: 'SIGNED_VIEW_INVALID',
    EPOCH_NOT_INITIALIZED: 'EPOCH_NOT_INITIALIZED',
    PARENT_MISSING: 'PARENT_MISSING',
    MEMBER_IDENTITY_MISSING: 'MEMBER_IDENTITY_MISSING',
    MEMBERSHIP_INVALID: 'MEMBERSHIP_INVALID',
    CONFIG_MISSING: 'CONFIG_MISSING',
});

/** Local coordination errors are mapped to protocol result codes at the network boundary. */
export class EpochAppenderSelectionError extends Error {
    /**
     * @param {string} code One of EpochAppenderSelectionErrorCode.
     * @param {string} message Human-readable diagnostic; never used for control flow.
     * @param {object} [options]
     * @param {object} [options.details] Request identity and other diagnostic context.
     * @param {Error} [options.cause] Original storage, network or crypto failure.
     */
    constructor(code, message, { details, cause } = {}) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        if (details !== undefined) {
            this.details = details;
        }
        if (cause !== undefined) {
            this.cause = cause;
        }
    }
}
