import { EPOCH_EVENTS, EPOCH_STATES, EpochStateMachine } from './EpochStateMachine.js';
import { ConsensusProtocolVersion } from '../../../utils/constants.js';
import {
    createMessage,
    uint16ToBuffer,
    uint32ToBuffer,
    uint64ToBuffer,
    uint8ToBuffer,
} from '../../../utils/buffer.js';
import { addressToBuffer } from '../../state/utils/address.js';
import { EpochRoundListeners } from './EpochRoundListeners.js';

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

    /**
     * Creates one state machine round.
     * The same operations object is used during the whole round.
     *
     * @param {object} dependencies round dependencies supplied by EpochCoordinatorService
     */
    constructor({ state, wallet, config, manager, logger, operations, intervalMs }) {
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
        this.#manager = manager;
        this.#logger = logger;
        this.#operations = operations;
        this.#intervalMs = intervalMs;
        this.#machine = new EpochStateMachine(this.#buildHandlers());
        this.#machine.on(EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED, ({ context }) => {
            this.#logApprovalBackoff(context);
        });
        this.#listeners = new EpochRoundListeners({
            state,
            wallet,
            config,
            intervalMs,
            machine: this.#machine,
            isRoundActive: () => this.#isActive(),
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
    cancel() {
        if (this.#cancelled) return this.#machine.close();

        this.#cancelled = true;
        this.#closeApprovalCollection();
        this.#cancelRemoteProposalWait();
        this.#cancelBackoffWait();
        return this.#machine.close();
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
        await this.#machine.close();

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
    #waitForBackoff() {
        return new Promise((resolve) => {
            const complete = () => {
                this.#backoffWait = null;
                resolve();
            };

            this.#backoffWait = {
                timer: setTimeout(complete, this.#config.epochBackoffDelay),
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

    /** @returns {Promise<number>} signature quorum required for the current indexer set */
    async #getQuorum() {
        const indexerCount = await this.#state.indexerCount();
        return indexerCount <= 2 ? 1 : Math.floor(indexerCount / 2) + 1;
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
        const quorum = await this.#getQuorum();

        this.#assertActive();
        machine.appendContext({ currentEpoch, currentEpochHash, vdfDifficulty, vdfDiscriminantSize, quorum });
        await machine.send(EPOCH_EVENTS.START);
    }

    /** Calculates the local VDF proof and sends the result to the state machine. */
    async #handleInitializeVdf(context, machine) {
        const { currentEpochHash, vdfDifficulty, vdfDiscriminantSize, currentEpoch } = context;

        const challenge = createMessage(
            uint8ToBuffer(ConsensusProtocolVersion.V1),
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

        await machine.send(
            context.quorum <= 1
                ? EPOCH_EVENTS.EXTERNAL_APPROVALS_NOT_REQUIRED
                : EPOCH_EVENTS.EXTERNAL_APPROVALS_REQUIRED,
        );
    }

    /** Connects to eligible indexers and starts one approval request per approver. */
    async #handleSendProposalToIndexers(context, machine) {
        const approvers = await this.#operations.approvers();
        this.#assertActive();
        await this.#manager.connect();
        this.#assertActive();

        if (approvers.length + 1 < context.quorum) {
            await machine.send(EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED);
            return;
        }

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
        if (!this.#isActive() || proposals.closed) return;

        proposals.approvals.push(confirmation);
        if (proposals.approvals.length + 1 >= machine.context.quorum) {
            proposals.closed = true;
            await machine.send(EPOCH_EVENTS.QUORUM_REACHED);
        }
    }

    /** Records a rejected approval and stops collection when quorum is no longer possible. */
    async #handleApprovalFailure(error, member, proposals, machine) {
        if (!this.#isActive() || proposals.closed) return;

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

    /** Checks signed state before append, so an old epoch is not submitted. */
    async #handleRefreshSignedStateBeforeAppend(context, machine) {
        const latestEpochBeforeAppend = await this.#state.getCurrentEpoch();
        this.#assertActive();
        await machine.send(
            latestEpochBeforeAppend === context.currentEpoch
                ? EPOCH_EVENTS.TARGET_EPOCH_ABSENT
                : EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED,
        );
    }

    /** Appends SET_EPOCH locally. The event or timeout decides the final result. */
    async #handleAppendSetEpoch(context, machine) {
        try {
            await this.#operations.appendSetEpoch(context.setEpochPayload);
            this.#assertActive();
            // append() stores the operation locally. The event or timeout decides if it succeeded.
        } catch (error) {
            this.#assertActive();
            this.#logger.error(error);
            await machine.send(EPOCH_EVENTS.APPEND_FAILED);
        }
    }

    /** Ends the round after the append result has already been broadcast. */
    async #handleSendAppendSignal(context) {
        await context.next(this.#intervalMs);
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
    async #handleBackoff(_context, machine) {
        await this.#waitForBackoff();
        this.#assertActive();
        await machine.send(EPOCH_EVENTS.BACKOFF_ELAPSED);
    }

    /** Closes the current machine and schedules a fresh round which reloads signed context. */
    async #handleReloadSignedContext(context, machine) {
        await machine.close();
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
            [EPOCH_STATES.REFRESH_SIGNED_STATE_BEFORE_APPEND]: this.#handleRefreshSignedStateBeforeAppend.bind(this),
            [EPOCH_STATES.APPEND_SET_EPOCH]: this.#handleAppendSetEpoch.bind(this),
            [EPOCH_STATES.SEND_APPEND_SIGNAL]: this.#handleSendAppendSignal.bind(this),
            [EPOCH_STATES.REFRESH_SIGNED_STATE]: this.#handleRefreshSignedState.bind(this),
            [EPOCH_STATES.BACKOFF]: this.#handleBackoff.bind(this),
            [EPOCH_STATES.RELOAD_SIGNED_CONTEXT]: this.#handleReloadSignedContext.bind(this),
        };

        return Object.fromEntries(
            Object.entries(handlers).map(([state, handler]) => [state, this.#wrapHandler(handler)]),
        );
    }

}
