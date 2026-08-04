import SchedulableService from "../../../utils/scheduler/SchedulableService.js";
import { EPOCH_EVENTS, EPOCH_STATES, EpochStateMachine } from "./EpochStateMachine.js";
import { ConsensusProtocolVersion, CustomEventType } from "../../../utils/constants.js";
import { Logger } from "../../../utils/logger.js";
import { createVDFService } from "./createVDFService.js";
import { EpochCoordinatorOperations } from './EpochCoordinatorOperations.js';
import { blake3 } from "trac-crypto-api/modules/hash.js"
import { createMessage, uint16ToBuffer, uint64ToBuffer, uint8ToBuffer } from "../../../utils/buffer.js";
import { addressToBuffer } from "../../state/utils/address.js"
import { vdfParamsToEntry } from "../../state/utils/epochProof.js"
import { sleep } from "../../../utils/helpers.js"

const listenTo = (eventEmitter, event, handler) => {
    eventEmitter.on(event, handler);
    return () => eventEmitter.off(event, handler);
}

class EpochCoordinatorService extends SchedulableService {
    #state;
    #wallet;
    #config;
    #manager;
    #intervalMs;
    #logger;
    #vdfService;
    #operations;

    /**
   * @param {object} state
   * @param {object} wallet
   * @param {object} config
   * @param {object} manager
   */
    constructor(state, wallet, config, manager) {
        super();
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
        this.#manager = manager;
        this.#intervalMs = this.#config.epochInterval;
        this.#logger = new Logger(config);
    }

    async _open() {
        this.#vdfService = await createVDFService();
        await this.#vdfService.ready();

        this.#operations = new EpochCoordinatorOperations(this.#state, this.#vdfService, this.#wallet, this.#config);
    }

    async _close() {
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

    async #getQuorum() {
        const indexerCount = await this.#state.indexerCount();
        return indexerCount <= 2 ? 1 : Math.floor(indexerCount / 2) + 1;
    }

    getScheduleInterval() {
        return this.#intervalMs;
    }

    async worker(next, hold) {
        if (!await this.#shouldRun()) {
            next(this.#intervalMs);
            return;
        }

        // prevent automatic scheduling which is required because the processing is async.
        hold();
        const machine = new EpochStateMachine(this.#logger, this.#buildHandlers());
        this.#setupListeners(machine)

        const scheduleNext = async (delay) => {
            await machine.close();
            next(delay);
        };

        // kick off the process
        await machine.enter({ next: scheduleNext });
    }

    async #handleLoadEpochContext(_context, machine) {
        // "snapshot"
        const currentEpoch = await this.#state.getCurrentEpoch();
        const currentEpochHash = await this.#state.getEpoch(currentEpoch);
        const { vdfDifficulty, vdfDiscriminantSize } = await this.#state.getSignedVDFParams();
        const quorum = await this.#getQuorum();

        machine.appendContext({ currentEpoch, currentEpochHash, vdfDifficulty, vdfDiscriminantSize, quorum });
        await machine.send(EPOCH_EVENTS.START);
    }

    // Transition handlers
    
    async #handleInitializeVdf(context, machine) {
        const { currentEpochHash, vdfDifficulty, vdfDiscriminantSize, currentEpoch } = context;
        const encodedVdfParamsEntry = vdfParamsToEntry({vdfDifficulty, vdfDiscriminantSize});
        const vdfHash = await blake3(encodedVdfParamsEntry);

        const challenge = createMessage(
            uint8ToBuffer(ConsensusProtocolVersion.V1), 
            uint16ToBuffer(this.#config.networkId),
            uint64ToBuffer(currentEpoch + 1n),
            currentEpochHash,
            addressToBuffer(this.#wallet.address, this.#config.addressPrefix),
            vdfHash
        );

        const vdf = await this.#operations.calculateVDF(challenge, vdfDifficulty, vdfDiscriminantSize);
        machine.appendContext({ vdf });
        await machine.send(EPOCH_EVENTS.LOCAL_PROOF_READY);
    }

    async #handleBuildAndSignProofProposal(context, machine) {
        const { currentEpoch, currentEpochHash, vdf } = context;
        const proofProposalMessage = await this.#operations.createProofProposal(currentEpoch, currentEpochHash, vdf);
        machine.appendContext({ proofProposalMessage, proofProposal: proofProposalMessage.proof_proposal });
        await machine.send(EPOCH_EVENTS.PROPOSAL_BUILT);
    }

    /**
     * If a competing proposal for this epoch was already seen, wait epochRemoteProposalTimeout
     * before broadcasting ours, so we don't race the other proposer.
     */
    async #handleQuorumDecision(context, machine) {
        if (context.remoteProposalReceived) {
            await sleep(this.#config.epochRemoteProposalTimeout);
            const latestEpoch = await this.#state.getCurrentEpoch();
            if (latestEpoch > context.currentEpoch) {
                await machine.send(EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED);
                return;
            }
        }

        if (context.quorum <= 1) {
            await machine.send(EPOCH_EVENTS.EXTERNAL_APPROVALS_NOT_REQUIRED);
        } else {
            await machine.send(EPOCH_EVENTS.EXTERNAL_APPROVALS_REQUIRED);
        }
    }

    async #handleSendProposalToIndexers(context, machine) {
        const approvers = await this.#operations.approvers();
        await this.#manager.connect();

        if (approvers.length + 1 < machine.context.quorum) {
            await machine.send(EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED);
            return;
        }

        const proposals = {
            approvers, approvals: [], rejections: [], closed: false,
        };
        machine.appendContext({ proposals });
        this.#dispatchApprovalRequests(approvers, context.proofProposalMessage, this.#manager, machine, proposals);
        await machine.send(EPOCH_EVENTS.PROPOSAL_BROADCAST);
    }

