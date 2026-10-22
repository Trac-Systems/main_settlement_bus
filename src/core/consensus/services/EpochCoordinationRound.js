import b4a from 'b4a';
import { EPOCH_EVENTS, EPOCH_STATES, EpochStateMachine } from './EpochStateMachine.js';
import {
    createMessage,
    uint16ToBuffer,
    uint32ToBuffer,
    uint64ToBuffer,
} from '../../../utils/buffer.js';
import { addressToBuffer } from '../../state/utils/address.js';
import { EpochRoundListeners } from './EpochRoundListeners.js';
import { calculateQuorum } from '../quorum.js';
import {
    sameSelectionContext,
    EpochAppenderSelectionPhase,
    EpochAppendOutcome,
} from '../epochAppenderSelection/epochAppenderSelectionState.js';
import {
    EpochAppenderSelectionError,
    EpochAppenderSelectionErrorCode,
} from '../epochAppenderSelection/EpochAppenderSelectionError.js';

const INACTIVE_ROUND_ERROR = new Error('Epoch coordination round is no longer active');

/** Owns one execution of the epoch state machine. */
export class EpochCoordinationRound {
    #state;
    #wallet;
    #config;
    #manager;
    #logger;
    #operations;
    #intervalMs;
    #machine;
    #listeners;
    #cancelled = false;
    #finished = false;
    #remoteProposalWait = null;
    #backoffWait = null;
    #appendAttempt = null;
    #appenderSelector;
    #appendRequest = null;
    #coordinated = false;
    #outcomeTimer = null;
    #checkingOutcome = false;

