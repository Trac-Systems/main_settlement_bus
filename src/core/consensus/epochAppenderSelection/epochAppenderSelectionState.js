/**
 * Defines the records used to select an appender. Field names are part of the protocol and local
 * storage format. Copy helpers keep changes to one record from affecting another.
 *
 * @typedef {EpochAppendRequest & {
 *   voteStatus: number, observedCounter: string, vote: EpochAppendRequest
 * }} EpochAppendReply Validated REPLY containing the peer's saved vote.
 *
 * @typedef {object} EpochSelectionRequestLifecycle
 * @property {function(): boolean} isActive Checks whether this election is still waiting for replies.
 * @property {function(function(): void): void} onPending Registers a callback that cancels the pending request.
 */
import { EpochAppenderSelectionError, EpochAppenderSelectionErrorCode } from './EpochAppenderSelectionError.js';

const SELECTION_STATE_VERSION = 2;
export const EPOCH_APPENDER_SELECTION_VERSION = 2;

/** Reply values for a granted vote, a busy voter or an old election term. */
export const EpochAppenderVoteStatus = Object.freeze({
    GRANTED: 1,
    BUSY: 2,
    STALE: 3,
});

/**
 * Returns the number of votes needed to select an appender, including the local vote. Two indexers
 * first require both votes. The selector handles the fallback when a peer is silent.
 *
 * @param {number} memberCount Number of indexers in the signed election context.
 * @returns {number} Number of votes before applying the fallback for two indexers.
 */
export function calculateAppenderVoteQuorum(memberCount) {
    return memberCount <= 2 ? memberCount : Math.floor(memberCount / 2) + 1;
}

/** Selection phases stored locally. These names also support reading older records. */
export const EpochAppenderSelectionPhase = Object.freeze({
    REQUESTING: 'REQUESTING',
    HELD: 'HELD',
    PUBLISHING: 'PUBLISHING',
});

/** Append results and selection expiry. UNKNOWN and SELECTION_EXPIRED do not prove cancellation. */
export const EpochAppendOutcome = Object.freeze({
    UNKNOWN: 'UNKNOWN',
    EPOCH_ADVANCED: 'EPOCH_ADVANCED',
    REJECTED: 'REJECTED',
    SELECTION_EXPIRED: 'SELECTION_EXPIRED',
});

export const EPOCH_APPENDER_SELECTION_MAX_COUNTER = (1n << 64n) - 1n;

/**
 * @typedef {object} EpochAppenderSelectionMember
 * @property {string} writerKey Writer key as lowercase hex.
 * @property {string} publicKey Authenticated wallet public key as lowercase hex.
 *
 * @typedef {object} EpochAppenderSelectionContext
 * @property {number} networkId Network that this election belongs to.
 * @property {string} bootstrap Autobase bootstrap key, encoded as lowercase hex.
 * @property {string} targetEpoch Epoch number stored as a decimal string and converted to BigInt for calculations.
 * @property {string} parentHash Hash of the signed parent epoch record.
 * @property {string} membershipContext Hash of the signed voters for this election.
 * @property {string} configHash Hash of the signed consensus configuration bytes.
 * @property {EpochAppenderSelectionMember[]} members Signed indexer list checked by this node.
 * @property {string[]} [currentWriterKeys] Current signed writer keys. Incoming requests do not include this field.
 *
 * @typedef {object} EpochSelectionIdentity
 * @property {string} requestId ID shared by all retries of this election request.
 * @property {string} payloadHash Hash of the exact SET_EPOCH bytes reserved by the candidate.
 * @property {string} logicalCounter Election term stored as a decimal uint64 string. New terms follow the saved voting history.
 * @property {string} requester Candidate's authenticated wallet public key, encoded as hex.
 * @property {number} selectionVersion Voting protocol version.
 *
 * @typedef {EpochAppenderSelectionContext & EpochSelectionIdentity} EpochAppendRequest
 *
 * @typedef {object} EpochAppendPublication
 * @property {string} writerKey Local writer key as lowercase hex.
 * @property {number} from First possible block index for this append in the local writer log. Starts at zero.
 * @property {string} payloadHash Hash identifying the exact operation in that writer's log.
 * @property {string} targetEpoch Target epoch stored as a decimal string.
 *
 * @typedef {object} EpochAppenderSelectionReservation
 * @property {EpochAppendRequest} request Selection request that reserves this payload.
 * @property {string} payload Exact operation bytes encoded as hex.
 * @property {string} phase One of EpochAppenderSelectionPhase.
 * @property {EpochAppendPublication|null} publication Append details saved when the phase becomes PUBLISHING.
 * @property {number} expiresAt Local deadline for starting another election. Expiry does not cancel the append.
 * @property {boolean} solo True if this node continues alone after the only peer fails to reply.
 *
 * @typedef {object} EpochAppendOutcomeResult
 * @property {string} status One of EpochAppendOutcome. UNKNOWN and SELECTION_EXPIRED do not prove rejection.
 */

