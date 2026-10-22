import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { generateUUID } from '../../../utils/helpers.js';
import { toHex } from '../../../utils/buffer.js';
import { EpochAppenderSelectionError, EpochAppenderSelectionErrorCode } from './EpochAppenderSelectionError.js';
import {
    EpochAppenderSelectionPhase,
    EpochAppendOutcome,
    EpochAppenderVoteStatus,
    EPOCH_APPENDER_SELECTION_VERSION,
    EPOCH_APPENDER_SELECTION_MAX_COUNTER,
    copySelectionContext,
    copySelectionRequest,
    copyAppendPublication,
    copySelectionReservation,
    sameSelectionContext,
    sameSelectionRequest,
    sameWriterKeys,
    selectionQuorum,
    createSelectionState,
    upgradeSelectionState,
    copySelectionState,
    validateSelectionState,
} from './epochAppenderSelectionState.js';

/**
 * @typedef {import('./epochAppenderSelectionState.js').EpochAppendRequest} EpochAppendRequest
 * @typedef {import('./epochAppenderSelectionState.js').EpochAppenderSelectionContext} EpochAppenderSelectionContext
 * @typedef {import('./epochAppenderSelectionState.js').EpochAppendOutcomeResult} EpochAppendOutcomeResult
 *
 * @typedef {import('./EpochAppenderSelectionOperations.js').EpochAppenderSelectionOperations} EpochAppenderSelectionOperations
 *
 * @typedef {object} EpochAppendReplyWaiter
 * @property {EpochAppendRequest} request
 * @property {function(): void} resolve
 * @property {function(Error): void} reject
 * @property {Set<string>} pending Peers with an RPC in flight.
 * @property {Map<string, function(): void>} cancellations Pending RPC cleanup by peer.
 * @property {Map<string, Error>} errors Most recent send failure by peer.
 * @property {Error|null} pollError Most recent context/connection failure.
 * @property {boolean} polling
 * @property {*} retryTimer
 * @property {*} timeoutTimer
 */

/**
 * Elect the epoch appender by durable majority votes, shared by every local round.
 * A failover deadline permits a higher term; it never cancels an earlier append.
 * Only selection state mutations are serialized. The FSM owns the actual append.
 *
 * Every voter records one candidate per term before sending GRANTED. A candidate
 * counts itself plus distinct peer votes from the fixed signed membership. Votes
 * expire for liveness, but their identities survive expiry and restart: the next
 * candidate must use a higher term. Random campaign delays avoid split self-votes.
 * Two members first require both votes, then permit solo progress only if the peer
 * has not answered. This explicitly accepts two appenders during a 1+1 partition.
 * Higher-term failover can overlap an earlier in-flight append; it does not choose
 * one immutable proof across all terms. Existing ledger validation resolves writes.
 */
export class EpochAppenderSelector {
    #publicKey;
    #retryMs;
    #timeoutMs;
    #monitorEnabled;
    #electionJitterMs;
    #operations;
    #opening;
    #selectionStateQueue = Promise.resolve();
    #selectionState = createSelectionState();
    #receivedReplies = new Set();
    #campaignTimers = new Map();
    #replyWaiter = null;
    #closed = false;
    #persistenceError = null;
    #completedRequest = null;
    #monitorTimer = null;
    #monitorTask = null;
    #reconcileTask = null;

    /**
     * @param {string} publicKey Local authenticated wallet public key, encoded as hex.
     * @param {EpochAppenderSelectionOperations} operations
     * @param {number} [retryMs=1000]
     * @param {number} [timeoutMs=20000]
     * @param {boolean} [monitor=false] Observe publications outside the lifetime of a round.
     * @param {number} [electionJitterMs=0] Spread simultaneous campaigns before persisting self-votes.
     */
    constructor(publicKey, operations, retryMs = 1000, timeoutMs = 20_000, monitor = false, electionJitterMs = 0) {
        this.#publicKey = publicKey;
        this.#retryMs = retryMs;
        this.#timeoutMs = timeoutMs;
        this.#monitorEnabled = monitor;
        this.#electionJitterMs = electionJitterMs;
        this.#operations = operations;
    }

