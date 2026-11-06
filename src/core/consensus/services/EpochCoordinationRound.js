import { EPOCH_EVENTS, EPOCH_STATES, EpochStateMachine } from './EpochStateMachine.js';
import {
    createMessage,
    toHex,
    uint16ToBuffer,
    uint32ToBuffer,
    uint64ToBuffer,
} from '../../../utils/buffer.js';
import { addressToBuffer } from '../../state/utils/address.js';
import { EpochRoundListeners } from './EpochRoundListeners.js';
import { calculateProofSignatureQuorum } from '../quorum.js';
import {
    sameSelectionContext,
    EpochAppenderSelectionPhase,
    EpochAppendOutcome,
} from '../epochAppenderSelection/epochAppenderSelectionState.js';
import {
    EpochAppenderSelectionError,
    EpochAppenderSelectionErrorCode,
} from '../epochAppenderSelection/EpochAppenderSelectionError.js';

/**
 * @typedef {import('./EpochStateMachine.js').EpochRoundContext} EpochRoundContext
 * @typedef {import('./EpochCoordinatorOperations.js').EpochApprovalCollection} EpochApprovalCollection
 * @typedef {import('./EpochCoordinatorOperations.js').EpochProofApproval} EpochProofApproval
 */

const INACTIVE_ROUND_ERROR = new Error('Epoch coordination round is no longer active');

/**
 * Runs one epoch round through the FSM. Calculates the proof, collects approvals, selects an appender
 * and checks the signed append result. A retry can reuse the proof, but starts a new approval
 * collection and election. Cancelling the round stops its timers and callbacks. It cannot undo an
 * append that has already started.
 */
export class EpochCoordinationRound {
    #state;
    #wallet;
    #config;
    #indexerConnectionManager;
    #logger;
    #epochOperations;
    #roundIntervalMs;
    #epochStateMachine;
    #roundListeners;
    #cancelled = false;
    #finished = false;
    #remoteProposalWait = null;
    #backoffWait = null;
    #appenderSelector;
    #selectionRequest = null;
    #appendOutcomeTimer = null;
    #checkingAppendOutcome = false;