/**
 * Checks whether both contexts refer to the same election. The resolved member lists are not compared
 * here.
 *
 * @param {EpochAppenderSelectionContext|null} leftContext First signed election context.
 * @param {EpochAppenderSelectionContext|null} rightContext Second signed election context.
 * @returns {boolean} False if either context is missing.
 */
export function sameSelectionContext(leftContext, rightContext) {
    if (!leftContext || !rightContext) {
        return false;
    }
    return leftContext.networkId === rightContext.networkId &&
        leftContext.bootstrap === rightContext.bootstrap &&
        leftContext.targetEpoch === rightContext.targetEpoch &&
        leftContext.parentHash === rightContext.parentHash &&
        leftContext.membershipContext === rightContext.membershipContext &&
        leftContext.configHash === rightContext.configHash;
}

/**
 * Checks whether both requests have the same context, candidate, term and payload.
 *
 * @param {EpochAppendRequest|null} leftRequest First election request.
 * @param {EpochAppendRequest|null} rightRequest Second election request.
 * @returns {boolean}
 */
export function sameSelectionRequest(leftRequest, rightRequest) {
    return sameSelectionContext(leftRequest, rightRequest) &&
        leftRequest.requestId === rightRequest.requestId &&
        leftRequest.payloadHash === rightRequest.payloadHash &&
        leftRequest.logicalCounter === rightRequest.logicalCounter &&
        leftRequest.requester === rightRequest.requester &&
        leftRequest.selectionVersion === rightRequest.selectionVersion;
}

/**
 * Checks whether both lists contain the same writer keys in the same order. Two missing lists are
 * treated as equal.
 *
 * @param {string[]|undefined} leftKeys First sorted writer list.
 * @param {string[]|undefined} rightKeys Second sorted writer list.
 * @returns {boolean}
 */
export function sameWriterKeys(leftKeys, rightKeys) {
    if (!leftKeys || !rightKeys) {
        return leftKeys === rightKeys;
    }
    return leftKeys.length === rightKeys.length &&
        leftKeys.every((writerKey, index) => writerKey === rightKeys[index]);
}

/**
 * Copies the election context, including its member objects and writer keys.
 *
 * @param {EpochAppenderSelectionContext} context Source context.
 * @returns {EpochAppenderSelectionContext}
 */
export function copySelectionContext(context) {
    const snapshot = {
        networkId: context.networkId,
        bootstrap: context.bootstrap,
        targetEpoch: context.targetEpoch,
        parentHash: context.parentHash,
        membershipContext: context.membershipContext,
        configHash: context.configHash,
        members: context.members.map(member => ({
            writerKey: member.writerKey,
            publicKey: member.publicKey,
        })),
    };
    if (context.currentWriterKeys) {
        snapshot.currentWriterKeys = [...context.currentWriterKeys];
    }
    return snapshot;
}

/**
 * Copies the request fields and the locally resolved member list.
 *
 * @param {EpochAppendRequest} request Source request.
 * @returns {EpochAppendRequest}
 */
export function copySelectionRequest(request) {
    return {
        ...copySelectionContext(request),
        requestId: request.requestId,
        payloadHash: request.payloadHash,
        logicalCounter: request.logicalCounter,
        requester: request.requester,
        selectionVersion: request.selectionVersion,
    };
}

/**
 * Copies the details used to find this append in the local writer log.
 *
 * @param {EpochAppendPublication} publication Append details to copy.
 * @returns {EpochAppendPublication}
 */
export function copyAppendPublication(publication) {
    return {
        writerKey: publication.writerKey,
        from: publication.from,
        payloadHash: publication.payloadHash,
        targetEpoch: publication.targetEpoch,
    };
}

/**
 * Copies the local reservation and its append details. Nested objects are copied too.
 *
 * @param {EpochAppenderSelectionReservation|null} reservation Source reservation.
 * @returns {EpochAppenderSelectionReservation|null}
 */
