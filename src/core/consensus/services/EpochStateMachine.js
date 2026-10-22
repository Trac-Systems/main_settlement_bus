/**
 * Stores the data used by one epoch round. Each approval attempt gets a new collection. Late callbacks
 * must check that their collection is still current and open.
 *
 * @typedef {object} EpochRoundContext
 * @property {function(number): Promise<boolean>} finishAndScheduleNextRound Closes this round and schedules the next one.
 * @property {bigint} [currentEpoch] Signed parent epoch used to build the proof.
 * @property {Buffer} [currentEpochHash] Hash of that parent record.
 * @property {number} [vdfDifficulty] Signed VDF iteration count.
 * @property {number} [vdfDiscriminantSize] Signed discriminant size in bits.
 * @property {import('./EpochCoordinatorOperations.js').EpochVdfProof} [vdf] Local proof that can be reused while the parent epoch stays the same.
 * @property {object} [proofProposalMessage] Signed message containing the local proof.
 * @property {object} [proofProposal] Proof proposal fields from the signed message.
 * @property {Set<string>} [indexerKeys] Writer keys captured for this attempt, encoded as hex.
 * @property {number} [requiredProofSignatures] Proof quorum including the proposer's signature.
 * @property {Array<{key: Buffer}>} [approvers] Other indexers that can sign this proof.
 * @property {import('./EpochCoordinatorOperations.js').EpochApprovalCollection|null} [approvalCollection] This attempt's proof approvals.
 * @property {Buffer} [setEpochPayload] Complete SET_EPOCH operation bytes.
 * @property {boolean} [remoteProposalReceived] A validated proposal matches this epoch and parent.
 * @property {boolean} [appendElectionRetry] Use the shorter election backoff for the next retry.
 */
import { StateMachine } from "../../../utils/StateMachine.js";

export const EPOCH_STATES = Object.freeze({
    LOAD_EPOCH_CONTEXT: "LOAD_EPOCH_CONTEXT",
    INITIALIZE_VDF: "INITIALIZE_VDF",
    BUILD_AND_SIGN_PROOF_PROPOSAL: "BUILD_AND_SIGN_PROOF_PROPOSAL",
    SEND_PROPOSAL_TO_INDEXERS: "SEND_PROPOSAL_TO_INDEXERS",
    COLLECT_APPROVALS: "COLLECT_APPROVALS",
    QUORUM_DECISION: "QUORUM_DECISION",
    BUILD_SET_EPOCH: "BUILD_SET_EPOCH",
    WAIT_FOR_APPEND_REPLIES: "WAIT_FOR_APPEND_REPLIES",
    REFRESH_SIGNED_STATE_BEFORE_APPEND: "REFRESH_SIGNED_STATE_BEFORE_APPEND",
    APPEND_SET_EPOCH: "APPEND_SET_EPOCH",
    WAIT_FOR_APPEND_OUTCOME: "WAIT_FOR_APPEND_OUTCOME",
    REFRESH_SIGNED_STATE: "REFRESH_SIGNED_STATE",
    BACKOFF: "BACKOFF",
    RELOAD_SIGNED_CONTEXT: "RELOAD_SIGNED_CONTEXT",
});