    #dispatchApprovalRequests(approvers, proofProposalMessage, indexerConnectionManager, machine, proposals) {
        for (const member of approvers) {
            this.#operations.collectSignature(member, proofProposalMessage, indexerConnectionManager)
                .then((confirmation) => this.#handleApproval(confirmation, proposals, machine))
                .catch((err) => this.#handleApprovalFailure(err, member, proposals, machine))
        }
    }

    async #handleApproval(confirmation, proposals, machine) {
        if (!proposals.closed) {
            proposals.approvals.push(confirmation); // this updates the reference in the context because the thing is an object pointer

            if (proposals.approvals.length + 1 >= machine.context.quorum) {
                proposals.closed = true;
                await machine.send(EPOCH_EVENTS.QUORUM_REACHED);
            }
        }
    }

    async #handleApprovalFailure(err, member, proposals, machine) {
        if (!proposals.closed) {
            proposals.rejections.push({ member, error: err });

            if (proposals.rejections.length > proposals.approvers.length - machine.context.quorum + 1) {
                proposals.closed = true;
                await machine.send(EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED);
            }
        }
    }

    async #handleBuildSetEpoch(context, machine) {
        const setEpochPayload = await this.#operations.buildSetEpochPayload(context.proofProposal, context.proposals?.approvals ?? []);
        machine.appendContext({ setEpochPayload });
        await machine.send(EPOCH_EVENTS.SET_EPOCH_BUILT);
    }

    async #handleRefreshSignedStateBeforeAppend(context, machine) {
        const latestEpochBeforeAppend = await this.#state.getCurrentEpoch();
        if (latestEpochBeforeAppend === context.currentEpoch) {
            await machine.send(EPOCH_EVENTS.TARGET_EPOCH_ABSENT);
        } else {
            await machine.send(EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED);
        }
    }

    async #handleAppendSetEpoch(context, machine) {
        let winningProposer = null;
        const stopListening = listenTo(this.#state, CustomEventType.EPOCH_CREATED, ({ epoch, proposerAddress }) => {
            if (epoch === context.currentEpoch + 1n) winningProposer = proposerAddress;
        });

        this.#operations.appendSetEpoch(context.setEpochPayload).then(
            async () => {
                stopListening();
                const latestEpoch = await this.#state.getCurrentEpoch();
                if (latestEpoch <= context.currentEpoch) {
                    await machine.send(EPOCH_EVENTS.APPEND_FAILED);
                } else if (winningProposer === this.#wallet.address) {
                    await machine.send(EPOCH_EVENTS.APPEND_ACCEPTED);
                } else {
                    await machine.send(EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED);
                }
            },
            async () => {
                stopListening();
                await machine.send(EPOCH_EVENTS.APPEND_FAILED);
            }
        )
    }

    async #handleSendAppendSignal(context, _machine) {
        context.next(this.#intervalMs);
    }

    async #handleRefreshSignedState(context, machine) {
        const latestEpoch = await this.#state.getCurrentEpoch();
        if (latestEpoch > context.currentEpoch) {
            await machine.send(EPOCH_EVENTS.NEW_EPOCH_DISCOVERED);
        } else if (context.vdf) {
            await machine.send(EPOCH_EVENTS.EPOCH_UNCHANGED_WITH_LOCAL_PROOF);
        } else {
            await machine.send(EPOCH_EVENTS.EPOCH_UNCHANGED_WITHOUT_LOCAL_PROOF);
        }
    }

    async #handleBackoff(context, _machine) {
        context.next(this.#intervalMs);
    }

    async #handleReloadSignedContext(_context, machine) {
        const currentEpoch = await this.#state.getCurrentEpoch();
        const currentEpochHash = await this.#state.getEpoch(currentEpoch);
        const { vdfDifficulty, vdfDiscriminantSize } = await this.#state.getSignedVDFParams();
        const quorum = await this.#getQuorum();
        machine.appendContext({
            currentEpoch,
            currentEpochHash,
            vdfDifficulty,
            vdfDiscriminantSize,
            quorum,
            vdf: undefined,
            proofProposalMessage: undefined,
            proofProposal: undefined,
            proposals: undefined,
            setEpochPayload: undefined,
            latestEpochBeforeAppend: undefined,
            remoteProposalReceived: undefined,
        });
        await machine.send(EPOCH_EVENTS.CONTEXT_RELOADED);
    }

    /** Any handler error ends the cycle via next() instead of leaving the machine stuck open. */
    #wrapHandler(handler) {
        return async (context, machine) => {
            try {
                await handler(context, machine);
            } catch (err) {
                this.#logger.error(`[EpochCoordinatorService] handler failed: ${err.message}`);
                context.next(this.#intervalMs);
            }
        };
    }

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
            Object.entries(handlers).map(([state, fn]) => [state, this.#wrapHandler(fn)])
        );
    }

    async #shouldRun() {
        const epoch = await this.#state.getCurrentEpoch()
        return epoch !== null && epoch >= 0n && !this.isInterrupted
    }

    #setupListeners(stateMachine) {
        const toClean = []

        // External events

        const cleanProposal = listenTo(this.#state, CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS, () => {
            stateMachine.appendContext({ remoteProposalReceived: true })
        })
        toClean.push(cleanProposal)

        // Machine states

        let signatureTimer = null;
        let appendTimer = null;
        stateMachine.on('*', ({ next, prev }) => {
            if (next === EPOCH_STATES.COLLECT_APPROVALS && prev !== EPOCH_STATES.COLLECT_APPROVALS) {
                signatureTimer = setTimeout(() => stateMachine.send(EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED), this.#config.epochSignatureTimeout);
            } else if (prev === EPOCH_STATES.COLLECT_APPROVALS && next !== EPOCH_STATES.COLLECT_APPROVALS) {
                clearTimeout(signatureTimer);
            }

            if (next === EPOCH_STATES.APPEND_SET_EPOCH && prev !== EPOCH_STATES.APPEND_SET_EPOCH) {
                appendTimer = setTimeout(() => stateMachine.send(EPOCH_EVENTS.APPEND_FAILED), this.#config.epochAppendTimeout);
            } else if (prev === EPOCH_STATES.APPEND_SET_EPOCH && next !== EPOCH_STATES.APPEND_SET_EPOCH) {
                clearTimeout(appendTimer);
            }
        })
        toClean.push(() => clearTimeout(signatureTimer))
        toClean.push(() => clearTimeout(appendTimer))

        stateMachine.once('close', () => toClean.forEach(cleanup => cleanup()))
    }
}

export default EpochCoordinatorService;