export function copySelectionReservation(reservation) {
    if (!reservation) {
        return null;
    }
    return {
        request: copySelectionRequest(reservation.request),
        payload: reservation.payload,
        phase: reservation.phase,
        publication: reservation.publication ? copyAppendPublication(reservation.publication) : null,
        expiresAt: reservation.expiresAt,
        solo: reservation.solo ?? false,
    };
}

/**
 * @typedef {object} EpochAppenderSelectionState
 * @property {number} version Local storage format version.
 * @property {string} clock Highest known logical counter, encoded as a decimal uint64.
 * @property {EpochAppenderSelectionReservation|null} active Local selection request or append still waiting for a result.
 * @property {{request: EpochAppendRequest, expiresAt: number}|null} vote Last saved vote. After it expires, another candidate still needs a higher term.
 */

/**
 * Creates the initial state before this node starts an election or votes for a peer.
 *
 * @returns {EpochAppenderSelectionState}
 */
export function createSelectionState() {
    return { version: SELECTION_STATE_VERSION, clock: '0', active: null, vote: null };
}

/**
 * Copies the saved votes and active reservation for storage or validation.
 *
 * @param {EpochAppenderSelectionState} selectionState Local state managed by the selector.
 * @returns {EpochAppenderSelectionState}
 */
export function copySelectionState(selectionState) {
    return {
        version: selectionState.version,
        clock: selectionState.clock,
        active: copySelectionReservation(selectionState.active),
        vote: selectionState.vote ? {
            request: copySelectionRequest(selectionState.vote.request),
            expiresAt: selectionState.vote.expiresAt,
        } : null,
    };
}

/**
 * Updates an older record while keeping any pending append. Sets a timeout so that append cannot block
 * new elections forever.
 *
 * @param {EpochAppenderSelectionState} selectionState Validated record in the older or current format.
 * @param {number} nowMs Current local time in milliseconds.
 * @param {number} selectionTimeoutMs Time allowed for a pending append after restart, in milliseconds.
 * @returns {EpochAppenderSelectionState} Copy of the state in the current format.
 */
export function upgradeSelectionState(selectionState, nowMs, selectionTimeoutMs) {
    const upgradedState = copySelectionState(selectionState);
    if (upgradedState.version === SELECTION_STATE_VERSION) {
        return upgradedState;
    }
    upgradedState.version = SELECTION_STATE_VERSION;
    if (upgradedState.active) {
        upgradedState.active.request.selectionVersion = EPOCH_APPENDER_SELECTION_VERSION;
        upgradedState.active.expiresAt = nowMs + selectionTimeoutMs;
        upgradedState.vote = {
            request: copySelectionRequest(upgradedState.active.request),
            expiresAt: upgradedState.active.expiresAt,
        };
    }
    return upgradedState;
}

/**
 * Checks the saved votes and reservations before sending requests or starting an append. Supports both
 * the older and current storage formats.
 *
 * @param {EpochAppenderSelectionState} selectionState Decoded local record.
 * @param {string} localPublicKey Local wallet public key, encoded as hex.
 * @throws {EpochAppenderSelectionError} If the saved state contains invalid or conflicting data.
 */
export function validateSelectionState(selectionState, localPublicKey) {
    if (
        !selectionState ||
        ![1, SELECTION_STATE_VERSION].includes(selectionState.version) ||
        !/^\d+$/.test(selectionState.clock)
    ) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SELECTION_STATE_INVALID, 'Invalid epoch appender selection state');
    }
    if (BigInt(selectionState.clock) > EPOCH_APPENDER_SELECTION_MAX_COUNTER) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SELECTION_STATE_INVALID, 'Epoch append coordination counter exceeds uint64');
    }
    if (selectionState.version === SELECTION_STATE_VERSION && !Object.hasOwn(selectionState, 'vote')) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SELECTION_STATE_INVALID, 'Durable appender vote field is missing');
    }
    if (selectionState.version === SELECTION_STATE_VERSION && selectionState.vote) {
        const { request, expiresAt } = selectionState.vote;
        if (!isValidElectionRequest(request) || BigInt(request.logicalCounter) > BigInt(selectionState.clock) ||
            !Number.isSafeInteger(expiresAt) || expiresAt < 0 ||
            !request.members?.some(member => member.publicKey === request.requester) ||
            !request.members.some(member => member.publicKey === localPublicKey)) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SELECTION_STATE_INVALID, 'Invalid durable appender vote');
        }
    }
    if (!selectionState.active) {
        return;
    }
    validateReservation(selectionState.active, localPublicKey, BigInt(selectionState.clock));
    if (selectionState.version === SELECTION_STATE_VERSION &&
        (!Number.isSafeInteger(selectionState.active.expiresAt) || selectionState.active.expiresAt < 0 ||
        !isValidElectionRequest(selectionState.active.request) || typeof selectionState.active.solo !== 'boolean' ||
        (selectionState.active.solo && selectionState.active.request.members.length !== 2))) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.RESERVATION_INVALID, 'Invalid appender election deadline or version');
    }
    if (selectionState.active.phase === EpochAppenderSelectionPhase.PUBLISHING) {
        validatePublication(selectionState.active);
    }
}