export const EPOCH_EVENTS = Object.freeze({
    START: "START",
    LOCAL_PROOF_READY: "LOCAL_PROOF_READY",
    PROPOSAL_BUILT: "PROPOSAL_BUILT",
    EXTERNAL_APPROVALS_REQUIRED: "EXTERNAL_APPROVALS_REQUIRED",
    EXTERNAL_APPROVALS_NOT_REQUIRED: "EXTERNAL_APPROVALS_NOT_REQUIRED",
    PROPOSAL_BROADCAST: "PROPOSAL_BROADCAST",
    QUORUM_REACHED: "QUORUM_REACHED",
    APPROVAL_COLLECTION_FAILED: "APPROVAL_COLLECTION_FAILED",
    SET_EPOCH_BUILT: "SET_EPOCH_BUILT",
    APPEND_REPLIES_COLLECTED: "APPEND_REPLIES_COLLECTED",
    APPEND_REPLY_COLLECTION_FAILED: "APPEND_REPLY_COLLECTION_FAILED",
    APPEND_STARTED: "APPEND_STARTED",
    APPEND_REJECTED: "APPEND_REJECTED",
    APPENDER_SELECTION_EXPIRED: "APPENDER_SELECTION_EXPIRED",
    TARGET_EPOCH_ABSENT: "TARGET_EPOCH_ABSENT",
    TARGET_EPOCH_ALREADY_SIGNED: "TARGET_EPOCH_ALREADY_SIGNED",
    TARGET_EPOCH_CONFIRMED: "TARGET_EPOCH_CONFIRMED",
    BACKOFF_ELAPSED: "BACKOFF_ELAPSED",
    EPOCH_UNCHANGED_WITHOUT_LOCAL_PROOF: "EPOCH_UNCHANGED_WITHOUT_LOCAL_PROOF",
    EPOCH_UNCHANGED_WITH_LOCAL_PROOF: "EPOCH_UNCHANGED_WITH_LOCAL_PROOF",
    NEW_EPOCH_DISCOVERED: "NEW_EPOCH_DISCOVERED",
    SOLVER_FAILURE: "SOLVER FAILURE",
    INDEXERS_CHANGED: "INDEXERS_CHANGED",
});

