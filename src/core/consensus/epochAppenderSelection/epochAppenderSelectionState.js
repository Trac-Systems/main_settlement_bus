import { EpochAppenderSelectionError, EpochAppenderSelectionErrorCode } from './EpochAppenderSelectionError.js';

const SELECTION_STATE_VERSION = 2;
export const EPOCH_APPENDER_SELECTION_VERSION = 2;

export const EpochAppenderVoteStatus = Object.freeze({
    GRANTED: 1,
    BUSY: 2,
    STALE: 3,
});

/** Two members first try to agree; only an unanswered timeout permits a solo fallback. */
export function selectionQuorum(memberCount) {
    return memberCount <= 2 ? memberCount : Math.floor(memberCount / 2) + 1;
}

/** Phase names remain readable when upgrading a v1 coordination record. */
export const EpochAppenderSelectionPhase = Object.freeze({
    REQUESTING: 'REQUESTING',
    HELD: 'HELD',
    PUBLISHING: 'PUBLISHING',
});

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
 * @property {number} networkId
 * @property {string} bootstrap
 * @property {string} targetEpoch Decimal uint64; converted to BigInt for arithmetic.
 * @property {string} parentHash
 * @property {string} membershipContext Hash of the signed voters for this election.
 * @property {string} configHash
 * @property {EpochAppenderSelectionMember[]} members Locally verified signed membership.
 * @property {string[]} [currentWriterKeys] Current signed writers; absent on incoming requests.
 *
 * @typedef {EpochAppenderSelectionContext & {
 *   requestId: string, payloadHash: string, logicalCounter: string, requester: string, selectionVersion: number
 * }} EpochAppendRequest
 *
 * @typedef {object} EpochAppendPublication
 * @property {string} writerKey
 * @property {number} from First possible zero-based position in the local writer log.
 * @property {string} payloadHash
 * @property {string} targetEpoch
 *
 * @typedef {object} EpochAppenderSelectionReservation
 * @property {EpochAppendRequest} request
 * @property {string} payload Exact operation bytes encoded as hex.
 * @property {string} phase One of EpochAppenderSelectionPhase.
 * @property {EpochAppendPublication|null} publication Present once PUBLISHING is durable.
 * @property {number} expiresAt Local failover deadline; never proves the append was cancelled.
 * @property {boolean} solo True only after the two-member unanswered timeout.
 *
 * @typedef {object} EpochAppendOutcomeResult
 * @property {string} status One of EpochAppendOutcome. UNKNOWN is not a rejection; election expiry is tracked separately.
 */

/** Compare signed context identity, excluding locally resolved membership details. */
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

/** @param {EpochAppendRequest} leftRequest @param {EpochAppendRequest} rightRequest */
export function sameSelectionRequest(leftRequest, rightRequest) {
    return sameSelectionContext(leftRequest, rightRequest) &&
        leftRequest.requestId === rightRequest.requestId &&
        leftRequest.payloadHash === rightRequest.payloadHash &&
        leftRequest.logicalCounter === rightRequest.logicalCounter &&
        leftRequest.requester === rightRequest.requester &&
        leftRequest.selectionVersion === rightRequest.selectionVersion;
}

/** Compare the canonical writer ordering without serializing it. */
export function sameWriterKeys(leftKeys, rightKeys) {
    if (!leftKeys || !rightKeys) {
        return leftKeys === rightKeys;
    }
    return leftKeys.length === rightKeys.length &&
        leftKeys.every((writerKey, index) => writerKey === rightKeys[index]);
}

/** @param {EpochAppenderSelectionContext} context @returns {EpochAppenderSelectionContext} */
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

/** @param {EpochAppendRequest} request @returns {EpochAppendRequest} */
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

/** @param {EpochAppendPublication} publication @returns {EpochAppendPublication} */
export function copyAppendPublication(publication) {
    return {
        writerKey: publication.writerKey,
        from: publication.from,
        payloadHash: publication.payloadHash,
        targetEpoch: publication.targetEpoch,
    };
}

/** @param {EpochAppenderSelectionReservation|null} reservation @returns {EpochAppenderSelectionReservation|null} */
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
 * @property {number} version Durable format version.
 * @property {string} clock Highest known logical counter, encoded as a decimal uint64.
 * @property {EpochAppenderSelectionReservation|null} active
 * @property {{request: EpochAppendRequest, expiresAt: number}|null} vote Last durable vote; expiration permits only a HIGHER term.
 */

