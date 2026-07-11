import SchedulableService from "../../../utils/scheduler/SchedulableService.js";
import { EPOCH_EVENTS, EPOCH_STATES, EpochStateMachine } from "./EpochStateMachine.js";
import { CustomEventType } from "../../../utils/constants.js";
import { Logger } from "../../../utils/logger.js";
import { createVDFService } from "./createVDFService.js";
import { EpochProofProposalOperations } from './EpochProofProposalOperations.js';

class EpochProofProposalService extends SchedulableService {
    #state;
    #wallet;
    #config;
    #intervalMs;
    #logger;
    #vdfService;
    #connectionManager;
    #operations;
    #lastLoggedEpoch = null;
    // Cancels the currently in-flight worker() cycle's timers/listeners (see worker()).
    // SchedulableService only stops the Scheduler on close - it has no visibility into these,
    // so without this, a cycle stuck retrying (e.g. COLLECTING_CONFIRMATIONS timeout) would
    // keep recomputing the VDF and re-dispatching approval requests forever, even after close().
    #activeCycleCleanup = null;

    /**
   * @param {object} state
   * @param {object} connectionManager
   * @param {object} wallet
   * @param {object} config
   */
    constructor(state, connectionManager, wallet, config) {
        super();
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
        this.#intervalMs = this.#config.epochInterval;
        this.#logger = new Logger(config);
        this.#connectionManager = connectionManager;
    }

    async _open() {
        this.#vdfService = await createVDFService();
        await this.#vdfService.ready();

        this.#operations = new EpochProofProposalOperations(this.#state, this.#vdfService, this.#wallet, this.#connectionManager, this.#config);
    }

    async _close() {
        this.#activeCycleCleanup?.();
        await super._close();
        await this.#vdfService?.close();
    }

    async start() {
        if (this.isSchedulerRunning) {
            return false;
        }

        const started = super.start(this.#intervalMs);
        return started;
    }

    async stop(waitForCurrent = true) {
        return super.stop(waitForCurrent);
    }

    async #handleConfirmation(confirmation, machine) {
        if (machine.state !== EPOCH_STATES.COLLECTING_CONFIRMATIONS) return;

        const context = machine.context;
        const confirmations = [...context.confirmations, confirmation];
        machine.appendContext({ confirmations });

        if (confirmations.length >= this.#config.epochThreshold) {
            await machine.send(EPOCH_EVENTS.QUORUM_REACHED);
        }
    }

    #dispatchApprovalRequests(approvers, proposalRequest, machine) {
        for (const member of approvers) {
            this.#operations.collectSignature(member, proposalRequest)
                .then((confirmation) => this.#handleConfirmation(confirmation, machine))
                .catch((err) => {
                    console.log(err)
                });
        }
    }  

    getScheduleInterval() {
        return this.#intervalMs;
    }