const TRANSITIONS = {
    [EPOCH_STATES.LOAD_EPOCH_CONTEXT]: Object.freeze({
        [EPOCH_EVENTS.START]: EPOCH_STATES.INITIALIZE_VDF,
    }),
    [EPOCH_STATES.INITIALIZE_VDF]: Object.freeze({
        [EPOCH_EVENTS.LOCAL_PROOF_READY]: EPOCH_STATES.BUILD_AND_SIGN_PROOF_PROPOSAL,
        [EPOCH_EVENTS.SOLVER_FAILURE]: EPOCH_STATES.INITIALIZE_VDF,
    }),
    [EPOCH_STATES.BUILD_AND_SIGN_PROOF_PROPOSAL]: Object.freeze({
        [EPOCH_EVENTS.PROPOSAL_BUILT]: EPOCH_STATES.QUORUM_DECISION,
    }),
    [EPOCH_STATES.QUORUM_DECISION]: Object.freeze({
        [EPOCH_EVENTS.EXTERNAL_APPROVALS_NOT_REQUIRED]: EPOCH_STATES.BUILD_SET_EPOCH,
        [EPOCH_EVENTS.EXTERNAL_APPROVALS_REQUIRED]: EPOCH_STATES.SEND_PROPOSAL_TO_INDEXERS,
        [EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED]: EPOCH_STATES.RELOAD_SIGNED_CONTEXT,
    }),
    [EPOCH_STATES.SEND_PROPOSAL_TO_INDEXERS]: Object.freeze({
        [EPOCH_EVENTS.PROPOSAL_BROADCAST]: EPOCH_STATES.COLLECT_APPROVALS,
        [EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED]: EPOCH_STATES.BACKOFF,
    }),
    [EPOCH_STATES.COLLECT_APPROVALS]: Object.freeze({
        [EPOCH_EVENTS.QUORUM_REACHED]: EPOCH_STATES.BUILD_SET_EPOCH,
        [EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED]: EPOCH_STATES.BACKOFF,
    }),
    [EPOCH_STATES.BUILD_SET_EPOCH]: Object.freeze({
        [EPOCH_EVENTS.SET_EPOCH_BUILT]: EPOCH_STATES.WAIT_FOR_APPEND_REPLIES,
    }),
    [EPOCH_STATES.WAIT_FOR_APPEND_REPLIES]: Object.freeze({
        [EPOCH_EVENTS.APPEND_REPLIES_COLLECTED]: EPOCH_STATES.REFRESH_SIGNED_STATE_BEFORE_APPEND,
        [EPOCH_EVENTS.APPEND_REPLY_COLLECTION_FAILED]: EPOCH_STATES.BACKOFF,
        [EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED]: EPOCH_STATES.RELOAD_SIGNED_CONTEXT,
    }),
    [EPOCH_STATES.REFRESH_SIGNED_STATE_BEFORE_APPEND]: Object.freeze({
        [EPOCH_EVENTS.TARGET_EPOCH_ABSENT]: EPOCH_STATES.APPEND_SET_EPOCH,
        [EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED]: EPOCH_STATES.RELOAD_SIGNED_CONTEXT,
        [EPOCH_EVENTS.INDEXERS_CHANGED]: EPOCH_STATES.QUORUM_DECISION,
    }),
    [EPOCH_STATES.APPEND_SET_EPOCH]: Object.freeze({
        [EPOCH_EVENTS.APPEND_STARTED]: EPOCH_STATES.WAIT_FOR_APPEND_OUTCOME,
        [EPOCH_EVENTS.APPEND_REJECTED]: EPOCH_STATES.BACKOFF,
        [EPOCH_EVENTS.TARGET_EPOCH_CONFIRMED]: EPOCH_STATES.RELOAD_SIGNED_CONTEXT,
        [EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED]: EPOCH_STATES.RELOAD_SIGNED_CONTEXT,
    }),
    [EPOCH_STATES.WAIT_FOR_APPEND_OUTCOME]: Object.freeze({
        [EPOCH_EVENTS.TARGET_EPOCH_CONFIRMED]: EPOCH_STATES.RELOAD_SIGNED_CONTEXT,
        [EPOCH_EVENTS.APPEND_REJECTED]: EPOCH_STATES.BACKOFF,
        [EPOCH_EVENTS.APPENDER_SELECTION_EXPIRED]: EPOCH_STATES.BACKOFF,
        [EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED]: EPOCH_STATES.RELOAD_SIGNED_CONTEXT,
    }),
    [EPOCH_STATES.REFRESH_SIGNED_STATE]: Object.freeze({
        [EPOCH_EVENTS.EPOCH_UNCHANGED_WITHOUT_LOCAL_PROOF]: EPOCH_STATES.INITIALIZE_VDF,
        [EPOCH_EVENTS.EPOCH_UNCHANGED_WITH_LOCAL_PROOF]: EPOCH_STATES.BUILD_AND_SIGN_PROOF_PROPOSAL,
        [EPOCH_EVENTS.NEW_EPOCH_DISCOVERED]: EPOCH_STATES.RELOAD_SIGNED_CONTEXT,
    }),
    [EPOCH_STATES.BACKOFF]: Object.freeze({
        [EPOCH_EVENTS.BACKOFF_ELAPSED]: EPOCH_STATES.REFRESH_SIGNED_STATE,
    }),
};

/**
 * Defines the states and transitions for one epoch round. EpochCoordinationRound supplies the
 * handlers. Proof approvals, appender selection and append confirmation are separate steps.
 * WAIT_FOR_APPEND_OUTCOME waits for a signed result or selection expiry after the local append starts.
 */
export class EpochStateMachine extends StateMachine {
    /**
     * Connects the round handlers to the transition table. Entering LOAD_EPOCH_CONTEXT clears the
     * previous context.
     *
     * @param {Object<string, function(EpochRoundContext, EpochStateMachine): Promise<void>>} [handlers={}] Handlers indexed by EPOCH_STATES.
     */
    constructor(handlers = {}) {
        super(TRANSITIONS, EPOCH_STATES.LOAD_EPOCH_CONTEXT, EPOCH_STATES.LOAD_EPOCH_CONTEXT, handlers);
    }
}
