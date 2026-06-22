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
    #connectionManager
    #stateMachine
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
            this.#stateMachine.appendContext({ remoteProposalReceived: true });
            await this.#stateMachine.send(EPOCH_EVENTS.REMOTE_PROPOSAL_RECEIVED);
        });

        this.#state.on(CustomEventType.EPOCH_CREATED, async ({ epochId, epochHash } = {}) => {
            this.#stateMachine.appendContext({ lastCommittedEpochId: epochId, lastCommittedEpochHash: epochHash });
        
            if (this.#stateMachine.state === EPOCH_STATES.AWAITING_EPOCH) {
                this.#stateMachine.appendContext({ currentEpoch: epochId, currentEpochHash: epochHash });
                await this.#stateMachine.send(EPOCH_EVENTS.EPOCH_VERIFIED);
            } else if (this.#stateMachine.state === EPOCH_STATES.VDF_SUBMITTED) {
                this.#stateMachine.appendContext({ currentEpoch: epochId, currentEpochHash: epochHash });
                await this.#stateMachine.send(EPOCH_EVENTS.APPEND_LOG);
            }
            // Re-append after send: EPOCH_VERIFIED → START_VDF zera o contexto (discardState)
            this.#stateMachine.appendContext({ lastCommittedEpochId: epochId, lastCommittedEpochHash: epochHash });
        });
    }

    async _close() {
        // this.#stateMachine.clearActiveTimeout();
        await super._close();
        await this.#vdfService?.close();
    }

    async start() {
        if (this.isSchedulerRunning) {
            return false;
        }

        const started = super.start(this.#intervalMs);
        if (started) {
            this.#logger.debug(`scheduler started with intervalMs ${this.#intervalMs}`);
        }
        return started;
    }

    async stop(waitForCurrent = true) {
        return super.stop(waitForCurrent);
    }

    async #handleConfirmation(confirmation) {
        if (!confirmation) return;
        if (this.#stateMachine.state !== EPOCH_STATES.COLLECTING_CONFIRMATIONS) return;

        const context = this.#stateMachine.context;
        const confirmations = [...context.confirmations, confirmation];
        this.#stateMachine.appendContext({ confirmations });

        // No momento pegamos as confirmations. O ideal seria mudar para um estado intermediário
        // onde cada vez que chegar uma resposta da signature collection nós mudassemos o contexto
        // se a condição abaixo for verdadeira, ai sim quorum reached.
        // está sem failover para racing conditions tb.
        if (confirmations.length >= this.#config.epochThreshold) {
            await this.#stateMachine.send(EPOCH_EVENTS.QUORUM_REACHED);
        }
    }

    #dispatchApprovalRequests(proofProposal) {
        const { approvers } = this.#stateMachine.context;
        for (const member of approvers) {
            this.#operations.collectSignature(member, proofProposal)
                .then((confirmation) => this.#handleConfirmation(confirmation))
                .catch(() => {});
        }
    }  

    getScheduleInterval() {
        return this.#intervalMs;
    }

    async worker(next) {
        if (this.isInterrupted) return;

        const currentEpoch = await this.#state.currentEpochId();
        const currentEpochHash = await this.#state.getEpochHash(currentEpoch);
        this.#stateMachine.appendContext({ currentEpoch, currentEpochHash });
        await this.#stateMachine.send(EPOCH_EVENTS.START);
        this.#state.once(CustomEventType.EPOCH_CREATED, ({ epochId }) => {
            // We wait for the consensus to trigger the current view change for the upcoming epoch
            if (epochId === currentEpoch + 1) {
                next(this.#intervalMs)
            }
        })
    }

    // handler functions
    async #handleStartVdf() {        
        this.#logger.info(`[EpochService] state=${EPOCH_STATES.START_VDF}: scheduling next epoch in ${this.#intervalMs}ms`);
    }

    async #handleVdfPending(context) {
        this.#logger.info(`[EpochService] state=${EPOCH_STATES.VDF_PENDING}: calculating VDF`);
        const epochId = context.currentEpoch
        const epochHash = context.currentEpochHash
        this.#stateMachine.appendContext({ currentEpoch: epochId, currentEpochHash: epochHash, remoteProposalReceived: false });
        const vdf = await this.#operations.calculateVDF(epochHash);
        this.#stateMachine.appendContext({ vdf });
        await this.#stateMachine.send(EPOCH_EVENTS.CALCULATE_VDF);
    }

    async #handleVdfComputed(context) {
        this.#logger.info(`[EpochService] state=${EPOCH_STATES.VDF_COMPUTED}: VDF computed`);

        const { remoteProposalReceived } = context;
        
        if(remoteProposalReceived) {
            // This is wrong but lets leave it here for now
            this.#stateMachine.appendContext({ remoteProposalReceived: false });
            await this.#stateMachine.send(EPOCH_EVENTS.PROPOSE_EPOCH);
        } else {
            await this.#stateMachine.send(EPOCH_EVENTS.REMOTE_PROPOSAL_RECEIVED);
        }
    }

    async #handleProposingEpoch(context) {
        this.#logger.info(`[EpochService] state=${EPOCH_STATES.PROPOSING_EPOCH}: building proof proposal and dispatching approvals`);
        const { currentEpoch, currentEpochHash, vdf } = context;
        const newProofData = this.#operations.createProposal(currentEpoch, currentEpochHash, vdf);
        const proofProposal = await newProofData.toProposalMessage(this.#wallet);

        this.#stateMachine.appendContext({ newProofData });
        this.#stateMachine.appendContext({
            proofProposal,
            confirmations: [],
            approvers: await this.#operations.approvers(),
        });
        this.#dispatchApprovalRequests(proofProposal);
        await this.#stateMachine.send(EPOCH_EVENTS.APPROVAL_REQUESTS_DISPATCHED);
    }

    #handleCollectingConfirmations() {
        this.#logger.info(`[EpochService] state=${EPOCH_STATES.COLLECTING_CONFIRMATIONS}: waiting for approvals`);
    }

    #handleAwaitingEpoch() {
        this.#logger.info(`[EpochService] state=${EPOCH_STATES.AWAITING_EPOCH}: waiting for remote epoch append`);
    }

    async #handleLocalQuorumReached() {
        this.#logger.info(`[EpochService] state=${EPOCH_STATES.LOCAL_QUORUM_REACHED}: quorum reached, submitting epoch`);
        await this.#stateMachine.send(EPOCH_EVENTS.SUBMIT_EPOCH);
    }

    async #handleVdfSubmitted(context) {
        this.#logger.info(`[EpochService] state=${EPOCH_STATES.VDF_SUBMITTED}: appending epoch to state`);
        await this.#operations.appendEpoch({
            data: context.proofProposal.data,
            signature: context.proofProposal.signature,
            signatures: context.confirmations,
        });
        // APPEND_LOG is sent by the EPOCH_CREATED event handler after the Hyperbee batch commits
    }    
    // end of handler functions

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

    async #onTransition(event, _prev, next, context) {
        this.#logger.info(`[EpochService] transition event=${event ?? 'INIT'} -> ${next}`);
        const handler = this.#getTransitionHandler(next);
        if (handler) await handler(context);
    }
}

export default EpochProofProposalService;
