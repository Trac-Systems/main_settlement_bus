import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { generateUUID } from '../../../utils/helpers.js';
import { toHex } from '../../../utils/buffer.js';
import { EPOCH_APPENDER_SELECTION_COUNTER_LIMIT, EPOCH_APPENDER_SELECTION_COUNTER_STEP } from '../../../utils/constants.js';
import { EpochAppenderSelectionError, EpochAppenderSelectionErrorCode } from './EpochAppenderSelectionError.js';
import {
    EpochAppenderSelectionPhase,
    EpochAppendOutcome,
    EpochAppenderVoteStatus,
    EPOCH_APPENDER_SELECTION_VERSION,
    TWO_INDEXER_COHORT_SIZE,
    copySelectionContext,
    copySelectionRequest,
    copyAppendPublication,
    copySelectionReservation,
    sameSelectionContext,
    sameSelectionRequest,
    sameWriterKeys,
    calculateAppenderVoteQuorum,
    createSelectionState,
    upgradeSelectionState,
    copySelectionState,
    validateSelectionState,
    isValidPeerSelectionCounter,
} from './epochAppenderSelectionState.js';

/**
 * @typedef {import('./epochAppenderSelectionState.js').EpochAppendRequest} EpochAppendRequest
 * @typedef {import('./epochAppenderSelectionState.js').EpochAppenderSelectionContext} EpochAppenderSelectionContext
 * @typedef {import('./epochAppenderSelectionState.js').EpochAppendOutcomeResult} EpochAppendOutcomeResult
 *
 * @typedef {import('./EpochAppenderSelectionOperations.js').EpochAppenderSelectionOperations} EpochAppenderSelectionOperations
 *
 * @typedef {object} EpochSelectionReplyCollection
 * @property {EpochAppendRequest} request Request copied when the wait starts.
 * @property {function(): void} resolve Finishes the wait after this node is selected.
 * @property {function(Error): void} reject Ends the wait with an election error.
 * @property {Set<string>} pendingPeers Peers whose requests are still waiting for a reply.
 * @property {Map<string, function(): void>} cancelPendingRequests Cancellation callback for each pending peer request.
 * @property {Map<string, Error>} peerErrors Last request error for each peer.
 * @property {Error|null} pollingError Last error while reading context or connecting to peers.
 * @property {Set<string>} respondingPeers Peers that replied, including those that rejected the request.
 * @property {boolean} isPolling True while the context and connection check is running.
 * @property {ReturnType<typeof setTimeout>|null} retryTimer Timer for requesting missing votes again.
 * @property {ReturnType<typeof setTimeout>|null} selectionDeadlineTimer Timer that ends this election attempt.
 */

/**
 * Selects which indexer may append the epoch. All rounds on this node share one selector. The selector
 * saves votes locally. The round performs the append after selection.
 *
 * Each indexer saves one candidate per election term before sending GRANTED. The candidate counts its
 * own vote and one vote from each peer in the signed membership. A vote can expire, but its candidate
 * and term stay saved after a restart. Another candidate needs a higher term. A random delay helps
 * nodes avoid starting elections at the same time.
 *
 * With two indexers, both votes are requested first. A node may continue alone if the other node does
 * not reply before the timeout. Both nodes can therefore append if they lose contact.
 *
 * A new election can start while an earlier append is still running. The timeout does not cancel that
 * write. The ledger still checks every submitted proof.
 */
export class EpochAppenderSelector {
    #localPublicKey;
    #retryIntervalMs;
    #selectionTimeoutMs;
    #monitorAppendOutcome;
    #maxElectionDelayMs;
    #selectionOperations;
    #openPromise;
    #selectionStateQueue = Promise.resolve();
    #selectionState = createSelectionState();
    #grantedPeerVotes = new Set();
    #electionDelayTimers = new Map();
    #replyCollection = null;
    #closed = false;
    #persistenceError = null;
    #completedRequest = null;
    #outcomeMonitorTimer = null;
    #outcomeMonitorPromise = null;
    #appendOutcomeCheck = null;

    /**
     * Creates the selector shared by all rounds on this node. Its state is saved locally and loaded
     * again after restart. The service that creates it is responsible for closing it.
     *
     * @param {string} localPublicKey Authenticated local wallet public key, encoded as hex.
     * @param {EpochAppenderSelectionOperations} selectionOperations Local storage, signed ledger reads and peer requests.
     * @param {number} [retryIntervalMs=1000] Delay between vote retries and background outcome checks.
     * @param {number} [selectionTimeoutMs=20000] Timeout for selection and append progress in milliseconds.
     * @param {boolean} [monitorAppendOutcome=false] Keep checking append results after the round ends.
     * @param {number} [maxElectionDelayMs=0] Maximum random delay before saving a vote for this node.
     */
    constructor(localPublicKey, selectionOperations, retryIntervalMs = 1000, selectionTimeoutMs = 20_000, monitorAppendOutcome = false, maxElectionDelayMs = 0) {
        this.#localPublicKey = localPublicKey;
        this.#retryIntervalMs = retryIntervalMs;
        this.#selectionTimeoutMs = selectionTimeoutMs;
        this.#monitorAppendOutcome = monitorAppendOutcome;
        this.#maxElectionDelayMs = maxElectionDelayMs;
        this.#selectionOperations = selectionOperations;
    }