    /**
     * Sets up a round with the shared node services. This round manages its own FSM, approval
     * collection, retry delays and append outcome timer.
     *
     * @param {object} dependencies Services used by this round.
     * @param {import('../../state/State.js').default} dependencies.state Access to signed ledger data and epoch events.
     * @param {object} dependencies.wallet Local proposer identity.
     * @param {object} dependencies.config Network and timeout configuration.
     * @param {import('../../network/services/IndexerConnectionManager.js').default} dependencies.manager Consensus peer sessions.
     * @param {object} dependencies.logger Round diagnostic logger.
     * @param {import('./EpochCoordinatorOperations.js').EpochCoordinatorOperations} dependencies.operations Methods for proofs, signatures and appends.
     * @param {number} dependencies.intervalMs Delay before the next round.
     * @param {import('../epochAppenderSelection/EpochAppenderSelector.js').EpochAppenderSelector|null} [dependencies.appenderSelector=null] Shared selector that saves votes locally.
     */
    constructor({ state, wallet, config, manager: indexerConnectionManager, logger, operations: epochOperations, intervalMs: roundIntervalMs, appenderSelector = null }) {
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
        this.#indexerConnectionManager = indexerConnectionManager;
        this.#logger = logger;
        this.#epochOperations = epochOperations;
        this.#roundIntervalMs = roundIntervalMs;
        this.#appenderSelector = appenderSelector;
        this.#epochStateMachine = new EpochStateMachine(this.#buildHandlers());
        this.#epochStateMachine.on(EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED, ({ context: roundContext }) => {
            this.#closeApprovalCollection();
            this.#logApprovalBackoff(roundContext);
        });
        this.#roundListeners = new EpochRoundListeners({
            state,
            config,
            machine: this.#epochStateMachine,
            isRoundActive: () => this.#isRoundActive(),
            onEpochProgress: () => this.#checkSignedEpochProgress(),
        });
    }

    /**
     * Starts this round. The method may return while the FSM is still waiting for an approval, timeout
     * or ledger event.
     *
     * @param {(delay: number) => void} scheduleNextRound Schedules the next round after the given delay in milliseconds.
     * @returns {Promise<void>}
     */
    async run(scheduleNextRound) {
        if (!this.#isRoundActive()) return;

        const currentEpoch = await this.#state.getCurrentEpoch();
        if (!this.#isRoundActive()) return;
        if (currentEpoch === null || currentEpoch < 0n) {
            await this.#finishRound(scheduleNextRound, this.#roundIntervalMs);
            return;
        }

        if (!this.#appenderSelector) {
            throw new EpochAppenderSelectionError(
                EpochAppenderSelectionErrorCode.SELECTOR_UNAVAILABLE,
                'Epoch appender selection is required but its selector is unavailable'
            );
        }
        await this.#appenderSelector.refreshAppendOutcome();
        if (!this.#isRoundActive()) return;
        if (this.#appenderSelector.activeReservation) {
            await this.#finishRound(scheduleNextRound, this.#roundIntervalMs);
            return;
        }
        this.#roundListeners.start();
        await this.#epochStateMachine.enter({
            finishAndScheduleNextRound: (delayMs) => this.#finishRound(scheduleNextRound, delayMs),
        });
    }

    /**
     * Cancels the round and closes its FSM. Operations that are already running check whether the
     * round is still active before using their results.
     *
     * @returns {Promise<void>}
     */
    async cancel() {
        if (this.#cancelled) return this.#epochStateMachine.close();

        this.#cancelled = true;
        this.#closeApprovalCollection();
        this.#cancelRemoteProposalWait();
        this.#cancelBackoffWait();
        clearTimeout(this.#appendOutcomeTimer);
        await this.#epochStateMachine.close();
        await this.#cancelSelectionRequest();
    }

    /**
     * Closes this round and schedules the next one. A round finishes only once. A cancelled round does
     * not schedule another run.
     *
     * @param {(delay: number) => void} scheduleNextRound Schedules the next round after this one closes.
     * @param {number} delayMs Delay before the next round, in milliseconds.
     * @returns {Promise<boolean>}
     */
    async #finishRound(scheduleNextRound, delayMs) {
        if (this.#cancelled || this.#finished) return false;

        this.#finished = true;
        this.#closeApprovalCollection();
        this.#cancelRemoteProposalWait();
        this.#cancelBackoffWait();
        clearTimeout(this.#appendOutcomeTimer);
        await this.#epochStateMachine.close();
        await this.#cancelSelectionRequest();

        if (this.#cancelled) return false;
        scheduleNextRound(delayMs);
        return true;
    }

    /**
     * Checks whether the round can still handle events and operation results.
     *
     * @returns {boolean}
     */
    #isRoundActive() {
        return !this.#cancelled && !this.#finished && this.#epochStateMachine.shouldRun();
    }

    /**
     * Stops a handler if the round ended during an async operation. The handler wrapper catches this
     * error and ignores the late result.
     */
    #assertRoundActive() {
        if (!this.#isRoundActive()) throw INACTIVE_ROUND_ERROR;
    }

    /**
     * Logs how many external approvals were received when collection fails.
     *
     * @param {EpochRoundContext} roundContext Failed collection and required signature count.
     */
    #logApprovalBackoff(roundContext) {
        const receivedApprovals = roundContext.approvalCollection?.approvals.length ?? 0;
        const requiredApprovals = Math.max(roundContext.requiredProofSignatures - 1, 0);
        const targetEpoch = roundContext.currentEpoch + 1n;

        this.#logger.warn(
            `[EpochCoordinationRound] approval collection failed for epoch ${targetEpoch}; ` +
            `entering backoff after receiving ${receivedApprovals} of ${requiredApprovals} required external approvals.`,
        );
    }

    /** Closes the current approval collection so late replies are ignored. */
    #closeApprovalCollection() {
        if (this.#epochStateMachine.context.approvalCollection) {
            this.#epochStateMachine.context.approvalCollection.closed = true;
        }
    }

    /**
     * Checks that the round and this approval collection are still active.
     *
     * @param {EpochApprovalCollection} approvalCollection Collection that received a reply.
     * @returns {boolean} True if this collection still belongs to the active attempt.
     */
    #isApprovalCollectionActive(approvalCollection) {
        return this.#isRoundActive() && !approvalCollection.closed && approvalCollection === this.#epochStateMachine.context.approvalCollection;
    }


    /**
     * Waits for a matching remote proposal to reach the ledger. Cancelling the round ends this wait
     * early.
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

    /** Clears the remote proposal timer and finishes the wait. */
    #cancelRemoteProposalWait() {
        const remoteProposalWait = this.#remoteProposalWait;
        if (!remoteProposalWait) return;

        this.#remoteProposalWait = null;
        clearTimeout(remoteProposalWait.timer);
        remoteProposalWait.resolve();
    }

    /**
     * Waits before starting another attempt after a failure.
     *
     * @param {number} [delayMs] Delay in milliseconds. Defaults to epochBackoffDelay.
     * @returns {Promise<void>} Resolves when the timer ends or the wait is cancelled.
     */
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

    /** Clears the retry timer and finishes the wait. */
    #cancelBackoffWait() {
        const backoffWait = this.#backoffWait;
        if (!backoffWait) return;

        clearTimeout(backoffWait.timer);
        backoffWait.complete();
    }

    /**
     * Loads the signed parent epoch and VDF config for this round.
     *
     * @param {EpochRoundContext} _context Unused because this handler loads the round context.
     * @param {EpochStateMachine} epochStateMachine FSM that receives the next event.
     * @returns {Promise<void>}
     */
    async #handleLoadEpochContext(_context, epochStateMachine) {
        const currentEpoch = await this.#state.requireCurrentEpoch();
        const currentEpochHash = await this.#state.requireEpoch(currentEpoch);
        const {
            configData: {
                difficulty: vdfDifficulty,
                discriminantBitSize: vdfDiscriminantSize,
            },
        } = await this.#state.requireSignedConsensusConfig();
        this.#assertRoundActive();
        epochStateMachine.appendContext({ currentEpoch, currentEpochHash, vdfDifficulty, vdfDiscriminantSize });
        await epochStateMachine.send(EPOCH_EVENTS.START);
    }

    /**
     * Calculates the local VDF proof and sends the result to the FSM.
     *
     * @param {EpochRoundContext} roundContext Data for this round and attempt.
     * @param {EpochStateMachine} epochStateMachine FSM that receives the next event.
     * @returns {Promise<void>}
     */
    async #handleInitializeVdf(roundContext, epochStateMachine) {
        const { currentEpochHash, vdfDifficulty, vdfDiscriminantSize, currentEpoch } = roundContext;

        const challenge = createMessage(
            uint16ToBuffer(this.#config.networkId),
            uint64ToBuffer(currentEpoch + 1n),
            currentEpochHash,
            addressToBuffer(this.#wallet.address, this.#config.addressPrefix),
            uint32ToBuffer(vdfDifficulty),
            uint16ToBuffer(vdfDiscriminantSize),
        );

        try {
            const vdf = await this.#epochOperations.calculateVDF(challenge, vdfDifficulty, vdfDiscriminantSize);
            this.#assertRoundActive();
            epochStateMachine.appendContext({ vdf });
            await epochStateMachine.send(EPOCH_EVENTS.LOCAL_PROOF_READY);
        } catch (error) {
            this.#assertRoundActive();
            this.#logger.error(error);
            await epochStateMachine.send(EPOCH_EVENTS.SOLVER_FAILURE);
        }
    }

    /**
     * Builds and signs the local proposal after the VDF proof is ready.
     *
     * @param {EpochRoundContext} roundContext Data for this round and attempt.
     * @param {EpochStateMachine} epochStateMachine FSM that receives the next event.
     * @returns {Promise<void>}
     */
    async #handleBuildAndSignProofProposal(roundContext, epochStateMachine) {
        const { currentEpoch, currentEpochHash, vdf } = roundContext;
        const proofProposalMessage = await this.#epochOperations.createProofProposal(currentEpoch, currentEpochHash, vdf);
        this.#assertRoundActive();
        epochStateMachine.appendContext({ proofProposalMessage, proofProposal: proofProposalMessage.proof_proposal });
        await epochStateMachine.send(EPOCH_EVENTS.PROPOSAL_BUILT);
    }

    /**
     * Reads the current indexers and decides whether the proof needs external approvals.
     *
     * @param {EpochRoundContext} roundContext Data for this round and attempt.
     * @param {EpochStateMachine} epochStateMachine FSM that receives the next event.
     * @returns {Promise<void>}
     */
    async #handleQuorumDecision(roundContext, epochStateMachine) {
        if (roundContext.remoteProposalReceived) {
            await this.#waitForRemoteProposal();
            this.#assertRoundActive();
            const latestEpoch = await this.#state.getCurrentEpoch();
            this.#assertRoundActive();
            if (latestEpoch > roundContext.currentEpoch) {
                await epochStateMachine.send(EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED);
                return;
            }
        }

        // Each attempt uses one authoritative membership snapshot, regardless of peer connectivity.
        const indexers = await this.#state.getIndexersEntry();
        this.#assertRoundActive();
        const indexerKeys = new Set(indexers.map(({ key }) => toHex(key)));
        if (!indexerKeys.has(toHex(this.#state.writingKey))) {
            await roundContext.finishAndScheduleNextRound(this.#roundIntervalMs);
            return;
        }

        const requiredProofSignatures = calculateProofSignatureQuorum(indexers.length);
        const approvers = this.#epochOperations.getProofApprovers(indexers);
        epochStateMachine.appendContext({ indexerKeys, requiredProofSignatures, approvers, approvalCollection: null });

        await epochStateMachine.send(
            requiredProofSignatures <= 1
                ? EPOCH_EVENTS.EXTERNAL_APPROVALS_NOT_REQUIRED
                : EPOCH_EVENTS.EXTERNAL_APPROVALS_REQUIRED,
        );
    }

    /**
     * Connects to the other indexers and starts one proof approval request per signer.
     *
     * @param {EpochRoundContext} roundContext Data for this round and attempt.
     * @param {EpochStateMachine} epochStateMachine FSM that receives the next event.
     * @returns {Promise<void>}
     */
    async #handleSendProposalToIndexers(roundContext, epochStateMachine) {
        const { approvers } = roundContext;
        await this.#indexerConnectionManager.connect();
        this.#assertRoundActive();

        const approvalCollection = {
            approvers,
            approvals: [],
            rejections: [],
            closed: false,
        };

        epochStateMachine.appendContext({ approvalCollection });
        this.#dispatchApprovalRequests(approvers, epochStateMachine, approvalCollection);
        await epochStateMachine.send(EPOCH_EVENTS.PROPOSAL_BROADCAST);
    }

    /**
     * Sends proof approval requests. Each reply is checked against the active round and approval
     * collection.
     *
     * @param {Array<{key: Buffer}>} approvers Indexers that can approve this proof.
     * @param {EpochStateMachine} epochStateMachine FSM for this round.
     * @param {EpochApprovalCollection} approvalCollection Collection that owns these requests.
     */
    #dispatchApprovalRequests(approvers, epochStateMachine, approvalCollection) {
        for (const member of approvers) {
            const { currentEpoch, currentEpochHash, vdf } = epochStateMachine.context;
            this.#epochOperations.requestProofApproval(
                member,
                { currentEpoch, currentEpochHash, vdf },
                this.#indexerConnectionManager,
                approvalCollection,
            )
                .then((proofApproval) => this.#handleApproval(proofApproval, approvalCollection, epochStateMachine))
                .catch((error) => this.#handleApprovalFailure(error, member, approvalCollection, epochStateMachine));
        }
    }

    /**
     * Adds a valid approval and advances the FSM when enough proof signatures are collected.
     *
     * @param {EpochProofApproval} proofApproval Verified signature and signer address.
     * @param {EpochApprovalCollection} approvalCollection Collection that sent the request.
     * @param {EpochStateMachine} epochStateMachine FSM that receives QUORUM_REACHED.
     * @returns {Promise<void>}
     */
    async #handleApproval(proofApproval, approvalCollection, epochStateMachine) {
        if (!this.#isApprovalCollectionActive(approvalCollection)) return;

        approvalCollection.approvals.push(proofApproval);
        if (approvalCollection.approvals.length + 1 >= epochStateMachine.context.requiredProofSignatures) {
            approvalCollection.closed = true;
            await epochStateMachine.send(EPOCH_EVENTS.QUORUM_REACHED);
        }
    }

    /**
     * Records a failed approval request. Stops collection when the remaining signers cannot provide
     * enough signatures.
     *
     * @param {Error} error Reason the approval request failed.
     * @param {{key: Buffer}} member Indexer that was asked to approve the proof.
     * @param {EpochApprovalCollection} approvalCollection Collection that sent the request.
     * @param {EpochStateMachine} epochStateMachine FSM that receives APPROVAL_COLLECTION_FAILED.
     * @returns {Promise<void>}
     */
    async #handleApprovalFailure(error, member, approvalCollection, epochStateMachine) {
        if (!this.#isApprovalCollectionActive(approvalCollection)) return;

        approvalCollection.rejections.push({ member, error });
        if (approvalCollection.rejections.length > approvalCollection.approvers.length - epochStateMachine.context.requiredProofSignatures + 1) {
            approvalCollection.closed = true;
            await epochStateMachine.send(EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED);
        }
    }

    /**
     * Builds the SET_EPOCH payload from the local proposal and collected approvals.
     *
     * @param {EpochRoundContext} roundContext Data for this round and attempt.
     * @param {EpochStateMachine} epochStateMachine FSM that receives the next event.
     * @returns {Promise<void>}
     */
    async #handleBuildSetEpoch(roundContext, epochStateMachine) {
        const setEpochPayload = await this.#epochOperations.buildSetEpochPayload(
            roundContext.proofProposal,
            roundContext.approvalCollection?.approvals ?? [],
        );
        this.#assertRoundActive();
        epochStateMachine.appendContext({ setEpochPayload });
        await epochStateMachine.send(EPOCH_EVENTS.SET_EPOCH_BUILT);
    }

    /**
     * Checks the signed epoch, consensus config and indexers before appending this payload.
     *
     * @param {EpochRoundContext} roundContext Data for this round and attempt.
     * @param {EpochStateMachine} epochStateMachine FSM that receives the next event.
     * @returns {Promise<void>}
     */
    async #handleRefreshSignedStateBeforeAppend(roundContext, epochStateMachine) {
        const latestEpochBeforeAppend = await this.#state.getCurrentEpoch();
        this.#assertRoundActive();
        if (latestEpochBeforeAppend !== roundContext.currentEpoch) {
            await this.#cancelSelectionRequest();
            this.#assertRoundActive();
            await epochStateMachine.send(EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED);
            return;
        }

        const signedSelectionContext = await this.#state.getEpochAppenderSelectionContext();
        this.#assertRoundActive();

        const { configData } = await this.#state.requireSignedConsensusConfig();
        this.#assertRoundActive();

        if (
            !sameSelectionContext(signedSelectionContext, this.#selectionRequest) ||
            configData.difficulty !== roundContext.vdfDifficulty ||
            configData.discriminantBitSize !== roundContext.vdfDiscriminantSize
        ) {
            await this.#cancelSelectionRequest();
            this.#assertRoundActive();
            await epochStateMachine.send(EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED);
            return;
        }

        const currentWriterKeys = signedSelectionContext.currentWriterKeys;
        const membershipChanged =
            currentWriterKeys.length !== roundContext.indexerKeys.size ||
            currentWriterKeys.some(key => !roundContext.indexerKeys.has(key));

        if (membershipChanged) {
            await this.#cancelSelectionRequest();
            this.#assertRoundActive();
        }

        await epochStateMachine.send(
            membershipChanged
                ? EPOCH_EVENTS.INDEXERS_CHANGED
                : EPOCH_EVENTS.TARGET_EPOCH_ABSENT
        );
    }

    /**
     * Refreshes signed state and checks whether the local proof can be reused.
     *
     * @param {EpochRoundContext} roundContext Data for this round and attempt.
     * @param {EpochStateMachine} epochStateMachine FSM that receives the next event.
     * @returns {Promise<void>}
     */
    async #handleRefreshSignedState(roundContext, epochStateMachine) {
        await this.#state.refresh();
        this.#assertRoundActive();
        const latestEpoch = await this.#state.getCurrentEpoch();
        this.#assertRoundActive();

        if (latestEpoch > roundContext.currentEpoch) {
            await epochStateMachine.send(EPOCH_EVENTS.NEW_EPOCH_DISCOVERED);
        } else if (roundContext.vdf) {
            await epochStateMachine.send(EPOCH_EVENTS.EPOCH_UNCHANGED_WITH_LOCAL_PROOF);
        } else {
            await epochStateMachine.send(EPOCH_EVENTS.EPOCH_UNCHANGED_WITHOUT_LOCAL_PROOF);
        }
    }

    /**
     * Waits before retrying. Election failures use a shorter delay.
     *
     * @param {EpochRoundContext} roundContext Data for this round and attempt.
     * @param {EpochStateMachine} epochStateMachine FSM that receives the next event.
     * @returns {Promise<void>}
     */
    async #handleBackoff(roundContext, epochStateMachine) {
        const delayMs = roundContext.appendElectionRetry
            ? Math.max(100, Math.min(this.#config.epochBackoffDelay, 1000))
            : this.#config.epochBackoffDelay;
        epochStateMachine.appendContext({ appendElectionRetry: false });
        await this.#waitForBackoff(delayMs);
        this.#assertRoundActive();
        await epochStateMachine.send(EPOCH_EVENTS.BACKOFF_ELAPSED);
    }

    /**
     * Ends this round and schedules a new one that loads fresh signed context.
     *
     * @param {EpochRoundContext} roundContext Provides the callback that closes this round and schedules the next.
     * @returns {Promise<void>}
     */
    async #handleRoundCompletion(roundContext) {
        await roundContext.finishAndScheduleNextRound(this.#roundIntervalMs);
    }

    /**
     * Checks that the round is active before running a handler. A handler error ends the round and
     * schedules another attempt. Late results from an inactive round are ignored.
     *
     * @param {Function} handler Handler for one FSM state.
     * @returns {Function} Handler that checks whether the round is active.
     */
    #wrapHandler(handler) {
        return async (roundContext, epochStateMachine) => {
            try {
                this.#assertRoundActive();
                await handler(roundContext, epochStateMachine);
            } catch (error) {
                if (error === INACTIVE_ROUND_ERROR || !this.#isRoundActive()) return;

                this.#logger.error(`[EpochCoordinationRound] handler failed: ${error.message}`);
                await roundContext.finishAndScheduleNextRound(this.#roundIntervalMs);
            }
        };
    }

    /** @returns {object} FSM handlers that check whether the round is active. */
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
            [EPOCH_STATES.RELOAD_SIGNED_CONTEXT]: this.#handleRoundCompletion.bind(this),
        };

        return Object.fromEntries(
            Object.entries(handlers).map(([state, handler]) => [state, this.#wrapHandler(handler)]),
        );
    }

    /**
     * Clears this round's selection request. Cancels the reservation if no append has started. A
     * PUBLISHING reservation stays with the selector until its result is known or it expires.
     *
     * @returns {Promise<void>}
     */
    async #cancelSelectionRequest() {
        const selectionRequest = this.#selectionRequest;
        this.#selectionRequest = null;
        if (selectionRequest) {
            await this.#appenderSelector.cancel(selectionRequest.requestId);
        }
    }

    /**
     * Reserves this attempt's payload and waits for appender votes. A changed signed context ends the
     * round. A failed election starts another attempt after a delay.
     *
     * @param {EpochRoundContext} roundContext Current proof and SET_EPOCH bytes.
     * @param {EpochStateMachine} epochStateMachine FSM receiving the selection outcome.
     * @returns {Promise<void>}
     */
    async #handleWaitForAppendReplies(roundContext, epochStateMachine) {
        try {
            const signedSelectionContext = await this.#state.getEpochAppenderSelectionContext();
            this.#assertRoundActive();
            if (
                BigInt(signedSelectionContext.targetEpoch) !== roundContext.currentEpoch + 1n ||
                signedSelectionContext.parentHash !== toHex(roundContext.currentEpochHash)
            ) {
                await epochStateMachine.send(EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED);
                return;
            }
            const selectionRequest = await this.#appenderSelector.createSelectionRequest(signedSelectionContext, roundContext.setEpochPayload);
            if (!this.#isRoundActive()) {
                await this.#appenderSelector.cancel(selectionRequest.requestId);
                return;
            }
            this.#selectionRequest = selectionRequest;
            await this.#appenderSelector.waitForAppenderSelection(selectionRequest);
            this.#assertRoundActive();
            if (this.#selectionRequest !== selectionRequest || epochStateMachine.state !== EPOCH_STATES.WAIT_FOR_APPEND_REPLIES) {
                return;
            }
            await epochStateMachine.send(EPOCH_EVENTS.APPEND_REPLIES_COLLECTED);
        } catch (error) {
            this.#assertRoundActive();
            await this.#cancelSelectionRequest();
            const latestEpoch = await this.#state.getCurrentEpoch();
            this.#assertRoundActive();
            if (latestEpoch > roundContext.currentEpoch) {
                await epochStateMachine.send(EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED);
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
            epochStateMachine.appendContext({ appendElectionRetry: true });
            await epochStateMachine.send(EPOCH_EVENTS.APPEND_REPLY_COLLECTION_FAILED);
        }
    }

    /**
     * Starts the append and moves the FSM to waiting for its result. The write runs in the background
     * because a timeout or a new election cannot cancel it.
     *
     * @param {EpochRoundContext} _context Unused here because the selector stores the selected payload.
     * @param {EpochStateMachine} epochStateMachine FSM receiving APPEND_STARTED.
     * @returns {Promise<void>}
     */
    async #handleAppendSetEpoch(_context, epochStateMachine) {
        if (epochStateMachine.state !== EPOCH_STATES.APPEND_SET_EPOCH || !this.#selectionRequest) {
            return;
        }
        const selectionRequest = this.#selectionRequest;
        // Observe without awaiting the local write. Signed completion or election expiry
        // ends this attempt; neither a timeout nor a newer term cancels the pending append.
        this.#appendSelectedEpochPayload(selectionRequest)
            .catch(error => this.#handleAppendFailure(selectionRequest, epochStateMachine, error))
            .catch(error => this.#logger.error(error));
        await epochStateMachine.send(EPOCH_EVENTS.APPEND_STARTED);
    }

    /**
     * Reads the selected payload and queues its append. The selector checks authorization inside the
     * write queue before the payload is written.
     *
     * @param {import('../epochAppenderSelection/epochAppenderSelectionState.js').EpochAppendRequest} selectionRequest Selection request for this attempt.
     * @returns {Promise<void>} Completes after the local append. The signed result still needs checking.
     */
    async #appendSelectedEpochPayload(selectionRequest) {
        const epochPayload = await this.#appenderSelector.getSelectedEpochPayload(selectionRequest.requestId);
        this.#assertRoundActive();
        if (this.#selectionRequest !== selectionRequest) {
            return;
        }
        return this.#epochOperations.appendSetEpoch(epochPayload, appendLocation => {
            return this.#appenderSelector.authorizeEpochAppend(selectionRequest.requestId, appendLocation);
        });
    }

    /**
     * Handles an append error only if it belongs to this attempt. Releases the selection when the
     * append never started. Otherwise, the selector keeps checking its signed result until the result
     * is known or the selection expires.
     *
     * @param {import('../epochAppenderSelection/epochAppenderSelectionState.js').EpochAppendRequest} selectionRequest Request saved before starting the append.
     * @param {EpochStateMachine} epochStateMachine Current round FSM.
     * @param {Error} error Error from the write queue, authorization or append.
     * @returns {Promise<void>}
     */
    async #handleAppendFailure(selectionRequest, epochStateMachine, error) {
        if (!this.#isRoundActive() || this.#selectionRequest !== selectionRequest) {
            return;
        }
        this.#logger.error(`[EpochCoordinationRound] append outcome unresolved: ${error.message}`);
        const activeReservation = this.#appenderSelector.activeReservation;
        if (activeReservation?.phase === EpochAppenderSelectionPhase.HELD) {
            // Without the durable marker no append could have started, so cancellation is safe.
            const released = await this.#appenderSelector.cancel(selectionRequest.requestId);
            if (released && this.#isRoundActive() && this.#selectionRequest === selectionRequest) {
                this.#selectionRequest = null;
                await epochStateMachine.send(EPOCH_EVENTS.APPEND_REJECTED);
            }
            return;
        }
        if (!activeReservation && !this.#appenderSelector.getRecordedAppendOutcome(selectionRequest.requestId)) {
            this.#selectionRequest = null;
            await epochStateMachine.send(EPOCH_EVENTS.APPEND_REJECTED);
        }
    }

    /**
     * Checks signed progress now, then schedules further checks while this attempt is active.
     *
     * @returns {Promise<void>}
     */
    async #handleWaitForAppendOutcome() {
        await this.#checkSignedEpochProgress();
        this.#scheduleAppendOutcomeCheck();
    }

    /**
     * Schedules another result check while the FSM waits for the append. The selector also checks
     * appends that continue after the round has ended.
     *
     * @returns {void}
     */
    #scheduleAppendOutcomeCheck() {
        clearTimeout(this.#appendOutcomeTimer);
        if (!this.#isRoundActive() || this.#epochStateMachine.state !== EPOCH_STATES.WAIT_FOR_APPEND_OUTCOME) return;
        this.#appendOutcomeTimer = setTimeout(async () => {
            await this.#checkSignedEpochProgress();
            this.#scheduleAppendOutcomeCheck();
        }, Math.max(100, Math.min(this.#config.epochAppendTimeout, 1000)));
    }

    /**
     * Sends an FSM event for the signed append result or selection expiry. EPOCH_CREATED can arrive
     * before the epoch is signed, so the event starts a check. A result is used only if it still
     * belongs to this round's current request.
     *
     * @returns {Promise<void>}
     */
    async #checkSignedEpochProgress() {
        if (!this.#isRoundActive() || this.#checkingAppendOutcome) return;
        this.#checkingAppendOutcome = true;
        const selectionRequest = this.#selectionRequest;
        try {
            await this.#appenderSelector.refreshAppendOutcome();
            if (!this.#isRoundActive() || this.#selectionRequest !== selectionRequest) return;
            const waitingForAppendOutcome = this.#epochStateMachine.state === EPOCH_STATES.WAIT_FOR_APPEND_OUTCOME;
            const outcome = selectionRequest && this.#appenderSelector.getRecordedAppendOutcome(selectionRequest.requestId);
            if (waitingForAppendOutcome && outcome) {
                let event;
                switch (outcome.status) {
                    case EpochAppendOutcome.REJECTED:
                        event = EPOCH_EVENTS.APPEND_REJECTED;
                        break;
                    case EpochAppendOutcome.EPOCH_ADVANCED:
                        event = EPOCH_EVENTS.TARGET_EPOCH_CONFIRMED;
                        break;
                    case EpochAppendOutcome.SELECTION_EXPIRED:
                        this.#epochStateMachine.appendContext({ appendElectionRetry: true });
                        event = EPOCH_EVENTS.APPENDER_SELECTION_EXPIRED;
                        break;
                    default:
                        return;
                }
                clearTimeout(this.#appendOutcomeTimer);
                this.#selectionRequest = null;
                await this.#epochStateMachine.send(event);
                return;
            }
            // The event itself may come from speculative apply. Read signed state.
            if (!waitingForAppendOutcome && this.#epochStateMachine.state !== EPOCH_STATES.APPEND_SET_EPOCH) {
                const epoch = await this.#state.getCurrentEpoch();
                if (!this.#isRoundActive() || this.#selectionRequest !== selectionRequest) return;
                if (epoch > this.#epochStateMachine.context.currentEpoch) {
                    await this.#epochStateMachine.context.finishAndScheduleNextRound(this.#roundIntervalMs);
                }
            }
        } catch (error) {
            this.#logger.error(`[EpochCoordinationRound] cannot confirm append outcome: ${error.message}`);
        } finally {
            this.#checkingAppendOutcome = false;
        }
    }
}