    /**
     * Creates one state machine round.
     * The same operations object is used during the whole round.
     *
     * @param {object} dependencies round dependencies supplied by EpochCoordinatorService
     */
    constructor({ state, wallet, config, manager, logger, operations, intervalMs, appenderSelector = null }) {
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
        this.#manager = manager;
        this.#logger = logger;
        this.#operations = operations;
        this.#intervalMs = intervalMs;
        this.#appenderSelector = appenderSelector;
        this.#machine = new EpochStateMachine(this.#buildHandlers());
        this.#machine.on(EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED, ({ context }) => {
            this.#closeApprovalCollection();
            this.#logApprovalBackoff(context);
        });
        this.#machine.on('*', ({ prev }) => {
            // Invalidate the callback as soon as its append state is left, before a retry can enter it.
            if (prev === EPOCH_STATES.APPEND_SET_EPOCH) this.#appendAttempt = null;
        });
        this.#listeners = new EpochRoundListeners({
            state,
            wallet,
            config,
            intervalMs,
            machine: this.#machine,
            isRoundActive: () => this.#isActive(),
            isAppendCoordinated: () => this.#coordinated,
            onEpochProgress: () => this.#checkCoordinatedProgress(),
        });
    }

    /**
     * Starts the state machine for this round.
     * The method can finish while the round is still waiting for an approval, timeout or event.
     *
     * @param {(delay: number) => void} next schedules the next coordinator round
     * @returns {Promise<void>}
     */
    async run(next) {
        if (!this.#isActive()) return;

        const currentEpoch = await this.#state.getCurrentEpoch();
        if (!this.#isActive()) return;
        if (currentEpoch === null || currentEpoch < 0n) {
            await this.#finish(next, this.#intervalMs);
            return;
        }

        if (!this.#appenderSelector) {
            throw new EpochAppenderSelectionError(
                EpochAppenderSelectionErrorCode.SELECTOR_UNAVAILABLE,
                'Epoch appender selection is required but its selector is unavailable'
            );
        }
        this.#coordinated = this.#appenderSelector.enabledFor(currentEpoch + 1n);
        if (this.#coordinated) {
            await this.#appenderSelector.reconcile();
            if (!this.#isActive()) return;
            if (this.#appenderSelector.active) {
                await this.#finish(next, this.#intervalMs);
                return;
            }
        }
        this.#listeners.start();
        await this.#machine.enter({
            next: (delay) => this.#finish(next, delay),
        });
    }

    /**
     * Cancels the round and closes its state machine.
     * Async operations which already started check {@link #assertActive} and ignore late results.
     *
     * @returns {Promise<void>}
     */
    async cancel() {
        if (this.#cancelled) return this.#machine.close();

        this.#cancelled = true;
        this.#closeApprovalCollection();
        this.#cancelRemoteProposalWait();
        this.#cancelBackoffWait();
        clearTimeout(this.#outcomeTimer);
        await this.#machine.close();
        await this.#withdrawAppendRequest();
    }

    /**
     * Finishes this round once and schedules the next round after the machine is closed.
     * A cancelled round does not schedule another run.
     *
     * @param {(delay: number) => void} next
     * @param {number} delay
     * @returns {Promise<boolean>}
     */
    async #finish(next, delay) {
        if (this.#cancelled || this.#finished) return false;

        this.#finished = true;
        this.#closeApprovalCollection();
        this.#cancelRemoteProposalWait();
        this.#cancelBackoffWait();
        clearTimeout(this.#outcomeTimer);
        await this.#machine.close();
        await this.#withdrawAppendRequest();

        if (this.#cancelled) return false;
        next(delay);
        return true;
    }

    /**
     * Checks if this round can still process events and async results.
     * Listeners use it to ignore results from an old round.
     *
     * @returns {boolean}
     */
    #isActive() {
        return !this.#cancelled && !this.#finished && this.#machine.shouldRun();
    }

    /**
     * Stops a handler when the round became inactive during an async operation.
     * The private error is handled by {@link #wrapHandler} and is not returned to callers.
     */
    #assertActive() {
        if (!this.#isActive()) throw INACTIVE_ROUND_ERROR;
    }

    /** Logs approval collection diagnostics before the round enters backoff. */
    #logApprovalBackoff(context) {
        const receivedApprovals = context.proposals?.approvals.length ?? 0;
        const requiredApprovals = Math.max(context.quorum - 1, 0);
        const targetEpoch = context.currentEpoch + 1n;

        this.#logger.warn(
            `[EpochCoordinationRound] approval collection failed for epoch ${targetEpoch}; ` +
            `entering backoff after receiving ${receivedApprovals} of ${requiredApprovals} required external approvals.`,
        );
    }

    /** Closes approval collection, so late request callbacks are ignored. */
    #closeApprovalCollection() {
        if (this.#machine.context.proposals) {
            this.#machine.context.proposals.closed = true;
        }
    }

    /** Only the current, open collection can accept responses while the round is active. */
    #isApprovalCollectionActive(proposals) {
        return this.#isActive() && !proposals.closed && proposals === this.#machine.context.proposals;
    }


    /**
     * Waits for the remote proposal timeout.
     * cancel() finishes this wait without waiting for the timer.
     *
     * @returns {Promise<void>}
     */
    #waitForRemoteProposal() {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                if (this.#remoteProposalWait?.timer === timer) this.#remoteProposalWait = null;
                resolve();
            }, this.#config.epochRemoteProposalTimeout);
            this.#remoteProposalWait = { timer, resolve };
        });
    }

    /** Finishes and clears the remote proposal wait. */
    #cancelRemoteProposalWait() {
        const remoteProposalWait = this.#remoteProposalWait;
        if (!remoteProposalWait) return;

        this.#remoteProposalWait = null;
        clearTimeout(remoteProposalWait.timer);
        remoteProposalWait.resolve();
    }

    /** Waits before retrying consensus work after a failed attempt. */
    #waitForBackoff(delayMs = this.#config.epochBackoffDelay) {
        return new Promise((resolve) => {
            const complete = () => {
                this.#backoffWait = null;
                resolve();
            };

            this.#backoffWait = {
                timer: setTimeout(complete, delayMs),
                complete,
            };
        });
    }

    /** Finishes and clears the current backoff wait. */
    #cancelBackoffWait() {
        const backoffWait = this.#backoffWait;
        if (!backoffWait) return;

        clearTimeout(backoffWait.timer);
        backoffWait.complete();
    }

    /** Loads the signed epoch and config used by this round. */
    async #handleLoadEpochContext(_context, machine) {
        const currentEpoch = await this.#state.requireCurrentEpoch();
        const currentEpochHash = await this.#state.requireEpoch(currentEpoch);
        const {
            configData: {
                difficulty: vdfDifficulty,
                discriminantBitSize: vdfDiscriminantSize,
            },
        } = await this.#state.requireSignedConsensusConfig();
        this.#assertActive();
        machine.appendContext({ currentEpoch, currentEpochHash, vdfDifficulty, vdfDiscriminantSize });
        await machine.send(EPOCH_EVENTS.START);
    }

    /** Calculates the local VDF proof and sends the result to the state machine. */
    async #handleInitializeVdf(context, machine) {
        const { currentEpochHash, vdfDifficulty, vdfDiscriminantSize, currentEpoch } = context;

        const challenge = createMessage(
            uint16ToBuffer(this.#config.networkId),
            uint64ToBuffer(currentEpoch + 1n),
            currentEpochHash,
            addressToBuffer(this.#wallet.address, this.#config.addressPrefix),
            uint32ToBuffer(vdfDifficulty),
            uint16ToBuffer(vdfDiscriminantSize),
        );

        try {
            const vdf = await this.#operations.calculateVDF(challenge, vdfDifficulty, vdfDiscriminantSize);
            this.#assertActive();
            machine.appendContext({ vdf });
            await machine.send(EPOCH_EVENTS.LOCAL_PROOF_READY);
        } catch (error) {
            this.#assertActive();
            this.#logger.error(error);
            await machine.send(EPOCH_EVENTS.SOLVER_FAILURE);
        }
    }

    /** Builds and signs the local proof proposal after VDF completion. */
    async #handleBuildAndSignProofProposal(context, machine) {
        const { currentEpoch, currentEpochHash, vdf } = context;
        const proofProposalMessage = await this.#operations.createProofProposal(currentEpoch, currentEpochHash, vdf);
        this.#assertActive();
        machine.appendContext({ proofProposalMessage, proofProposal: proofProposalMessage.proof_proposal });
        await machine.send(EPOCH_EVENTS.PROPOSAL_BUILT);
    }

    /** Decides if external approvals are required before building SET_EPOCH. */
    async #handleQuorumDecision(context, machine) {
        if (context.remoteProposalReceived) {
            await this.#waitForRemoteProposal();
            this.#assertActive();
            const latestEpoch = await this.#state.getCurrentEpoch();
            this.#assertActive();
            if (latestEpoch > context.currentEpoch) {
                await machine.send(EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED);
                return;
            }
        }

        // Each attempt uses one authoritative membership snapshot, regardless of peer connectivity.
        const indexers = await this.#state.getIndexersEntry();
        this.#assertActive();
        const indexerKeys = new Set(indexers.map(({ key }) => b4a.toString(key, 'hex')));
        if (!indexerKeys.has(b4a.toString(this.#state.writingKey, 'hex'))) {
            await context.next(this.#intervalMs);
            return;
        }

        const quorum = calculateQuorum(indexers.length);
        const approvers = this.#operations.approvers(indexers);
        machine.appendContext({ indexerKeys, quorum, approvers, proposals: null });

        await machine.send(
            quorum <= 1
                ? EPOCH_EVENTS.EXTERNAL_APPROVALS_NOT_REQUIRED
                : EPOCH_EVENTS.EXTERNAL_APPROVALS_REQUIRED,
        );
    }

    /** Connects to eligible indexers and starts one approval request per approver. */
    async #handleSendProposalToIndexers(context, machine) {
        const { approvers } = context;
        await this.#manager.connect();
        this.#assertActive();

        const proposals = {
            approvers,
            approvals: [],
            rejections: [],
            closed: false,
        };

        machine.appendContext({ proposals });
        this.#dispatchApprovalRequests(approvers, machine, proposals);
        await machine.send(EPOCH_EVENTS.PROPOSAL_BROADCAST);
    }

    /**
     * Starts approval requests.
     * Each callback checks if the round and approval collection are still active.
     */
    #dispatchApprovalRequests(approvers, machine, proposals) {
        for (const member of approvers) {
            const { currentEpoch, currentEpochHash, vdf } = machine.context;
            this.#operations.collectSignature(
                member,
                { currentEpoch, currentEpochHash, vdf },
                this.#manager,
                proposals,
            )
                .then((confirmation) => this.#handleApproval(confirmation, proposals, machine))
                .catch((error) => this.#handleApprovalFailure(error, member, proposals, machine));
        }
    }

    /** Records a valid approval and advances the state machine after reaching quorum. */
    async #handleApproval(confirmation, proposals, machine) {
        if (!this.#isApprovalCollectionActive(proposals)) return;

        proposals.approvals.push(confirmation);
        if (proposals.approvals.length + 1 >= machine.context.quorum) {
            proposals.closed = true;
            await machine.send(EPOCH_EVENTS.QUORUM_REACHED);
        }
    }

    /** Records a rejected approval and stops collection when quorum is no longer possible. */
    async #handleApprovalFailure(error, member, proposals, machine) {
        if (!this.#isApprovalCollectionActive(proposals)) return;

        proposals.rejections.push({ member, error });
        if (proposals.rejections.length > proposals.approvers.length - machine.context.quorum + 1) {
            proposals.closed = true;
            await machine.send(EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED);
        }
    }

    /** Builds the SET_EPOCH payload from the local proposal and collected approvals. */
    async #handleBuildSetEpoch(context, machine) {
        const setEpochPayload = await this.#operations.buildSetEpochPayload(
            context.proofProposal,
            context.proposals?.approvals ?? [],
        );
        this.#assertActive();
        machine.appendContext({ setEpochPayload });
        await machine.send(EPOCH_EVENTS.SET_EPOCH_BUILT);
    }

    /** Checks the epoch and membership before appending a payload built by this attempt. */
    async #handleRefreshSignedStateBeforeAppend(context, machine) {
        const latestEpochBeforeAppend = await this.#state.getCurrentEpoch();
        this.#assertActive();
        if (latestEpochBeforeAppend !== context.currentEpoch) {
            await this.#withdrawAppendRequest();
            this.#assertActive();
            await machine.send(EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED);
            return;
        }

        let indexers = await this.#state.getIndexersEntry();
        if (this.#coordinated) {
            const snapshot = await this.#state.getEpochAppenderSelectionContext();
            this.#assertActive();
            const { configData } = await this.#state.requireSignedConsensusConfig();
            this.#assertActive();
            if (!sameSelectionContext(snapshot, this.#appendRequest) ||
                configData.difficulty !== context.vdfDifficulty ||
                configData.discriminantBitSize !== context.vdfDiscriminantSize) {
                await this.#withdrawAppendRequest();
                this.#assertActive();
                await machine.send(EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED);
                return;
            }
            indexers = snapshot.currentWriterKeys.map(key => ({ key: b4a.from(key, 'hex') }));
        }
        this.#assertActive();
        const membershipChanged = indexers.length !== context.indexerKeys.size ||
            indexers.some(({ key }) => !context.indexerKeys.has(b4a.toString(key, 'hex')));
        if (membershipChanged) {
            await this.#withdrawAppendRequest();
            this.#assertActive();
        }
        await machine.send(membershipChanged ? EPOCH_EVENTS.INDEXERS_CHANGED : EPOCH_EVENTS.TARGET_EPOCH_ABSENT);
    }

    /** Appends SET_EPOCH locally. The event or timeout decides the final result. */
    async #handleAppendSetEpoch(context, machine) {
        if (this.#coordinated) {
            await this.#startSelectedAppend(machine);
            return;
        }
        const appendAttempt = {};
        this.#appendAttempt = appendAttempt;
        try {
            await this.#operations.appendSetEpoch(context.setEpochPayload);
            this.#assertActive();
            // append() stores the operation locally. The event or timeout decides if it succeeded.
        } catch (error) {
            this.#assertActive();
            if (this.#appendAttempt !== appendAttempt) return;
            this.#logger.error(error);
            await machine.send(EPOCH_EVENTS.APPEND_FAILED);
        }
    }

    /** Refreshes signed state and decides if the existing proof can be used again. */
    async #handleRefreshSignedState(context, machine) {
        await this.#state.refresh();
        this.#assertActive();
        const latestEpoch = await this.#state.getCurrentEpoch();
        this.#assertActive();

        if (latestEpoch > context.currentEpoch) {
            await machine.send(EPOCH_EVENTS.NEW_EPOCH_DISCOVERED);
        } else if (context.vdf) {
            await machine.send(EPOCH_EVENTS.EPOCH_UNCHANGED_WITH_LOCAL_PROOF);
        } else {
            await machine.send(EPOCH_EVENTS.EPOCH_UNCHANGED_WITHOUT_LOCAL_PROOF);
        }
    }

    /** Continues epoch processing after backoff. */
    async #handleBackoff(context, machine) {
        const delay = context.appendElectionRetry
            ? Math.max(100, Math.min(this.#config.epochBackoffDelay, 1000))
            : this.#config.epochBackoffDelay;
        machine.appendContext({ appendElectionRetry: false });
        await this.#waitForBackoff(delay);
        this.#assertActive();
        await machine.send(EPOCH_EVENTS.BACKOFF_ELAPSED);
    }

    /** Finishes the round and schedules a fresh round which reloads signed context. */
    async #handleReloadSignedContext(context) {
        await context.next(this.#intervalMs);
    }

    /**
     * Checks if the round is active before running a handler.
     * Normal handler errors schedule a retry. Cancellation errors are ignored.
     *
     * @param {Function} handler state-specific handler
     * @returns {Function} guarded state-machine handler
     */
    #wrapHandler(handler) {
        return async (context, machine) => {
            try {
                this.#assertActive();
                await handler(context, machine);
            } catch (error) {
                if (error === INACTIVE_ROUND_ERROR || !this.#isActive()) return;

                this.#logger.error(`[EpochCoordinationRound] handler failed: ${error.message}`);
                await context.next(this.#intervalMs);
            }
        };
    }

    /** @returns {object} state machine handlers with the active round check */
    #buildHandlers() {
        const handlers = {
            [EPOCH_STATES.LOAD_EPOCH_CONTEXT]: this.#handleLoadEpochContext.bind(this),
            [EPOCH_STATES.INITIALIZE_VDF]: this.#handleInitializeVdf.bind(this),
            [EPOCH_STATES.BUILD_AND_SIGN_PROOF_PROPOSAL]: this.#handleBuildAndSignProofProposal.bind(this),
            [EPOCH_STATES.QUORUM_DECISION]: this.#handleQuorumDecision.bind(this),
            [EPOCH_STATES.SEND_PROPOSAL_TO_INDEXERS]: this.#handleSendProposalToIndexers.bind(this),
            [EPOCH_STATES.BUILD_SET_EPOCH]: this.#handleBuildSetEpoch.bind(this),
            [EPOCH_STATES.WAIT_FOR_APPEND_REPLIES]: this.#handleWaitForAppendReplies.bind(this),
            [EPOCH_STATES.REFRESH_SIGNED_STATE_BEFORE_APPEND]: this.#handleRefreshSignedStateBeforeAppend.bind(this),
            [EPOCH_STATES.APPEND_SET_EPOCH]: this.#handleAppendSetEpoch.bind(this),
            [EPOCH_STATES.WAIT_FOR_APPEND_OUTCOME]: this.#handleWaitForAppendOutcome.bind(this),
            [EPOCH_STATES.REFRESH_SIGNED_STATE]: this.#handleRefreshSignedState.bind(this),
            [EPOCH_STATES.BACKOFF]: this.#handleBackoff.bind(this),
            [EPOCH_STATES.RELOAD_SIGNED_CONTEXT]: this.#handleReloadSignedContext.bind(this),
        };

        return Object.fromEntries(
            Object.entries(handlers).map(([state, handler]) => [state, this.#wrapHandler(handler)]),
        );
    }

    async #withdrawAppendRequest() {
        const request = this.#appendRequest;
        this.#appendRequest = null;
        if (request) {
            await this.#appenderSelector.cancel(request.requestId);
        }
    }

    async #handleWaitForAppendReplies(context, machine) {
        if (!this.#coordinated) {
            await machine.send(EPOCH_EVENTS.APPEND_REPLIES_COLLECTED);
            return;
        }
        try {
            const snapshot = await this.#state.getEpochAppenderSelectionContext();
            this.#assertActive();
            if (
                BigInt(snapshot.targetEpoch) !== context.currentEpoch + 1n ||
                snapshot.parentHash !== context.currentEpochHash.toString('hex')
            ) {
                await machine.send(EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED);
                return;
            }
            const request = await this.#appenderSelector.createRequest(snapshot, context.setEpochPayload);
            if (!this.#isActive()) {
                await this.#appenderSelector.cancel(request.requestId);
                return;
            }
            this.#appendRequest = request;
            await this.#appenderSelector.waitForReplies(request);
            this.#assertActive();
            if (this.#appendRequest !== request || machine.state !== EPOCH_STATES.WAIT_FOR_APPEND_REPLIES) {
                return;
            }
            await machine.send(EPOCH_EVENTS.APPEND_REPLIES_COLLECTED);
        } catch (error) {
            this.#assertActive();
            await this.#withdrawAppendRequest();
            const latestEpoch = await this.#state.getCurrentEpoch();
            this.#assertActive();
            if (latestEpoch > context.currentEpoch) {
                await machine.send(EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED);
                return;
            }
            const message = `[EpochCoordinationRound] append replies unavailable: ${error.message}`;
            if (error.code === EpochAppenderSelectionErrorCode.ELECTION_BUSY ||
                error.code === EpochAppenderSelectionErrorCode.REPLIES_INCOMPLETE ||
                error.code === EpochAppenderSelectionErrorCode.ELECTION_SUPERSEDED) {
                this.#logger.debug?.(message);
            } else {
                this.#logger.warn(message);
            }
            machine.appendContext({ appendElectionRetry: true });
            await machine.send(EPOCH_EVENTS.APPEND_REPLY_COLLECTION_FAILED);
        }
    }

    async #startSelectedAppend(machine) {
        if (machine.state !== EPOCH_STATES.APPEND_SET_EPOCH || !this.#appendRequest) {
            return;
        }
        const request = this.#appendRequest;
        // Observe without awaiting the local write. Signed completion or election expiry
        // ends this attempt; neither a timeout nor a newer term cancels the pending append.
        this.#appendSelectedPayload(request)
            .catch(error => this.#handlePublicationFailure(request, machine, error))
            .catch(error => this.#logger.error(error));
        await machine.send(EPOCH_EVENTS.APPEND_STARTED);
    }

    async #appendSelectedPayload(request) {
        const payload = await this.#appenderSelector.getSelectedPayload(request.requestId);
        this.#assertActive();
        if (this.#appendRequest !== request) {
            return;
        }
        return this.#operations.appendSetEpoch(payload, location => {
            return this.#appenderSelector.authorizeAppend(request.requestId, location);
        });
    }

    async #handlePublicationFailure(request, machine, error) {
        if (!this.#isActive() || this.#appendRequest !== request) {
            return;
        }
        this.#logger.error(`[EpochCoordinationRound] append outcome unresolved: ${error.message}`);
        const active = this.#appenderSelector.active;
        if (active?.phase === EpochAppenderSelectionPhase.HELD) {
            // Without the durable marker no append could have started, so cancellation is safe.
            const released = await this.#appenderSelector.cancel(request.requestId);
            if (released && this.#isActive() && this.#appendRequest === request) {
                this.#appendRequest = null;
                await machine.send(EPOCH_EVENTS.APPEND_REJECTED);
            }
            return;
        }
        if (!active && !this.#appenderSelector.outcomeFor(request.requestId)) {
            this.#appendRequest = null;
            await machine.send(EPOCH_EVENTS.APPEND_REJECTED);
        }
    }

    async #handleWaitForAppendOutcome() {
        await this.#checkCoordinatedProgress();
        this.#scheduleOutcomeCheck();
    }

    #scheduleOutcomeCheck() {
        clearTimeout(this.#outcomeTimer);
        if (!this.#isActive() || this.#machine.state !== EPOCH_STATES.WAIT_FOR_APPEND_OUTCOME) return;
        this.#outcomeTimer = setTimeout(async () => {
            await this.#checkCoordinatedProgress();
            this.#scheduleOutcomeCheck();
        }, Math.max(100, Math.min(this.#config.epochAppendTimeout, 1000)));
    }

    async #checkCoordinatedProgress() {
        if (!this.#coordinated || !this.#isActive() || this.#checkingOutcome) return;
        this.#checkingOutcome = true;
        const request = this.#appendRequest;
        try {
            await this.#appenderSelector.reconcile();
            if (!this.#isActive() || this.#appendRequest !== request) return;
            const observing = this.#machine.state === EPOCH_STATES.WAIT_FOR_APPEND_OUTCOME;
            const outcome = request && this.#appenderSelector.outcomeFor(request.requestId);
            if (observing && outcome) {
                let event;
                switch (outcome.status) {
                    case EpochAppendOutcome.REJECTED:
                        event = EPOCH_EVENTS.APPEND_REJECTED;
                        break;
                    case EpochAppendOutcome.EPOCH_ADVANCED:
                        event = EPOCH_EVENTS.TARGET_EPOCH_CONFIRMED;
                        break;
                    case EpochAppendOutcome.SELECTION_EXPIRED:
                        this.#machine.appendContext({ appendElectionRetry: true });
                        event = EPOCH_EVENTS.APPENDER_SELECTION_EXPIRED;
                        break;
                    default:
                        return;
                }
                clearTimeout(this.#outcomeTimer);
                this.#appendRequest = null;
                await this.#machine.send(event);
                return;
            }
            // The event itself may come from speculative apply. Read signed state.
            if (!observing && this.#machine.state !== EPOCH_STATES.APPEND_SET_EPOCH) {
                const epoch = await this.#state.getCurrentEpoch();
                if (!this.#isActive() || this.#appendRequest !== request) return;
                if (epoch > this.#machine.context.currentEpoch) {
                    await this.#machine.context.next(this.#intervalMs);
                }
            }
        } catch (error) {
            this.#logger.error(`[EpochCoordinationRound] cannot confirm append outcome: ${error.message}`);
        } finally {
            this.#checkingOutcome = false;
        }
    }
}