    /**
     * Returns a copy of the current request, reserved payload and append details.
     *
     * @returns {import('./epochAppenderSelectionState.js').EpochAppenderSelectionReservation|null} Null when this node has no reservation.
     */
    get activeReservation() {
        return copySelectionReservation(this.#selectionState.active);
    }

    /**
     * Returns the saved result of the last completed request if its ID matches. This method does not
     * read the ledger.
     *
     * @param {string} requestId ID of the selection request created by a round.
     * @returns {EpochAppendOutcomeResult|null} Saved result if the request ID matches.
     */
    getRecordedAppendOutcome(requestId) {
        if (this.#completedRequest?.requestId !== requestId) {
            return null;
        }
        return { status: this.#completedRequest.outcome.status };
    }

    /**
     * Loads saved votes and any append waiting for a result. Initialization runs once. If it fails,
     * later calls return the same error and keep the saved state for inspection.
     *
     * @returns {Promise<void>} The same promise is returned on later calls.
     */
    open() {
        if (!this.#openPromise) {
            this.#openPromise = this.#recoverSelectionState();
        }
        return this.#openPromise;
    }

    /**
     * Copies the epoch payload and creates a request for the next election term. The saved payload
     * stays the same throughout this request.
     *
     * @param {EpochAppenderSelectionContext} signedSelectionContext Signed epoch, config and indexers used for this election.
     * @param {Buffer} payload Complete SET_EPOCH operation to reserve for this request.
     * @returns {Promise<EpochAppendRequest>}
     * @throws {EpochAppenderSelectionError} If an earlier append still needs a result or saving fails.
     */
    async createSelectionRequest(signedSelectionContext, payload) {
        const frozenPayload = b4a.from(payload);
        const payloadHash = toHex(await tracCryptoApi.hash.blake3(frozenPayload));
        if (signedSelectionContext.members.length > 1) {
            await this.#waitBeforeElection();
        }
        const currentSignedContext = await this.#selectionOperations.readContext?.();
        if (this.#selectionOperations.readContext && !sameSelectionContext(signedSelectionContext, currentSignedContext)) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.CONTEXT_CHANGED, 'Epoch changed before starting the appender election');
        }
        return this.#persistStateChange(() => {
            this.#recoverElectionClock(currentSignedContext);
            this.#requireCurrentElectionEpoch(signedSelectionContext.targetEpoch);
            if (this.#selectionState.active) {
                throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.PUBLICATION_UNRESOLVED, 'A previous epoch publication is unresolved');
            }
            if (!signedSelectionContext.members.some(member => member.publicKey === this.#localPublicKey)) {
                throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.NOT_IN_COHORT, 'Local indexer is not in this epoch coordination cohort');
            }
            const recordedVote = this.#selectionState.vote;
            if (recordedVote && sameSelectionContext(recordedVote.request, signedSelectionContext) && recordedVote.expiresAt > Date.now()) {
                throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.ELECTION_BUSY,
                    'Waiting for the current appender election to finish or expire',
                    { details: { requester: recordedVote.request.requester, term: recordedVote.request.logicalCounter } });
            }
            const nextElectionCounter = this.#selectionState.clock + 1n;
            if (nextElectionCounter > EPOCH_APPENDER_SELECTION_COUNTER_LIMIT) {
                throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.LOGICAL_CLOCK_EXHAUSTED,
                    'Epoch append clock exhausted; recovery requires a newer signed epoch');
            }
            this.#selectionState.clock = nextElectionCounter;
            const selectionRequest = {
                ...copySelectionContext(signedSelectionContext),
                requestId: generateUUID(),
                payloadHash,
                logicalCounter: nextElectionCounter,
                requester: this.#localPublicKey,
                selectionVersion: EPOCH_APPENDER_SELECTION_VERSION,
            };
            const expiresAt = Date.now() + this.#selectionTimeoutMs;
            this.#selectionState.vote = { request: copySelectionRequest(selectionRequest), expiresAt };
            this.#grantedPeerVotes.clear();
            this.#selectionState.active = {
                request: selectionRequest,
                payload: toHex(frozenPayload),
                phase: signedSelectionContext.members.length === 1 ? EpochAppenderSelectionPhase.HELD : EpochAppenderSelectionPhase.REQUESTING,
                publication: null,
                expiresAt,
                solo: false,
            };
            return copySelectionRequest(selectionRequest);
        });
    }

    /**
     * Saves the vote locally before sending a reply. The protocol handler must first check the sender
     * identity and the signed election context.
     *
     * @param {EpochAppendRequest} selectionRequest Candidate, election term and payload hash.
     * @param {function(import('./epochAppenderSelectionState.js').EpochAppendReply): Promise<void>} sendVoteReply Sends the reply after the vote is saved locally.
     * @returns {Promise<boolean>} True when this node granted its vote.
     */
    async handleSelectionRequest(selectionRequest, sendVoteReply) {
        await this.open();
        let currentSignedContext;
        if (this.#selectionState.clock >= EPOCH_APPENDER_SELECTION_COUNTER_LIMIT) {
            currentSignedContext = await this.#selectionOperations.readContext?.();
            if (currentSignedContext && !sameSelectionContext(selectionRequest, currentSignedContext)) {
                throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.CONTEXT_CHANGED, 'Epoch changed before recovering the election clock');
            }
        }
        const response = await this.#persistStateChange(() => {
            this.#recoverElectionClock(currentSignedContext);
            if (!this.#validateRequestAndAdvanceClock(selectionRequest)) {
                return null;
            }
            const voteStatus = this.#recordVote(selectionRequest);
            const activeReservation = this.#selectionState.active;
            if (voteStatus === EpochAppenderVoteStatus.GRANTED && activeReservation &&
                activeReservation.phase !== EpochAppenderSelectionPhase.PUBLISHING) {
                this.#selectionState.active = null;
                this.#grantedPeerVotes.clear();
            }
            return {
                ...copySelectionRequest(selectionRequest),
                voteStatus,
                observedCounter: this.#selectionState.clock,
                vote: copySelectionRequest(this.#selectionState.vote.request),
            };
        });
        // A peer far ahead retries while this node catches up in bounded steps.
        // Never save a vote whose term is beyond the local clock.
        if (!response) {
            return false;
        }
        if (this.#replyCollection && !this.#selectionState.active) {
            this.#finishReplyCollection(this.#createSupersededElectionError());
        }
        this.#assertSelectorAvailable();
        await sendVoteReply(response);
        return response.voteStatus === EpochAppenderVoteStatus.GRANTED;
    }

    /**
     * Handles a peer vote for the current request. Each peer counts once. A reply with a higher
     * election term ends the current selection attempt.
     *
     * @param {import('./epochAppenderSelectionState.js').EpochAppendReply} selectionReply Validated reply with the peer's saved vote.
     * @param {string} peerPublicKey Verified wallet public key of the peer, encoded as hex.
     * @returns {Promise<boolean>} True when this node has enough votes.
     */
    async handleSelectionReply(selectionReply, peerPublicKey) {
        let failure;
        const selectionGranted = await this.#persistStateChange(() => {
            const activeReservation = this.#selectionState.active;
            if (!activeReservation || activeReservation.phase !== EpochAppenderSelectionPhase.REQUESTING || !sameSelectionRequest(activeReservation.request, selectionReply)) {
                return false;
            }
            const isMember = activeReservation.request.members.some(member => member.publicKey === peerPublicKey);
            if (peerPublicKey === this.#localPublicKey || !isMember) {
                throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.UNEXPECTED_PEER, 'Reply from an unexpected epoch member');
            }
            if (!isValidPeerSelectionCounter(selectionReply.observedCounter) ||
                !isValidPeerSelectionCounter(selectionReply.vote?.logicalCounter) ||
                !selectionReply.vote || selectionReply.vote.networkId !== activeReservation.request.networkId ||
                selectionReply.vote.bootstrap !== activeReservation.request.bootstrap ||
                selectionReply.observedCounter < selectionReply.logicalCounter ||
                selectionReply.observedCounter < selectionReply.vote.logicalCounter) {
                throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.REQUEST_STALE, 'Invalid appender vote response');
            }
            this.#replyCollection?.respondingPeers.add(peerPublicKey);
            this.#observePeerCounter(selectionReply.observedCounter);
            if (selectionReply.vote.logicalCounter > activeReservation.request.logicalCounter) {
                failure = this.#createSupersededElectionError();
                this.#releaseReservation(activeReservation.request);
                return false;
            }
            if (selectionReply.voteStatus !== EpochAppenderVoteStatus.GRANTED ||
                !sameSelectionRequest(selectionReply.vote, activeReservation.request) ||
                !sameSelectionRequest(this.#selectionState.vote?.request, activeReservation.request) ||
                activeReservation.expiresAt <= Date.now()) {
                this.#replyCollection?.peerErrors.set(peerPublicKey, new EpochAppenderSelectionError(
                    EpochAppenderSelectionErrorCode.ELECTION_BUSY,
                    `Vote unavailable; candidate=${selectionReply.vote.requester}; term=${selectionReply.vote.logicalCounter}`
                ));
                const unansweredPeerCount = activeReservation.request.members.length - 1 - (this.#replyCollection?.respondingPeers.size ?? 0);
                if (this.#replyCollection && 1 + this.#grantedPeerVotes.size + unansweredPeerCount < calculateAppenderVoteQuorum(activeReservation.request.members.length)) {
                    failure = new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.REPLIES_INCOMPLETE,
                        'This appender election cannot reach a majority; retry in a higher term');
                    this.#releaseReservation(activeReservation.request);
                }
                return false;
            }
            this.#replyCollection?.peerErrors.delete(peerPublicKey);
            this.#grantedPeerVotes.add(peerPublicKey);
            if (this.#grantedPeerVotes.size + 1 >= calculateAppenderVoteQuorum(activeReservation.request.members.length)) {
                activeReservation.phase = EpochAppenderSelectionPhase.HELD;
            }
            return activeReservation.phase === EpochAppenderSelectionPhase.HELD;
        });
        if (selectionGranted) {
            this.#finishReplyCollection();
        } else if (this.#replyCollection && !this.#selectionState.active) {
            this.#finishReplyCollection(failure ?? this.#createSupersededElectionError());
        }
        return selectionGranted;
    }

    /**
     * Cancels a local selection request before the append starts. Once PUBLISHING is saved, the
     * request stays active because its payload may already be in the writer log.
     *
     * @param {string} requestId ID of the request to cancel.
     * @param {Error} [cancellationReason] Error delivered to the waiting round.
     * @returns {Promise<boolean>} False if the request is no longer active or its append has started.
     */
    async cancel(requestId, cancellationReason) {
        const reservationReleased = await this.#persistStateChange(() => {
            const activeReservation = this.#selectionState.active;
            if (!activeReservation || activeReservation.request.requestId !== requestId || activeReservation.phase === EpochAppenderSelectionPhase.PUBLISHING) {
                return false;
            }
            this.#releaseReservation(activeReservation.request);
            return true;
        });
        if (reservationReleased) {
            const error = cancellationReason ?? new EpochAppenderSelectionError(
                EpochAppenderSelectionErrorCode.REQUEST_CANCELLED,
                'Epoch append request cancelled',
                { details: { requestId } }
            );
            this.#finishReplyCollection(error);
        }
        return reservationReleased;
    }

    /**
     * Returns a copy of the selected SET_EPOCH payload while the selection is still valid. The caller
     * must also authorize the append inside the write queue.
     *
     * @param {string} requestId ID of the selected request.
     * @returns {Promise<Buffer>} Copy of the selected payload.
     * @throws {EpochAppenderSelectionError} If the selection is missing, replaced or expired.
     */
    async getSelectedEpochPayload(requestId) {
        await this.open();
        this.#assertSelectorAvailable();
        const activeReservation = this.#requireSelectedReservation(requestId);
        return b4a.from(activeReservation.payload, 'hex');
    }

    /**
     * Checks the selection again inside the State write queue and saves the append details. The caller
     * can append after this method finishes. A later election may replace this selection, but it
     * cannot cancel a write that has already started.
     *
     * @param {string} requestId ID of the selected request.
     * @param {{writerKey: string, from: number}} appendLocation Writer key and its length before the append.
     * @returns {Promise<void>}
     */
    async authorizeEpochAppend(requestId, appendLocation) {
        await this.open();
        this.#assertSelectorAvailable();
        const activeReservation = this.#requireSelectedReservation(requestId);
        await this.#validateAppendContext(activeReservation.request, appendLocation.writerKey);
        await this.#persistStateChange(() => {
            if (this.#selectionState.active !== activeReservation || activeReservation.phase !== EpochAppenderSelectionPhase.HELD) {
                throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.REQUEST_STALE, 'Epoch append request expired before publication');
            }
            this.#requireSelectedReservation(requestId);
            activeReservation.phase = EpochAppenderSelectionPhase.PUBLISHING;
            activeReservation.publication = {
                writerKey: appendLocation.writerKey,
                from: appendLocation.from,
                payloadHash: activeReservation.request.payloadHash,
                targetEpoch: activeReservation.request.targetEpoch,
            };
        });
        this.#assertSelectorAvailable();
        if (activeReservation.expiresAt <= Date.now() || !sameSelectionRequest(this.#selectionState.vote?.request, activeReservation.request)) {
            throw this.#createSupersededElectionError();
        }
    }

    /**
     * Checks the signed append result or expires the selection so a new election can start. An expired
     * selection does not mean the old append was cancelled. Calls for the same append share one
     * pending read.
     *
     * @returns {Promise<EpochAppendOutcomeResult|null>} Null if there is no pending append or another request replaced it.
     */
    async refreshAppendOutcome() {
        await this.open();
        this.#assertSelectorAvailable();
        const activeReservation = this.#selectionState.active;
        if (!activeReservation || activeReservation.phase !== EpochAppenderSelectionPhase.PUBLISHING) {
            return null;
        }
        if (this.#appendOutcomeCheck?.active === activeReservation) {
            return this.#appendOutcomeCheck.promise;
        }
        const outcomeCheck = { active: activeReservation, promise: null };
        outcomeCheck.promise = this.#resolvePublicationOutcome(activeReservation).finally(() => {
            if (this.#appendOutcomeCheck === outcomeCheck) {
                this.#appendOutcomeCheck = null;
            }
        });
        this.#appendOutcomeCheck = outcomeCheck;
        return outcomeCheck.promise;
    }

    /**
     * Waits until the local vote and peer replies select this candidate. With two indexers, the node
     * may continue alone after a timeout if the peer has not replied. A rejection does not allow this
     * fallback. Cancellation, context changes and missing votes end the wait.
     *
     * @param {EpochAppendRequest} selectionRequest Request created by createSelectionRequest().
     * @returns {Promise<void>} Resolves when this node is selected.
     */
    async waitForAppenderSelection(selectionRequest) {
        await this.open();
        this.#assertSelectorAvailable();
        if (this.#selectionState.active?.request.requestId !== selectionRequest.requestId) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.REQUEST_STALE, 'Stale epoch append request');
        }
        if (this.#selectionState.active.phase === EpochAppenderSelectionPhase.HELD) {
            return;
        }
        if (this.#replyCollection) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.ALREADY_WAITING, 'Already waiting for epoch append replies');
        }
        return new Promise((resolve, reject) => {
            const replyCollection = this.#createReplyCollection(selectionRequest, resolve, reject);
            this.#replyCollection = replyCollection;
            replyCollection.selectionDeadlineTimer = setTimeout(() => {
                this.#handleSelectionTimeout(replyCollection)
                    .catch(error => {
                        if (this.#replyCollection === replyCollection) {
                            this.#finishReplyCollection(error);
                        }
                    });
            }, Math.max(0, this.#selectionState.active.expiresAt - Date.now()));
            this.#requestMissingVotes(replyCollection);
        });
    }

    /**
     * Stops timers, rejects pending selection requests and waits for storage and outcome reads to
     * finish. Saved votes and append details remain available after restart.
     *
     * @returns {Promise<void>}
     */
    async close() {
        this.#closed = true;
        for (const [timer, reject] of this.#electionDelayTimers) {
            clearTimeout(timer);
            reject(new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SELECTOR_CLOSED, 'Epoch appender selector closed'));
        }
        this.#electionDelayTimers.clear();
        clearInterval(this.#outcomeMonitorTimer);
        this.#finishReplyCollection(new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SELECTOR_CLOSED, 'Epoch appender selector closed'));
        await Promise.allSettled([
            this.#openPromise, this.#outcomeMonitorPromise, this.#appendOutcomeCheck?.promise, this.#selectionStateQueue,
        ]);
    }

    /**
     * Loads and checks the saved state, then updates older records to the current format. Clears
     * requests that never started an append. Keeps saved votes and resumes checking any append that
     * still needs a result.
     *
     * @returns {Promise<void>}
     */
    async #recoverSelectionState() {
        const storedSelectionState = await this.#selectionOperations.load();
        let selectionStateChanged = false;
        if (storedSelectionState) {
            validateSelectionState(storedSelectionState, this.#localPublicKey);
            this.#selectionState = upgradeSelectionState(storedSelectionState, Date.now(), this.#selectionTimeoutMs);
            validateSelectionState(this.#selectionState, this.#localPublicKey);
            selectionStateChanged = storedSelectionState.version !== this.#selectionState.version;
        }
        // Without the durable PUBLISHING marker no append could have started.
        // Keep the durable vote across restart even when a local campaign is withdrawn.
        if (this.#selectionState.active && this.#selectionState.active.phase !== EpochAppenderSelectionPhase.PUBLISHING) {
            this.#selectionState.active = null;
            selectionStateChanged = true;
        }
        selectionStateChanged = this.#recoverElectionClock(undefined, true) || selectionStateChanged;
        if (selectionStateChanged) {
            await this.#saveSelectionState();
        }
        this.#startAppendOutcomeMonitor();
    }

    /**
     * Checks append results even after the round has ended. The monitor and the round share the same
     * pending read for each append.
     *
     * @returns {void}
     */
    #startAppendOutcomeMonitor() {
        if (!this.#monitorAppendOutcome || this.#closed) {
            return;
        }
        this.#outcomeMonitorTimer = setInterval(() => {
            if (this.#outcomeMonitorPromise || this.#closed || this.#persistenceError) {
                return;
            }
            if (this.#selectionState.active?.phase !== EpochAppenderSelectionPhase.PUBLISHING) {
                return;
            }
            this.#outcomeMonitorPromise = this.refreshAppendOutcome()
                .catch(error => this.#selectionOperations.onError?.(error))
                .finally(() => {
                    this.#outcomeMonitorPromise = null;
                });
        }, this.#retryIntervalMs);
    }

    /**
     * Stops work after shutdown or a storage error. A failed save may still have reached the disk, so
     * another vote could conflict with the saved state.
     *
     * @throws {EpochAppenderSelectionError} If the selector is closed or an earlier save failed.
     */
    #assertSelectorAvailable() {
        if (this.#persistenceError) {
            throw this.#persistenceError;
        }
        if (this.#closed) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SELECTOR_CLOSED, 'Epoch appender selector is closed');
        }
    }

    /**
     * Saves a copy of the local selection state. A storage error blocks further work because the write
     * may have reached the disk even though saving failed.
     *
     * @returns {Promise<void>}
     */
    async #saveSelectionState() {
        try {
            await this.#selectionOperations.save(copySelectionState(this.#selectionState));
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

    /**
     * Queues one local state change and saves it before returning its result. Network requests, ledger
     * reads and appends run outside this queue.
     *
     * @template T
     * @param {function(): T} applyStateChange Callback that changes the local selection state without awaiting other work.
     * @returns {Promise<T>} Callback result after the state is saved.
     */
    #persistStateChange(applyStateChange) {
        const operation = this.#selectionStateQueue.then(async () => {
            await this.open();
            this.#assertSelectorAvailable();
            const result = applyStateChange();
            await this.#saveSelectionState();
            return result;
        });
        // Keep the queue usable; the caller receives the original rejected operation.
        this.#selectionStateQueue = operation.catch(() => {});
        return operation;
    }

    /**
     * Waits for a random delay before starting an election. This helps nodes avoid voting for
     * themselves at the same time. Closing the selector cancels the wait.
     *
     * @returns {Promise<void>}
     */
    #waitBeforeElection() {
        const delay = Math.floor(Math.random() * this.#maxElectionDelayMs);
        if (!delay) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#electionDelayTimers.delete(timer);
                resolve();
            }, delay);
            this.#electionDelayTimers.set(timer, reject);
        });
    }

    /**
     * Checks saved votes and returns GRANTED, BUSY or STALE. When a vote expires, another candidate
     * still needs a higher term. The caller saves the decision before replying.
     *
     * @param {EpochAppendRequest} selectionRequest Authenticated candidate request.
     * @returns {number} One of EpochAppenderVoteStatus. Save it before sending the reply.
     */
    #recordVote(selectionRequest) {
        const recordedVote = this.#selectionState.vote;
        if (recordedVote) {
            if (sameSelectionRequest(recordedVote.request, selectionRequest)) {
                return recordedVote.expiresAt > Date.now() ? EpochAppenderVoteStatus.GRANTED : EpochAppenderVoteStatus.STALE;
            }
            if (selectionRequest.logicalCounter <= recordedVote.request.logicalCounter) {
                return EpochAppenderVoteStatus.STALE;
            }
            if (sameSelectionContext(recordedVote.request, selectionRequest) && recordedVote.expiresAt > Date.now()) {
                return EpochAppenderVoteStatus.BUSY;
            }
        }
        this.#selectionState.vote = {
            request: copySelectionRequest(selectionRequest), expiresAt: Date.now() + this.#selectionTimeoutMs,
        };
        return EpochAppenderVoteStatus.GRANTED;
    }

    /**
     * Creates an error when another election has replaced the local request.
     *
     * @returns {EpochAppenderSelectionError}
     */
    #createSupersededElectionError() {
        return new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.ELECTION_SUPERSEDED,
            'A newer appender election superseded this request');
    }

    /**
     * Checks the request version, members and counter. Moves the local clock towards the peer term
     * by at most one step. A request further ahead must retry before this node can vote for it.
     *
     * @param {EpochAppendRequest} selectionRequest Validated network request.
     * @throws {EpochAppenderSelectionError} Invalid identity, membership or counter.
     * @returns {boolean} True when the requested term is within the updated local clock.
     */
    #validateRequestAndAdvanceClock(selectionRequest) {
        if (selectionRequest.selectionVersion !== EPOCH_APPENDER_SELECTION_VERSION) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.REQUEST_STALE, 'Unsupported appender election version');
        }
        if (selectionRequest.requester === this.#localPublicKey) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.UNEXPECTED_PEER, 'Self append request');
        }
        const includesLocal = selectionRequest.members?.some(member => member.publicKey === this.#localPublicKey);
        const includesRequester = selectionRequest.members?.some(member => member.publicKey === selectionRequest.requester);
        if (!includesLocal || !includesRequester) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.NOT_IN_COHORT, 'Append request does not include both participants');
        }
        this.#requireCurrentElectionEpoch(selectionRequest.targetEpoch);
        if (!isValidPeerSelectionCounter(selectionRequest.logicalCounter)) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.LOGICAL_COUNTER_INVALID, 'Invalid append counter');
        }
        if (this.#selectionState.clock > EPOCH_APPENDER_SELECTION_COUNTER_LIMIT) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.LOGICAL_CLOCK_EXHAUSTED,
                'Epoch append clock exhausted; recovery requires a newer signed epoch');
        }
        return this.#observePeerCounter(selectionRequest.logicalCounter);
    }

    /**
     * Returns the HELD reservation if the request matches and the local vote is still valid.
     *
     * @param {string} requestId Local selection identity.
     * @returns {import('./epochAppenderSelectionState.js').EpochAppenderSelectionReservation} Internal reservation. Do not return it to external callers.
     * @throws {EpochAppenderSelectionError} If the selection is missing, expired or replaced.
     */
    #requireSelectedReservation(requestId) {
        const activeReservation = this.#selectionState.active;
        if (!activeReservation || activeReservation.phase !== EpochAppenderSelectionPhase.HELD || activeReservation.request.requestId !== requestId) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.REPLIES_INCOMPLETE, 'Epoch append replies have not been collected');
        }
        if (activeReservation.expiresAt <= Date.now() || !sameSelectionRequest(this.#selectionState.vote?.request, activeReservation.request)) {
            throw this.#createSupersededElectionError();
        }
        return activeReservation;
    }

    /**
     * Reads the signed context again before authorizing the append in the write queue. The epoch,
     * consensus config and indexers must still match the selected request.
     *
     * @param {EpochAppendRequest} selectionRequest Selection being used by the append.
     * @param {string} writerKey Actual local writer receiving the payload.
     * @returns {Promise<void>}
     */
    async #validateAppendContext(selectionRequest, writerKey) {
        if (!this.#selectionOperations.readContext) {
            return;
        }
        const signedSelectionContext = await this.#selectionOperations.readContext();
        const sameWriters = sameWriterKeys(signedSelectionContext.currentWriterKeys, selectionRequest.currentWriterKeys);
        const includesWriter = signedSelectionContext.currentWriterKeys.includes(writerKey);
        if (!sameSelectionContext(signedSelectionContext, selectionRequest) || !sameWriters || !includesWriter) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.CONTEXT_CHANGED, 'Signed context changed in the epoch append queue');
        }
    }

    /**
     * Expires the local vote while keeping its candidate and election term.
     *
     * @param {EpochAppendRequest} selectionRequest Request whose vote should expire.
     */
    #expireLocalVote(selectionRequest) {
        const recordedVote = this.#selectionState.vote;
        if (recordedVote && sameSelectionRequest(recordedVote.request, selectionRequest)) {
            recordedVote.expiresAt = Math.min(recordedVote.expiresAt, Date.now());
        }
    }

    /**
     * Allows a node in a pair to continue alone only if the other node has not replied. Otherwise,
     * cancels the selection attempt and reports which votes are missing.
     *
     * @param {EpochSelectionReplyCollection} replyCollection Reply collection that reached its timeout.
     * @returns {Promise<void>}
     */
    async #handleSelectionTimeout(replyCollection) {
        if (this.#replyCollection !== replyCollection) return;
        if (replyCollection.request.members.length === TWO_INDEXER_COHORT_SIZE && replyCollection.respondingPeers.size === 0) {
            const signedSelectionContext = await this.#selectionOperations.readContext();
            const selectionGranted = await this.#persistStateChange(() => {
                const activeReservation = this.#selectionState.active;
                if (this.#replyCollection !== replyCollection || !activeReservation || activeReservation.phase !== EpochAppenderSelectionPhase.REQUESTING ||
                    !sameSelectionRequest(activeReservation.request, replyCollection.request) || !sameSelectionContext(signedSelectionContext, replyCollection.request) ||
                    !sameSelectionRequest(this.#selectionState.vote?.request, replyCollection.request)) return false;
                activeReservation.phase = EpochAppenderSelectionPhase.HELD;
                activeReservation.solo = true;
                activeReservation.expiresAt = Date.now() + this.#selectionTimeoutMs;
                this.#selectionState.vote.expiresAt = activeReservation.expiresAt;
                return true;
            });
            if (selectionGranted) {
                this.#finishReplyCollection();
                return;
            }
        }
        const timeoutError = this.#createSelectionTimeoutError(replyCollection);
        const reservationReleased = await this.#persistStateChange(() => {
            const activeReservation = this.#selectionState.active;
            if (this.#replyCollection !== replyCollection || !activeReservation || activeReservation.phase !== EpochAppenderSelectionPhase.REQUESTING ||
                !sameSelectionRequest(activeReservation.request, replyCollection.request)) return false;
            this.#releaseReservation(activeReservation.request);
            return true;
        });
        if (reservationReleased) this.#finishReplyCollection(timeoutError);
    }

    /**
     * Creates the reply collection for one election, including its timers and pending requests.
     *
     * @param {EpochAppendRequest} selectionRequest Request used throughout this election.
     * @param {function(): void} resolve Completes the waiting round after selection.
     * @param {function(Error): void} reject Reports election failure to that round.
     * @returns {EpochSelectionReplyCollection}
     */
    #createReplyCollection(selectionRequest, resolve, reject) {
        return {
            request: copySelectionRequest(selectionRequest),
            resolve,
            reject,
            pendingPeers: new Set(),
            cancelPendingRequests: new Map(),
            peerErrors: new Map(),
            respondingPeers: new Set(),
            pollingError: null,
            isPolling: false,
            retryTimer: null,
            selectionDeadlineTimer: null,
        };
    }

    /**
     * Builds a timeout error with the missing votes and recent connection errors.
     *
     * @param {EpochSelectionReplyCollection} replyCollection Replies and errors collected before the timeout.
     * @returns {EpochAppenderSelectionError}
     */
    #createSelectionTimeoutError(replyCollection) {
        const peers = replyCollection.request.members.filter(member => member.publicKey !== this.#localPublicKey);
        const missing = peers.filter(member => !this.#grantedPeerVotes.has(member.publicKey));
        const missingPeers = missing.map(({ publicKey }) => ({ publicKey, error: replyCollection.peerErrors.get(publicKey) ?? null }));
        const missingDescription = missingPeers.map(({ publicKey, error }) => {
            const peerErrorDescription = error ? String(error.message).slice(0, 200) : 'no reply received';
            return `${publicKey} (${peerErrorDescription})`;
        }).join(', ');
        const pollingDescription = replyCollection.pollingError ? `; polling: ${String(replyCollection.pollingError.message).slice(0, 200)}` : '';
        const received = peers.length - missing.length;
        const required = calculateAppenderVoteQuorum(replyCollection.request.members.length) - 1;
        return new EpochAppenderSelectionError(
            EpochAppenderSelectionErrorCode.REPLY_TIMEOUT,
            `Epoch append replies timed out after ${this.#selectionTimeoutMs} ms; ` +
            `epoch=${replyCollection.request.targetEpoch}; replies=${received}/${required}; ` +
            `missing: ${missingDescription}${pollingDescription}`,
            {
                details: {
                    requestId: replyCollection.request.requestId,
                    targetEpoch: replyCollection.request.targetEpoch,
                    timeoutMs: this.#selectionTimeoutMs,
                    received,
                    required,
                    missingPeers,
                    pollError: replyCollection.pollingError,
                },
            }
        );
    }

    /**
     * Checks the signed context, connects to indexers and requests missing votes. Requests run
     * independently. A reply is ignored if its collection is no longer active.
     *
     * @param {EpochSelectionReplyCollection} replyCollection Reply collection for the current election.
     * @returns {Promise<void>}
     */
    async #requestMissingVotes(replyCollection) {
        if (this.#replyCollection !== replyCollection || replyCollection.isPolling || this.#closed) {
            return;
        }
        replyCollection.isPolling = true;
        try {
            const signedSelectionContext = await this.#selectionOperations.readContext();
            if (this.#replyCollection !== replyCollection) {
                return;
            }
            if (!sameSelectionContext(signedSelectionContext, replyCollection.request)) {
                await this.cancel(replyCollection.request.requestId, new EpochAppenderSelectionError(
                    EpochAppenderSelectionErrorCode.CONTEXT_CHANGED,
                    'Signed epoch append context changed while waiting for replies'
                ));
                return;
            }
            await this.#selectionOperations.connect?.();
            if (this.#replyCollection !== replyCollection) {
                return;
            }
            replyCollection.pollingError = null;
            for (const { publicKey } of replyCollection.request.members) {
                if (publicKey === this.#localPublicKey || this.#grantedPeerVotes.has(publicKey) || replyCollection.pendingPeers.has(publicKey)) {
                    continue;
                }
                replyCollection.pendingPeers.add(publicKey);
                // Each RPC proceeds independently; deferred replies must not block other peers.
                this.#requestPeerVote(replyCollection, publicKey);
            }
        } catch (error) {
            replyCollection.pollingError = error;
            this.#selectionOperations.onError?.(error);
        } finally {
            replyCollection.isPolling = false;
            if (this.#replyCollection === replyCollection) {
                replyCollection.retryTimer = setTimeout(() => this.#requestMissingVotes(replyCollection), this.#retryIntervalMs);
            }
        }
    }

    /**
     * Requests one peer vote and passes its reply to the selector.
     *
     * @param {EpochSelectionReplyCollection} replyCollection Reply collection that tracks this peer request.
     * @param {string} peerPublicKey Target wallet public key, encoded as hex.
     * @returns {Promise<void>}
     */
    async #requestPeerVote(replyCollection, peerPublicKey) {
        try {
            const response = await this.#selectionOperations.sendRequest(peerPublicKey, replyCollection.request, {
                isActive: () => this.#replyCollection === replyCollection,
                onPending: cancel => replyCollection.cancelPendingRequests.set(peerPublicKey, cancel),
            });
            if (this.#replyCollection === replyCollection && response) {
                await this.handleSelectionReply(response, peerPublicKey);
            }
        } catch (error) {
            if (this.#replyCollection === replyCollection) {
                replyCollection.peerErrors.set(peerPublicKey, error);
                this.#selectionOperations.onError?.(error);
            }
        } finally {
            replyCollection.pendingPeers.delete(peerPublicKey);
            replyCollection.cancelPendingRequests.delete(peerPublicKey);
        }
    }

    /**
     * Clears the election timers and pending requests, then resolves or rejects the waiting round.
     *
     * @param {Error} [error] Error returned to the round. Omit it after successful selection.
     */
    #finishReplyCollection(error) {
        const replyCollection = this.#replyCollection;
        if (!replyCollection) {
            return;
        }
        this.#replyCollection = null;
        clearTimeout(replyCollection.selectionDeadlineTimer);
        clearTimeout(replyCollection.retryTimer);
        for (const cancel of replyCollection.cancelPendingRequests.values()) {
            cancel();
        }
        replyCollection.cancelPendingRequests.clear();
        if (error) {
            replyCollection.reject(error);
        } else {
            replyCollection.resolve();
        }
    }

    /**
     * Releases the local payload and expires its vote. Keeps the candidate identity and the highest
     * known election term.
     *
     * @param {EpochAppendRequest} selectionRequest Reservation whose vote expires.
     */
    #releaseReservation(selectionRequest) {
        this.#selectionState.active = null;
        this.#expireLocalVote(selectionRequest);
        this.#grantedPeerVotes.clear();
    }

    /**
     * Reads the result for this append and releases the matching reservation when it is finished or
     * expired. A signed result takes priority over expiry. Missing data and read errors do not prove
     * rejection. The old append may still finish after the selection expires.
     *
     * @param {import('./epochAppenderSelectionState.js').EpochAppenderSelectionReservation} activeReservation Reservation being checked when the ledger read starts.
     * @returns {Promise<EpochAppendOutcomeResult|null>} Null if another reservation replaced it.
     */
    async #resolvePublicationOutcome(activeReservation) {
        let result = { status: EpochAppendOutcome.UNKNOWN };
        let readError;
        try {
            result = await this.#selectionOperations.readOutcome(copyAppendPublication(activeReservation.publication));
        } catch (error) {
            readError = error;
        }
        if (this.#selectionState.active !== activeReservation) {
            return null;
        }
        const finalOutcome = result.status === EpochAppendOutcome.REJECTED ||
            result.status === EpochAppendOutcome.EPOCH_ADVANCED;
        const selectionExpired = activeReservation.expiresAt <= Date.now() ||
            !sameSelectionRequest(this.#selectionState.vote?.request, activeReservation.request);
        // A failed ledger read cannot extend the election deadline or prove rejection.
        if (readError && !selectionExpired) {
            throw readError;
        }
        if (!finalOutcome && !selectionExpired) {
            return { status: EpochAppendOutcome.UNKNOWN };
        }
        const outcome = { status: finalOutcome ? result.status : EpochAppendOutcome.SELECTION_EXPIRED };
        const reservationReleased = await this.#persistStateChange(() => {
            if (this.#selectionState.active !== activeReservation) {
                return false;
            }
            this.#completedRequest = { requestId: activeReservation.request.requestId, outcome };
            this.#releaseReservation(activeReservation.request);
            return true;
        });
        if (!reservationReleased) {
            return null;
        }
        if (readError) {
            this.#selectionOperations.onError?.(readError);
        }
        return { status: outcome.status };
    }

    /**
     * Moves towards a peer counter by a bounded amount. Repeated valid requests can help a node
     * catch up, but one message cannot set an arbitrary local clock.
     *
     * @param {bigint} peerCounter Validated counter from a REQUEST or REPLY.
     * @returns {boolean} True if the local clock has reached this counter.
     */
    #observePeerCounter(peerCounter) {
        const localCounter = this.#selectionState.clock;
        if (peerCounter <= localCounter) {
            return true;
        }
        const nextCounter = localCounter + EPOCH_APPENDER_SELECTION_COUNTER_STEP;
        this.#selectionState.clock = peerCounter < nextCounter ? peerCounter : nextCounter;
        return peerCounter <= nextCounter;
    }

    /**
     * Recovers the clock without forgetting votes in the current epoch. On restart, a large gap
     * between observed counters and saved votes can be removed. An exhausted saved vote needs a
     * newer signed epoch and no pending append before it can be cleared. The epoch floor blocks
     * requests from before that recovery.
     *
     * @param {EpochAppenderSelectionContext} [signedContext] Current context read from local signed state.
     * @param {boolean} [recoverPeerHints=false] Check for inflated observations while opening saved state.
     * @returns {boolean} True when the state needs saving.
     */
    #recoverElectionClock(signedContext, recoverPeerHints = false) {
        const localCounter = this.#selectionState.clock;
        const savedRequests = [this.#selectionState.vote?.request, this.#selectionState.active?.request].filter(Boolean);
        const lastVotedCounter = savedRequests.reduce((highest, request) => {
            const counter = request.logicalCounter;
            return counter > highest ? counter : highest;
        }, 0n);
        if (localCounter < EPOCH_APPENDER_SELECTION_COUNTER_LIMIT &&
            (!recoverPeerHints || localCounter - lastVotedCounter <= EPOCH_APPENDER_SELECTION_COUNTER_STEP)) {
            return false;
        }
        if (lastVotedCounter < EPOCH_APPENDER_SELECTION_COUNTER_LIMIT) {
            this.#selectionState.clock = lastVotedCounter;
            return true;
        }
        if (!signedContext || this.#selectionState.active || !savedRequests.every(request =>
            request.networkId === signedContext.networkId && request.bootstrap === signedContext.bootstrap &&
            BigInt(request.targetEpoch) < BigInt(signedContext.targetEpoch)
        )) {
            return false;
        }
        this.#selectionState.minimumElectionEpoch = signedContext.targetEpoch;
        this.#selectionState.clock = 0n;
        this.#selectionState.vote = null;
        return true;
    }

    /**
     * Rejects requests from before a clock recovery, including delayed callbacks after restart.
     *
     * @param {string} targetEpoch Epoch requested by the caller or peer.
     */
    #requireCurrentElectionEpoch(targetEpoch) {
        if (BigInt(targetEpoch) < BigInt(this.#selectionState.minimumElectionEpoch)) {
            throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.REQUEST_STALE,
                'Election request predates clock recovery');
        }
    }
}