    /** @returns {import('./epochAppenderSelectionState.js').EpochAppenderSelectionReservation|null} An isolated snapshot. */
    get active() {
        return copySelectionReservation(this.#selectionState.active);
    }

    /** @param {string|bigint} epoch @returns {boolean} */
    enabledFor(epoch) {
        return BigInt(epoch) >= 1n;
    }

    /** @returns {EpochAppendOutcomeResult|null} Null means no recorded completion for this request. */
    outcomeFor(requestId) {
        if (this.#completedRequest?.requestId !== requestId) {
            return null;
        }
        return { status: this.#completedRequest.outcome.status };
    }

    /** Open once; a failed recovery remains failed for this selector instance. */
    open() {
        if (!this.#opening) {
            this.#opening = this.#open();
        }
        return this.#opening;
    }

    /**
     * Reserve an immutable payload and the next logical ticket.
     * @param {EpochAppenderSelectionContext} context
     * @param {Buffer} payload
     * @returns {Promise<EpochAppendRequest>}
     * @throws {EpochAppenderSelectionError} If the previous publication is unresolved or persistence fails.
     */
    async createRequest(context, payload) {
        const frozenPayload = b4a.from(payload);
        const payloadHash = toHex(await tracCryptoApi.hash.blake3(frozenPayload));
        if (context.members.length > 1) {
            await this.#delayCampaign();
        }
        if (this.#operations.readContext && !sameSelectionContext(context, await this.#operations.readContext())) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.CONTEXT_CHANGED, 'Epoch changed before starting the appender election');
        }
        return this.#updateSelectionState(() => {
            if (this.#selectionState.active) {
                throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.PUBLICATION_UNRESOLVED, 'A previous epoch publication is unresolved');
            }
            if (!context.members.some(member => member.publicKey === this.#publicKey)) {
                throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.NOT_IN_COHORT, 'Local indexer is not in this epoch coordination cohort');
            }
            const vote = this.#selectionState.vote;
            if (vote && sameSelectionContext(vote.request, context) && vote.expiresAt > Date.now()) {
                throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.ELECTION_BUSY,
                    'Waiting for the current appender election to finish or expire',
                    { details: { requester: vote.request.requester, term: vote.request.logicalCounter } });
            }
            const counter = BigInt(this.#selectionState.clock) + 1n;
            if (counter > EPOCH_APPENDER_SELECTION_MAX_COUNTER) {
                throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.LOGICAL_CLOCK_EXHAUSTED, 'Epoch append logical clock exhausted');
            }
            this.#selectionState.clock = counter.toString();
            const request = {
                ...copySelectionContext(context),
                requestId: generateUUID(),
                payloadHash,
                logicalCounter: counter.toString(),
                requester: this.#publicKey,
                selectionVersion: EPOCH_APPENDER_SELECTION_VERSION,
            };
            const expiresAt = Date.now() + this.#timeoutMs;
            this.#selectionState.vote = { request: copySelectionRequest(request), expiresAt };
            this.#receivedReplies.clear();
            this.#selectionState.active = {
                request,
                payload: toHex(frozenPayload),
                phase: context.members.length === 1 ? EpochAppenderSelectionPhase.HELD : EpochAppenderSelectionPhase.REQUESTING,
                publication: null,
                expiresAt,
                solo: false,
            };
            return copySelectionRequest(request);
        });
    }

    /**
     * Called after authenticating the peer and validating the signed context.
     * @param {EpochAppendRequest} request
     * @param {function(object): Promise<void>} reply Sends the persisted vote decision.
     * @returns {Promise<boolean>} Whether the reply was granted immediately.
     */
    async receiveRequest(request, reply) {
        const response = await this.#updateSelectionState(() => {
            this.#observeRequestCounter(request);
            const voteStatus = this.#voteFor(request);
            const active = this.#selectionState.active;
            if (voteStatus === EpochAppenderVoteStatus.GRANTED && active &&
                active.phase !== EpochAppenderSelectionPhase.PUBLISHING) {
                this.#selectionState.active = null;
                this.#receivedReplies.clear();
            }
            return {
                ...copySelectionRequest(request),
                voteStatus,
                observedCounter: this.#selectionState.clock,
                vote: copySelectionRequest(this.#selectionState.vote.request),
            };
        });
        if (this.#replyWaiter && !this.#selectionState.active) {
            this.#finishReplyWaiter(this.#supersededError());
        }
        this.#assertAvailable();
        await reply(response);
        return response.voteStatus === EpochAppenderVoteStatus.GRANTED;
    }

    /** @returns {Promise<boolean>} True once the local vote and peer votes form a quorum. */
    async receiveReply(request, peer) {
        let failure;
        const held = await this.#updateSelectionState(() => {
            const active = this.#selectionState.active;
            if (!active || active.phase !== EpochAppenderSelectionPhase.REQUESTING || !sameSelectionRequest(active.request, request)) {
                return false;
            }
            const isMember = active.request.members.some(member => member.publicKey === peer);
            if (peer === this.#publicKey || !isMember) {
                throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.UNEXPECTED_PEER, 'Reply from an unexpected epoch member');
            }
            if (!/^[1-9]\d*$/.test(request.observedCounter) ||
                BigInt(request.observedCounter) > EPOCH_APPENDER_SELECTION_MAX_COUNTER ||
                !request.vote || request.vote.networkId !== active.request.networkId ||
                request.vote.bootstrap !== active.request.bootstrap) {
                throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.REQUEST_STALE, 'Invalid appender vote response');
            }
            this.#replyWaiter?.responded.add(peer);
            const observedCounter = BigInt(request.observedCounter);
            if (observedCounter > BigInt(this.#selectionState.clock)) {
                this.#selectionState.clock = observedCounter.toString();
            }
            if (BigInt(request.vote.logicalCounter) > BigInt(active.request.logicalCounter)) {
                failure = this.#supersededError();
                this.#releaseActiveRequest(active.request);
                return false;
            }
            if (request.voteStatus !== EpochAppenderVoteStatus.GRANTED ||
                !sameSelectionRequest(request.vote, active.request) ||
                !sameSelectionRequest(this.#selectionState.vote?.request, active.request) ||
                active.expiresAt <= Date.now()) {
                this.#replyWaiter?.errors.set(peer, new EpochAppenderSelectionError(
                    EpochAppenderSelectionErrorCode.ELECTION_BUSY,
                    `Vote unavailable; candidate=${request.vote.requester}; term=${request.vote.logicalCounter}`
                ));
                const unanswered = active.request.members.length - 1 - (this.#replyWaiter?.responded.size ?? 0);
                if (this.#replyWaiter && 1 + this.#receivedReplies.size + unanswered < selectionQuorum(active.request.members.length)) {
                    failure = new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.REPLIES_INCOMPLETE,
                        'This appender election cannot reach a majority; retry in a higher term');
                    this.#releaseActiveRequest(active.request);
                }
                return false;
            }
            this.#replyWaiter?.errors.delete(peer);
            this.#receivedReplies.add(peer);
            if (this.#receivedReplies.size + 1 >= selectionQuorum(active.request.members.length)) {
                active.phase = EpochAppenderSelectionPhase.HELD;
            }
            return active.phase === EpochAppenderSelectionPhase.HELD;
        });
        if (held) {
            this.#finishReplyWaiter();
        } else if (this.#replyWaiter && !this.#selectionState.active) {
            this.#finishReplyWaiter(failure ?? this.#supersededError());
        }
        return held;
    }

    /** @returns {Promise<boolean>} False for stale requests and durable publications. */
    async cancel(requestId, reason) {
        const released = await this.#updateSelectionState(() => {
            const active = this.#selectionState.active;
            if (!active || active.request.requestId !== requestId || active.phase === EpochAppenderSelectionPhase.PUBLISHING) {
                return false;
            }
            this.#releaseActiveRequest(active.request);
            return true;
        });
        if (released) {
            const error = reason ?? new EpochAppenderSelectionError(
                EpochAppenderSelectionErrorCode.REQUEST_CANCELLED,
                'Epoch append request cancelled',
                { details: { requestId } }
            );
            this.#finishReplyWaiter(error);
        }
        return released;
    }

    /** Return isolated operation bytes for the selected request; never performs the append. */
    async getSelectedPayload(requestId) {
        await this.open();
        this.#assertAvailable();
        const active = this.#requireSelectedRequest(requestId);
        return b4a.from(active.payload, 'hex');
    }

    /**
     * Recheck the selection and durably mark its use inside State's write queue.
     * The caller may append only after this resolves. A failover can supersede this
     * reservation later, but cannot undo an append that has already started.
     * @param {string} requestId
     * @param {{writerKey: string, from: number}} location
     * @returns {Promise<void>}
     */
    async authorizeAppend(requestId, location) {
        await this.open();
        this.#assertAvailable();
        const active = this.#requireSelectedRequest(requestId);
        await this.#validatePublicationContext(active.request, location.writerKey);
        await this.#updateSelectionState(() => {
            if (this.#selectionState.active !== active || active.phase !== EpochAppenderSelectionPhase.HELD) {
                throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.REQUEST_STALE, 'Epoch append request expired before publication');
            }
            this.#requireSelectedRequest(requestId);
            active.phase = EpochAppenderSelectionPhase.PUBLISHING;
            active.publication = {
                writerKey: location.writerKey,
                from: location.from,
                payloadHash: active.request.payloadHash,
                targetEpoch: active.request.targetEpoch,
            };
        });
        this.#assertAvailable();
        if (active.expiresAt <= Date.now() || !sameSelectionRequest(this.#selectionState.vote?.request, active.request)) {
            throw this.#supersededError();
        }
    }

    /**
     * Observe signed completion or expire the local selection to allow a new term.
     * SELECTION_EXPIRED says nothing about whether the old append will still land.
     * Concurrent callers share the current publication's check until it settles.
     * @returns {Promise<EpochAppendOutcomeResult|null>} Null if absent or superseded during the read.
     */
    async reconcile() {
        await this.open();
        this.#assertAvailable();
        const active = this.#selectionState.active;
        if (!active || active.phase !== EpochAppenderSelectionPhase.PUBLISHING) {
            return null;
        }
        if (this.#reconcileTask?.active === active) {
            return this.#reconcileTask.promise;
        }
        const task = { active, promise: null };
        task.promise = this.#reconcilePublication(active).finally(() => {
            if (this.#reconcileTask === task) {
                this.#reconcileTask = null;
            }
        });
        this.#reconcileTask = task;
        return task.promise;
    }

    /** @returns {Promise<void>} Resolves on quorum, or on the two-member unanswered timeout. */
    async waitForReplies(request) {
        await this.open();
        this.#assertAvailable();
        if (this.#selectionState.active?.request.requestId !== request.requestId) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.REQUEST_STALE, 'Stale epoch append request');
        }
        if (this.#selectionState.active.phase === EpochAppenderSelectionPhase.HELD) {
            return;
        }
        if (this.#replyWaiter) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.ALREADY_WAITING, 'Already waiting for epoch append replies');
        }
        return new Promise((resolve, reject) => {
            const waiter = this.#createReplyWaiter(request, resolve, reject);
            this.#replyWaiter = waiter;
            waiter.timeoutTimer = setTimeout(() => {
                this.#handleReplyTimeout(waiter)
                    .catch(error => {
                        if (this.#replyWaiter === waiter) {
                            this.#finishReplyWaiter(error);
                        }
                    });
            }, Math.max(0, this.#selectionState.active.expiresAt - Date.now()));
            this.#pollReplies(waiter);
        });
    }

    /** Stop local timers and RPCs. The durable PUBLISHING reservation survives shutdown. */
    async close() {
        this.#closed = true;
        for (const [timer, reject] of this.#campaignTimers) {
            clearTimeout(timer);
            reject(new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SELECTOR_CLOSED, 'Epoch appender selector closed'));
        }
        this.#campaignTimers.clear();
        clearInterval(this.#monitorTimer);
        this.#finishReplyWaiter(new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SELECTOR_CLOSED, 'Epoch appender selector closed'));
        await Promise.allSettled([
            this.#opening, this.#monitorTask, this.#reconcileTask?.promise, this.#selectionStateQueue,
        ]);
    }

    async #open() {
        const stored = await this.#operations.load();
        let recoveryChanged = false;
        if (stored) {
            validateSelectionState(stored, this.#publicKey);
            this.#selectionState = upgradeSelectionState(stored, Date.now(), this.#timeoutMs);
            validateSelectionState(this.#selectionState, this.#publicKey);
            recoveryChanged = stored.version !== this.#selectionState.version;
        }
        // Without the durable PUBLISHING marker no append could have started.
        // Keep the durable vote across restart even when a local campaign is withdrawn.
        if (this.#selectionState.active && this.#selectionState.active.phase !== EpochAppenderSelectionPhase.PUBLISHING) {
            this.#selectionState.active = null;
            recoveryChanged = true;
        }
        if (recoveryChanged) {
            await this.#saveSelectionState();
        }
        this.#startOutcomeMonitor();
    }

    #startOutcomeMonitor() {
        if (!this.#monitorEnabled || this.#closed) {
            return;
        }
        this.#monitorTimer = setInterval(() => {
            if (this.#monitorTask || this.#closed || this.#persistenceError) {
                return;
            }
            if (this.#selectionState.active?.phase !== EpochAppenderSelectionPhase.PUBLISHING) {
                return;
            }
            this.#monitorTask = this.reconcile()
                .catch(error => this.#operations.onError?.(error))
                .finally(() => {
                    this.#monitorTask = null;
                });
        }, this.#retryMs);
    }

    #assertAvailable() {
        if (this.#persistenceError) {
            throw this.#persistenceError;
        }
        if (this.#closed) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SELECTOR_CLOSED, 'Epoch appender selector is closed');
        }
    }

    async #saveSelectionState() {
        try {
            await this.#operations.save(copySelectionState(this.#selectionState));
        } catch (cause) {
            // The write may have succeeded. Never grant a reply or publish after uncertainty.
            this.#persistenceError = new EpochAppenderSelectionError(
                EpochAppenderSelectionErrorCode.PERSISTENCE_FAILED,
                'Cannot persist epoch appender selection state',
                { cause }
            );
            throw this.#persistenceError;
        }
    }

    #updateSelectionState(change) {
        const operation = this.#selectionStateQueue.then(async () => {
            await this.open();
            this.#assertAvailable();
            const result = change();
            await this.#saveSelectionState();
            return result;
        });
        // Keep the queue usable; the caller receives the original rejected operation.
        this.#selectionStateQueue = operation.catch(() => {});
        return operation;
    }

    #delayCampaign() {
        const delay = Math.floor(Math.random() * this.#electionJitterMs);
        if (!delay) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#campaignTimers.delete(timer);
                resolve();
            }, delay);
            this.#campaignTimers.set(timer, reject);
        });
    }

    /** A timeout allows a higher term, never a second vote in the same term. */
    #voteFor(request) {
        const vote = this.#selectionState.vote;
        if (vote) {
            if (sameSelectionRequest(vote.request, request)) {
                return vote.expiresAt > Date.now() ? EpochAppenderVoteStatus.GRANTED : EpochAppenderVoteStatus.STALE;
            }
            if (BigInt(request.logicalCounter) <= BigInt(vote.request.logicalCounter)) {
                return EpochAppenderVoteStatus.STALE;
            }
            if (sameSelectionContext(vote.request, request) && vote.expiresAt > Date.now()) {
                return EpochAppenderVoteStatus.BUSY;
            }
        }
        this.#selectionState.vote = {
            request: copySelectionRequest(request), expiresAt: Date.now() + this.#timeoutMs,
        };
        return EpochAppenderVoteStatus.GRANTED;
    }

    #supersededError() {
        return new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.ELECTION_SUPERSEDED,
            'A newer appender election superseded this request');
    }

    #observeRequestCounter(request) {
        if (request.selectionVersion !== EPOCH_APPENDER_SELECTION_VERSION) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.REQUEST_STALE, 'Unsupported appender election version');
        }
        if (request.requester === this.#publicKey) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.UNEXPECTED_PEER, 'Self append request');
        }
        const includesLocal = request.members?.some(member => member.publicKey === this.#publicKey);
        const includesRequester = request.members?.some(member => member.publicKey === request.requester);
        if (!includesLocal || !includesRequester) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.NOT_IN_COHORT, 'Append request does not include both participants');
        }
        if (!/^[1-9]\d*$/.test(request.logicalCounter)) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.LOGICAL_COUNTER_INVALID, 'Invalid append counter');
        }
        const remoteCounter = BigInt(request.logicalCounter);
        if (remoteCounter > EPOCH_APPENDER_SELECTION_MAX_COUNTER) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.LOGICAL_COUNTER_INVALID, 'Append counter exceeds uint64');
        }
        const localCounter = BigInt(this.#selectionState.clock);
        this.#selectionState.clock = (remoteCounter > localCounter ? remoteCounter : localCounter).toString();
    }

    #requireSelectedRequest(requestId) {
        const active = this.#selectionState.active;
        if (!active || active.phase !== EpochAppenderSelectionPhase.HELD || active.request.requestId !== requestId) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.REPLIES_INCOMPLETE, 'Epoch append replies have not been collected');
        }
        if (active.expiresAt <= Date.now() || !sameSelectionRequest(this.#selectionState.vote?.request, active.request)) {
            throw this.#supersededError();
        }
        return active;
    }

    async #validatePublicationContext(request, writerKey) {
        if (!this.#operations.readContext) {
            return;
        }
        const context = await this.#operations.readContext();
        const sameWriters = sameWriterKeys(context.currentWriterKeys, request.currentWriterKeys);
        const includesWriter = context.currentWriterKeys.includes(writerKey);
        if (!sameSelectionContext(context, request) || !sameWriters || !includesWriter) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.CONTEXT_CHANGED, 'Signed context changed in the epoch append queue');
        }
    }

    #expireOwnVote(request) {
        const vote = this.#selectionState.vote;
        if (vote && sameSelectionRequest(vote.request, request)) {
            vote.expiresAt = Math.min(vote.expiresAt, Date.now());
        }
    }

    async #handleReplyTimeout(waiter) {
        if (this.#replyWaiter !== waiter) return;
        if (waiter.request.members.length === 2 && waiter.responded.size === 0) {
            const context = await this.#operations.readContext();
            const held = await this.#updateSelectionState(() => {
                const active = this.#selectionState.active;
                if (this.#replyWaiter !== waiter || !active || active.phase !== EpochAppenderSelectionPhase.REQUESTING ||
                    !sameSelectionRequest(active.request, waiter.request) || !sameSelectionContext(context, waiter.request) ||
                    !sameSelectionRequest(this.#selectionState.vote?.request, waiter.request)) return false;
                active.phase = EpochAppenderSelectionPhase.HELD;
                active.solo = true;
                active.expiresAt = Date.now() + this.#timeoutMs;
                this.#selectionState.vote.expiresAt = active.expiresAt;
                return true;
            });
            if (held) {
                this.#finishReplyWaiter();
                return;
            }
        }
        const timeoutError = this.#createReplyTimeout(waiter);
        const released = await this.#updateSelectionState(() => {
            const active = this.#selectionState.active;
            if (this.#replyWaiter !== waiter || !active || active.phase !== EpochAppenderSelectionPhase.REQUESTING ||
                !sameSelectionRequest(active.request, waiter.request)) return false;
            this.#releaseActiveRequest(active.request);
            return true;
        });
        if (released) this.#finishReplyWaiter(timeoutError);
    }

    /** @returns {EpochAppendReplyWaiter} */
    #createReplyWaiter(request, resolve, reject) {
        return {
            request: copySelectionRequest(request),
            resolve,
            reject,
            pending: new Set(),
            cancellations: new Map(),
            errors: new Map(),
            responded: new Set(),
            pollError: null,
            polling: false,
            retryTimer: null,
            timeoutTimer: null,
        };
    }

    #createReplyTimeout(waiter) {
        const peers = waiter.request.members.filter(member => member.publicKey !== this.#publicKey);
        const missing = peers.filter(member => !this.#receivedReplies.has(member.publicKey));
        const missingPeers = missing.map(({ publicKey }) => ({ publicKey, error: waiter.errors.get(publicKey) ?? null }));
        const missingDescription = missingPeers.map(({ publicKey, error }) => {
            const reason = error ? String(error.message).slice(0, 200) : 'no reply received';
            return `${publicKey} (${reason})`;
        }).join(', ');
        const pollingDescription = waiter.pollError ? `; polling: ${String(waiter.pollError.message).slice(0, 200)}` : '';
        const received = peers.length - missing.length;
        const required = selectionQuorum(waiter.request.members.length) - 1;
        return new EpochAppenderSelectionError(
            EpochAppenderSelectionErrorCode.REPLY_TIMEOUT,
            `Epoch append replies timed out after ${this.#timeoutMs} ms; ` +
            `epoch=${waiter.request.targetEpoch}; replies=${received}/${required}; ` +
            `missing: ${missingDescription}${pollingDescription}`,
            {
                details: {
                    requestId: waiter.request.requestId,
                    targetEpoch: waiter.request.targetEpoch,
                    timeoutMs: this.#timeoutMs,
                    received,
                    required,
                    missingPeers,
                    pollError: waiter.pollError,
                },
            }
        );
    }

    async #pollReplies(waiter) {
        if (this.#replyWaiter !== waiter || waiter.polling || this.#closed) {
            return;
        }
        waiter.polling = true;
        try {
            const context = await this.#operations.readContext();
            if (this.#replyWaiter !== waiter) {
                return;
            }
            if (!sameSelectionContext(context, waiter.request)) {
                await this.cancel(waiter.request.requestId, new EpochAppenderSelectionError(
                    EpochAppenderSelectionErrorCode.CONTEXT_CHANGED,
                    'Signed epoch append context changed while waiting for replies'
                ));
                return;
            }
            await this.#operations.connect?.();
            if (this.#replyWaiter !== waiter) {
                return;
            }
            waiter.pollError = null;
            for (const { publicKey } of waiter.request.members) {
                if (publicKey === this.#publicKey || this.#receivedReplies.has(publicKey) || waiter.pending.has(publicKey)) {
                    continue;
                }
                waiter.pending.add(publicKey);
                // Each RPC proceeds independently; deferred replies must not block other peers.
                this.#requestReply(waiter, publicKey);
            }
        } catch (error) {
            waiter.pollError = error;
            this.#operations.onError?.(error);
        } finally {
            waiter.polling = false;
            if (this.#replyWaiter === waiter) {
                waiter.retryTimer = setTimeout(() => this.#pollReplies(waiter), this.#retryMs);
            }
        }
    }

    async #requestReply(waiter, peer) {
        try {
            const response = await this.#operations.sendRequest(peer, waiter.request, {
                isActive: () => this.#replyWaiter === waiter,
                onPending: cancel => waiter.cancellations.set(peer, cancel),
            });
            if (this.#replyWaiter === waiter && response) {
                await this.receiveReply(response, peer);
            }
        } catch (error) {
            if (this.#replyWaiter === waiter) {
                waiter.errors.set(peer, error);
                this.#operations.onError?.(error);
            }
        } finally {
            waiter.pending.delete(peer);
            waiter.cancellations.delete(peer);
        }
    }

    #finishReplyWaiter(error) {
        const waiter = this.#replyWaiter;
        if (!waiter) {
            return;
        }
        this.#replyWaiter = null;
        clearTimeout(waiter.timeoutTimer);
        clearTimeout(waiter.retryTimer);
        for (const cancel of waiter.cancellations.values()) {
            cancel();
        }
        waiter.cancellations.clear();
        if (error) {
            waiter.reject(error);
        } else {
            waiter.resolve();
        }
    }

    /** Release the local reservation while retaining its durable voting history. */
    #releaseActiveRequest(request) {
        this.#selectionState.active = null;
        this.#expireOwnVote(request);
        this.#receivedReplies.clear();
    }

    async #reconcilePublication(active) {
        const result = await this.#operations.readOutcome(copyAppendPublication(active.publication));
        if (this.#selectionState.active !== active) {
            return null;
        }
        const finalOutcome = result.status === EpochAppendOutcome.REJECTED ||
            result.status === EpochAppendOutcome.EPOCH_ADVANCED;
        const selectionExpired = active.expiresAt <= Date.now() ||
            !sameSelectionRequest(this.#selectionState.vote?.request, active.request);
        if (!finalOutcome && !selectionExpired) {
            return { status: EpochAppendOutcome.UNKNOWN };
        }
        const outcome = { status: finalOutcome ? result.status : EpochAppendOutcome.SELECTION_EXPIRED };
        const released = await this.#updateSelectionState(() => {
            if (this.#selectionState.active !== active) {
                return false;
            }
            this.#completedRequest = { requestId: active.request.requestId, outcome };
            this.#releaseActiveRequest(active.request);
            return true;
        });
        if (!released) {
            return null;
        }
        return { status: outcome.status };
    }

}