    async worker(next, hold) {
        if (!await this.#shouldRun()) {
            next(this.#intervalMs);
            return;
        }

        hold();

        const currentEpoch = await this.#state.getCurrentEpoch();
        // getCurrentEpoch() reads signed state only, so this only fires once the epoch
        // transition is actually final - unlike the apply-time log, which can run multiple
        // times per operation across Autobase reboots/reorders before the outcome settles.
        if (this.#lastLoggedEpoch !== null && currentEpoch > this.#lastLoggedEpoch) {
            console.info(`Epoch advanced to ${currentEpoch}.`);
        }
        this.#lastLoggedEpoch = currentEpoch;

        const currentEpochHash = await this.#state.getEpoch(currentEpoch);
        const { vdfDifficulty, vdfDiscriminantSize } = await this.#state.getSignedVDFParams();

        const machine = new EpochStateMachine(this.#logger);

        // Safety nets so a cycle can never wait forever on an external signal that might not
        // come (e.g. another indexer's proposal wins the race for the same epoch number - see
        // State.js's sequential-epoch guard - and our own currentEpoch read above goes stale
        // without anything ever telling us to re-check it).
        let collectingTimer = null;
        let awaitingEpochTimer = null;

        const clearCollectingTimer = () => {
            if (collectingTimer) {
                clearTimeout(collectingTimer);
                collectingTimer = null;
            }
        };

        const clearAwaitingEpochTimer = () => {
            if (awaitingEpochTimer) {
                clearTimeout(awaitingEpochTimer);
                awaitingEpochTimer = null;
            }
        };

        const onEpochSubmited = async () => {
            machine.appendContext({ remoteProposalReceived: true });
            await machine.send(EPOCH_EVENTS.REMOTE_PROPOSAL_RECEIVED);
        }

        const cleanupCycle = () => {
            clearCollectingTimer();
            clearAwaitingEpochTimer();
            machine.clearListeners();
            this.#state.removeListener(CustomEventType.EPOCH_PROPOSAL_SUBMITTED, onEpochSubmited)
            this.#state.removeListener(CustomEventType.EPOCH_CREATED, onEpochCreated)
            this.#activeCycleCleanup = null;
        }

        const onEpochCreated = async () => {
            cleanupCycle();
            next(this.#intervalMs)
        }

        this.#activeCycleCleanup = cleanupCycle;

        machine.on('*', async ({ event, prev, next: nextState, context, machine }) => {
            // Waiting for approvals from other indexers: if epochSignatureTimeout elapses
            // without reaching quorum, retry with a fresh VDF/proposal (same epoch number -
            // this is just a hedge against a lost approval message, not a stale epoch read).
            if (nextState === EPOCH_STATES.COLLECTING_CONFIRMATIONS) {
                clearCollectingTimer();
                collectingTimer = setTimeout(() => {
                    machine.send(EPOCH_EVENTS.COLLECTING_TIMEOUT).catch((err) => console.log(err));
                }, this.#config.epochSignatureTimeout);
            } else {
                clearCollectingTimer();
            }

            // Waiting for the epoch to be committed (ours or someone else's): if
            // epochAppendTimeout elapses with no EPOCH_CREATED, don't retry in place - our
            // currentEpoch context could be stale by now. Restart the whole cycle instead, the
            // same way onEpochCreated does, so the next attempt re-reads currentEpoch fresh.
            if (nextState === EPOCH_STATES.AWAITING_EPOCH) {
                clearAwaitingEpochTimer();
                awaitingEpochTimer = setTimeout(() => {
                    onEpochCreated().catch((err) => console.log(err));
                }, this.#config.epochAppendTimeout);
            } else {
                clearAwaitingEpochTimer();
            }

            await this.#onTransition({ event, prev, next: nextState, context, machine });
        });

        this.#state.on(CustomEventType.EPOCH_PROPOSAL_SUBMITTED, onEpochSubmited);
        this.#state.on(CustomEventType.EPOCH_CREATED, onEpochCreated);

        machine.appendContext({ currentEpoch, currentEpochHash, vdfDifficulty, vdfDiscriminantSize });
        await machine.send(EPOCH_EVENTS.START);
    }

    // handler functions
    async #handleStartVdf() {}

    async #handleVdfPending(context, machine) {
        const { currentEpochHash, vdfDifficulty, vdfDiscriminantSize } = context
        const vdf = await this.#operations.calculateVDF(currentEpochHash, vdfDifficulty, vdfDiscriminantSize);
        machine.appendContext({ vdf });
        await machine.send(EPOCH_EVENTS.CALCULATE_VDF);
    }

    async #handleVdfComputed(context, machine) {
        const { remoteProposalReceived } = context;
        
        if(!remoteProposalReceived) {
            await machine.send(EPOCH_EVENTS.PROPOSE_EPOCH);
        } else {
            await machine.send(EPOCH_EVENTS.REMOTE_PROPOSAL_RECEIVED);
        }
    }

    async #handleProposingEpoch(context, machine) {
        const { currentEpoch, currentEpochHash, vdf } = context;
        const proposalRequest = await this.#operations.createProofProposal(currentEpoch, currentEpochHash, vdf);
        const approvers = await this.#operations.approvers();

        if (machine.state !== EPOCH_STATES.PROPOSING_EPOCH) return;

        machine.appendContext({
            proposalRequest,
            confirmations: [],
            approvers,
        });
        this.#dispatchApprovalRequests(approvers, proposalRequest, machine);
        await machine.send(EPOCH_EVENTS.APPROVAL_REQUESTS_DISPATCHED);
    }

    #handleCollectingConfirmations() {}

    async #handleAwaitingEpoch(context, machine) {
        if (context.epochAlreadyCommitted) {
            await machine.send(EPOCH_EVENTS.EPOCH_VERIFIED);
        }
    }

    async #handleLocalQuorumReached(_context, machine) {
        await machine.send(EPOCH_EVENTS.SUBMIT_EPOCH);
    }

    async #handleVdfSubmitted(context, machine) {
        await this.#operations.appendEpoch(
            context.proposalRequest.proof_proposal,
            context.confirmations,
        );
        await machine.send(EPOCH_EVENTS.APPEND_LOG);
    }    

    #getTransitionHandler(state) {
        const handlers = {
            [EPOCH_STATES.START_VDF]: this.#handleStartVdf.bind(this),
            [EPOCH_STATES.VDF_PENDING]: this.#handleVdfPending.bind(this),
            [EPOCH_STATES.VDF_COMPUTED]: this.#handleVdfComputed.bind(this), 
            [EPOCH_STATES.PROPOSING_EPOCH]: this.#handleProposingEpoch.bind(this),
            [EPOCH_STATES.COLLECTING_CONFIRMATIONS]: this.#handleCollectingConfirmations.bind(this),
            [EPOCH_STATES.AWAITING_EPOCH]: this.#handleAwaitingEpoch.bind(this), 
            [EPOCH_STATES.LOCAL_QUORUM_REACHED]: this.#handleLocalQuorumReached.bind(this),
            [EPOCH_STATES.VDF_SUBMITTED]: this.#handleVdfSubmitted.bind(this),
        };
        return handlers[state] ?? null;
    }

    async #onTransition({ next, context, machine }) {
        const handler = this.#getTransitionHandler(next);
        if (handler) await handler(context, machine);
    }

    async #shouldRun() {
        const epoch = await this.#state.getCurrentEpoch()
        return epoch !== null && epoch >= 0n && !this.isInterrupted
    }
}

export default EpochProofProposalService;