/**
 * Checks the request version, uint64 counters and member identities.
 *
 * @param {EpochAppendRequest} request Candidate request read from local storage.
 * @returns {boolean}
 */
function isValidElectionRequest(request) {
    if (!request || request.selectionVersion !== EPOCH_APPENDER_SELECTION_VERSION ||
        !Number.isInteger(request.networkId) || request.networkId < 1 || request.networkId > 65535 ||
        typeof request.requestId !== 'string' || !request.requestId.length || request.requestId.length > 64 ||
        !/^[1-9]\d*$/.test(request.logicalCounter) || BigInt(request.logicalCounter) > EPOCH_APPENDER_SELECTION_MAX_COUNTER ||
        !/^\d+$/.test(request.targetEpoch) || BigInt(request.targetEpoch) > EPOCH_APPENDER_SELECTION_MAX_COUNTER) return false;
    const hasValidIdentityFields = ['bootstrap', 'parentHash', 'membershipContext', 'configHash', 'payloadHash', 'requester']
        .every(field => typeof request[field] === 'string' && /^[a-f0-9]{64}$/.test(request[field]));
    const members = request.members;
    return hasValidIdentityFields && Array.isArray(members) && members.length > 0 && members.every(member =>
        member && /^[a-f0-9]{64}$/.test(member.publicKey) && /^[a-f0-9]{64}$/.test(member.writerKey)
    ) && new Set(members.map(member => member.publicKey)).size === members.length;
}

/**
 * Checks that the reservation belongs to this node and has a valid phase, term and payload details.
 *
 * @param {EpochAppenderSelectionReservation} reservation Local request or pending append.
 * @param {string} localPublicKey Expected owner identity.
 * @param {bigint} highestKnownCounter Highest election term saved by this node.
 * @throws {EpochAppenderSelectionError}
 */
function validateReservation(reservation, localPublicKey, highestKnownCounter) {
    const request = reservation.request;
    const hasValidPhase = Object.values(EpochAppenderSelectionPhase).includes(reservation.phase);
    const hasLocalOwner = request?.requester === localPublicKey;
    const hasValidCounter = /^[1-9]\d*$/.test(request?.logicalCounter);
    if (!hasValidPhase || !hasLocalOwner || !hasValidCounter) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.RESERVATION_INVALID, 'Invalid epoch append reservation');
    }
    if (BigInt(request.logicalCounter) > highestKnownCounter) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.RESERVATION_INVALID, 'Reservation counter exceeds coordination clock');
    }
    const hasValidMembers = Array.isArray(request.members) && request.members.every(member =>
        member && typeof member.writerKey === 'string' && typeof member.publicKey === 'string'
    );
    const hasValidWriterKeys = request.currentWriterKeys === undefined ||
        (Array.isArray(request.currentWriterKeys) && request.currentWriterKeys.every(key => typeof key === 'string'));
    if (!hasValidMembers || !hasValidWriterKeys || typeof reservation.payload !== 'string') {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.RESERVATION_INVALID, 'Invalid epoch append reservation data');
    }
}

/**
 * Checks the writer position and verifies that the append details match the selected request.
 *
 * @param {EpochAppenderSelectionReservation} reservation PUBLISHING reservation.
 * @throws {EpochAppenderSelectionError}
 */
function validatePublication(reservation) {
    const { publication, request } = reservation;
    if (!publication || !/^[a-f0-9]{64}$/.test(publication.writerKey)) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.PUBLICATION_MARKER_INVALID, 'Invalid durable epoch publication writer');
    }
    if (!Number.isSafeInteger(publication.from) || publication.from < 0) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.PUBLICATION_MARKER_INVALID, 'Invalid durable epoch publication position');
    }
    if (publication.payloadHash !== request.payloadHash || publication.targetEpoch !== request.targetEpoch) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.PUBLICATION_MARKER_INVALID, 'Durable publication does not match its request');
    }
}

