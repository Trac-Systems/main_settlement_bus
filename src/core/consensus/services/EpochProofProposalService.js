import SchedulableService from "../../../utils/scheduler/SchedulableService.js";
import { EPOCH_EVENTS, EPOCH_STATES, EpochStateMachine } from "./EpochStateMachine.js";
import { CustomEventType } from "../../../utils/constants.js";
import { Logger } from "../../../utils/logger.js";
import { createVDFService } from "./createVDFService.js";
import { EpochProofProposalOperations } from './EpochProofProposalOperations.js';

const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(null), ms))
]);

class EpochProofProposalService extends SchedulableService {
    #state;
    #wallet;
    #config;
    #intervalMs;
    #logger;
    #vdfService;
    #connectionManager
    #stateMachine
    #awaitingEpochTimeoutId
    #collectingConfirmationsTimeoutId
    #operations

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
        this.#stateMachine = new EpochStateMachine();
        this.#awaitingEpochTimeoutId = null;
        this.#collectingConfirmationsTimeoutId = null;
    }

    async _open() {
        this.#vdfService = await createVDFService();
        await this.#vdfService.ready();

        this.#operations = new EpochProofProposalOperations(this.#state, this.#vdfService, this.#wallet, this.#connectionManager, this.#config);

        this.#stateMachine.on('*', async ({ event, prev, next, context }) => {
            await this.#onTransition(event, prev, next, context);
        });

        // These events are removed from State, when the State closes
        // They are singletons in MSB.
        this.#state.on(CustomEventType.EPOCH_PROPOSAL_SUBMITTED, async () => {
            this.#stateMachine.appendContext({
                remoteProposalReceived: true,
            });
            await this.#stateMachine.send(EPOCH_EVENTS.REMOTE_PROPOSAL_RECEIVED);
        });

        this.#state.on(CustomEventType.EPOCH_CREATED, async () => {
            if (this.#stateMachine.state === EPOCH_STATES.AWAITING_EPOCH) {
                await this.#stateMachine.send(EPOCH_EVENTS.EPOCH_VERIFIED);
            }
        });
    }

    async _close() {
        this.#clearAwaitingEpochTimeout();
        this.#clearCollectingConfirmationsTimeout();
        await super._close();
        await this.#vdfService?.close();
    }

    async start() {
        if (this.isSchedulerRunning) {
            return false;
        }

        await this.#stateMachine.send(EPOCH_EVENTS.START);

        const started = super.start(this.#intervalMs);
        if (started) {
            this.#logger.debug(`scheduler started with intervalMs ${this.#intervalMs}`);
        }
        return started;
    }

    async stop(waitForCurrent = true) {
        return super.stop(waitForCurrent);
    }

    #clearAwaitingEpochTimeout() {
        if (this.#awaitingEpochTimeoutId) {
            clearTimeout(this.#awaitingEpochTimeoutId);
            this.#awaitingEpochTimeoutId = null;
        }
    }

    #clearCollectingConfirmationsTimeout() {
        if (this.#collectingConfirmationsTimeoutId) {
            clearTimeout(this.#collectingConfirmationsTimeoutId);
            this.#collectingConfirmationsTimeoutId = null;
        }
    }    

    // usar timeout do config aqui
    #scheduleAwaitingEpochTimeout() {
        this.#clearAwaitingEpochTimeout();
        this.#awaitingEpochTimeoutId = setTimeout(async () => {
            this.#awaitingEpochTimeoutId = null; // deletar essa flag
            await this.#stateMachine.send(EPOCH_EVENTS.EPOCH_TIMEOUT); // isso aqui ainda tem que resetar o estado
        }, this.#config.epochAppendTimeout);
    }

    async #handleConfirmation(confirmation) {
        if (!confirmation) return;

        const context = this.#stateMachine.context;
        const confirmations = [...context.confirmations, confirmation];
        this.#stateMachine.appendContext({ confirmations });

        if (confirmations.length >= this.#config.epochThreshold) {
            await this.#stateMachine.send(EPOCH_EVENTS.QUORUM_REACHED);
        }
    }

    #dispatchApprovalRequests(proofProposal) {
        const approvers = this.#stateMachine.context.approvers ?? [];

        for (const member of approvers) {
            withTimeout(
                this.#operations.collectSignature(member, proofProposal),
                this.#config.epochSignatureTimeout,
            )
                .then((confirmation) => this.#handleConfirmation(confirmation))
                .catch(() => {});
        }
    }

    #scheduleCollectingConfirmationsTimeout() {
        this.#clearCollectingConfirmationsTimeout();
        this.#collectingConfirmationsTimeoutId = setTimeout(async () => {
            this.#collectingConfirmationsTimeoutId = null;
            await this.#stateMachine.send(EPOCH_EVENTS.COLLECTING_TIMEOUT);
        }, this.#config.epochSignatureTimeout);
    }    

    getScheduleInterval() {
        return this.#intervalMs;
    }

    async worker(next) {
        if (this.isInterrupted) return;

        const currentEpochId = await this.#state.currentEpochId();
        if (this.#stateMachine.state === EPOCH_STATES.VDF_PENDING && currentEpochId > 0) {
            await this.#onTransition(null, null, this.#stateMachine.state, this.#stateMachine.context);
        }

        next(this.#intervalMs);
    }

    // handler functions
    async #handleVdfPending() {
        console.log(`[EpochService] state=${EPOCH_STATES.VDF_PENDING}: calculating VDF`);
        this.#stateMachine.appendContext({
            vdf: await this.#operations.calculateVDF(),
        });
        await this.#stateMachine.send(EPOCH_EVENTS.CALCULATE_VDF);
    }

    async #handleVdfComputed(context) {
        console.log(`[EpochService] state=${EPOCH_STATES.VDF_COMPUTED}: VDF computed`);
        const { remoteProposalReceived } = context;
        this.#stateMachine.appendContext({ remoteProposalReceived: false });
        if (remoteProposalReceived) {
            console.log('[EpochService] remote proposal already observed, switching to awaiting mode');
            await this.#stateMachine.send(EPOCH_EVENTS.REMOTE_PROPOSAL_RECEIVED);
        } else {
            console.log('[EpochService] creating local epoch proposal');
            await this.#stateMachine.send(EPOCH_EVENTS.PROPOSE_EPOCH);
        }
    }

    async #handleProposingEpoch(context) {
        console.log(`[EpochService] state=${EPOCH_STATES.PROPOSING_EPOCH}: building proof proposal and dispatching approvals`);
        this.#stateMachine.appendContext({
            newEpochProofData: this.#operations.createProposal(
                context.vdf.prevEpochId,
                context.vdf.currentEpochHash,
                context.vdf,
            ),
        });
        this.#stateMachine.appendContext({
            proofProposal: await context.newEpochProofData.toProposalMessage(this.#wallet),
            confirmations: [],
            approvers: await this.#state.getIndexersEntry(),
        });
        this.#dispatchApprovalRequests(context.proofProposal);
        await this.#stateMachine.send(EPOCH_EVENTS.APPROVAL_REQUESTS_DISPATCHED);
    }

    #handleCollectingConfirmations() {
        console.log(`[EpochService] state=${EPOCH_STATES.COLLECTING_CONFIRMATIONS}: waiting for approvals`);
        this.#scheduleCollectingConfirmationsTimeout();
    }

    #handleAwaitingEpoch() {
        console.log(`[EpochService] state=${EPOCH_STATES.AWAITING_EPOCH}: waiting for remote epoch append`);
        this.#scheduleAwaitingEpochTimeout();
    }

    async #handleLocalQuorumReached() {
        console.log(`[EpochService] state=${EPOCH_STATES.LOCAL_QUORUM_REACHED}: quorum reached, submitting epoch`);
        await this.#stateMachine.send(EPOCH_EVENTS.SUBMIT_EPOCH);
    }

    async #handleVdfSubmitted(context) {
        console.log(`[EpochService] state=${EPOCH_STATES.VDF_SUBMITTED}: appending epoch to state`);
        await this.#operations.appendEpoch({
            data: context.proofProposal.data,
            signature: context.proofProposal.signature,
            signatures: context.confirmations,
        });
        await this.#stateMachine.send(EPOCH_EVENTS.APPEND_LOG);
    }    
    // end of handler functions

    #getTransitionHandler(state) {
        const handlers = {
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

    async #onTransition(event, _prev, next, context) {
        console.log(`[EpochService] transition event=${event ?? 'INIT'} -> ${next}`);
        this.#clearAwaitingEpochTimeout();
        this.#clearCollectingConfirmationsTimeout();
        const handler = this.#getTransitionHandler(next);
        if (handler) await handler(context);
    }
}

export default EpochProofProposalService;