/** @returns {EpochAppenderSelectionState} */
export function createSelectionState() {
    return { version: SELECTION_STATE_VERSION, clock: '0', active: null, vote: null };
}

/**
 * @param {EpochAppenderSelectionState} selectionState
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

/** Preserve an old in-flight append during upgrade, with a bounded failover delay. */
export function upgradeSelectionState(selectionState, now, timeoutMs) {
    const upgraded = copySelectionState(selectionState);
    if (upgraded.version === SELECTION_STATE_VERSION) {
        return upgraded;
    }
    upgraded.version = SELECTION_STATE_VERSION;
    if (upgraded.active) {
        upgraded.active.request.selectionVersion = EPOCH_APPENDER_SELECTION_VERSION;
        upgraded.active.expiresAt = now + timeoutMs;
        upgraded.vote = {
            request: copySelectionRequest(upgraded.active.request),
            expiresAt: upgraded.active.expiresAt,
        };
    }
    return upgraded;
}

/** Validate both legacy reservations and the durable election votes used after upgrade. */
export function validateSelectionState(selectionState, publicKey) {
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
        if (!validElectionRequest(request) || BigInt(request.logicalCounter) > BigInt(selectionState.clock) ||
            !Number.isSafeInteger(expiresAt) || expiresAt < 0 ||
            !request.members?.some(member => member.publicKey === request.requester) ||
            !request.members.some(member => member.publicKey === publicKey)) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SELECTION_STATE_INVALID, 'Invalid durable appender vote');
        }
    }
    if (!selectionState.active) {
        return;
    }
    validateReservation(selectionState.active, publicKey, BigInt(selectionState.clock));
    if (selectionState.version === SELECTION_STATE_VERSION &&
        (!Number.isSafeInteger(selectionState.active.expiresAt) || selectionState.active.expiresAt < 0 ||
        !validElectionRequest(selectionState.active.request) || typeof selectionState.active.solo !== 'boolean' ||
        (selectionState.active.solo && selectionState.active.request.members.length !== 2))) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.RESERVATION_INVALID, 'Invalid appender election deadline or version');
    }
    if (selectionState.active.phase === EpochAppenderSelectionPhase.PUBLISHING) {
        validatePublication(selectionState.active);
    }
}

function validElectionRequest(request) {
    if (!request || request.selectionVersion !== EPOCH_APPENDER_SELECTION_VERSION ||
        !Number.isInteger(request.networkId) || request.networkId < 1 || request.networkId > 65535 ||
        typeof request.requestId !== 'string' || !request.requestId.length || request.requestId.length > 64 ||
        !/^[1-9]\d*$/.test(request.logicalCounter) || BigInt(request.logicalCounter) > EPOCH_APPENDER_SELECTION_MAX_COUNTER ||
        !/^\d+$/.test(request.targetEpoch) || BigInt(request.targetEpoch) > EPOCH_APPENDER_SELECTION_MAX_COUNTER) return false;
    const validKeys = ['bootstrap', 'parentHash', 'membershipContext', 'configHash', 'payloadHash', 'requester']
        .every(field => typeof request[field] === 'string' && /^[a-f0-9]{64}$/.test(request[field]));
    const members = request.members;
    return validKeys && Array.isArray(members) && members.length > 0 && members.every(member =>
        member && /^[a-f0-9]{64}$/.test(member.publicKey) && /^[a-f0-9]{64}$/.test(member.writerKey)
    ) && new Set(members.map(member => member.publicKey)).size === members.length;
}

function validateReservation(reservation, publicKey, clock) {
    const request = reservation.request;
    const validPhase = Object.values(EpochAppenderSelectionPhase).includes(reservation.phase);
    const validOwner = request?.requester === publicKey;
    const validCounter = /^[1-9]\d*$/.test(request?.logicalCounter);
    if (!validPhase || !validOwner || !validCounter) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.RESERVATION_INVALID, 'Invalid epoch append reservation');
    }
    if (BigInt(request.logicalCounter) > clock) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.RESERVATION_INVALID, 'Reservation counter exceeds coordination clock');
    }
    const validMembers = Array.isArray(request.members) && request.members.every(member =>
        member && typeof member.writerKey === 'string' && typeof member.publicKey === 'string'
    );
    const validWriterKeys = request.currentWriterKeys === undefined ||
        (Array.isArray(request.currentWriterKeys) && request.currentWriterKeys.every(key => typeof key === 'string'));
    if (!validMembers || !validWriterKeys || typeof reservation.payload !== 'string') {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.RESERVATION_INVALID, 'Invalid epoch append reservation data');
    }
}

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

