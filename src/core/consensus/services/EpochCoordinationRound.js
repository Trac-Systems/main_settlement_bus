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
import { sleep } from '../../../utils/helpers.js';
import { EpochRoundListeners } from './EpochRoundListeners.js';

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

    constructor({ state, wallet, config, manager, logger, operations, intervalMs, stopEmitter }) {
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
        this.#manager = manager;
        this.#logger = logger;
        this.#operations = operations;
        this.#intervalMs = intervalMs;
        this.#machine = new EpochStateMachine(this.#buildHandlers());
        this.#listeners = new EpochRoundListeners({
            state,
            wallet,
            config,
            intervalMs,
            stopEmitter,
            machine: this.#machine,
        });
    }

    /** Starts the transition chain; the round may remain open while waiting for an external event. */
    async run(next) {
        this.#listeners.start();

        const scheduleNext = async (delay) => {
            await this.#machine.close();
            next(delay);
        };

        await this.#machine.enter({ next: scheduleNext });
    }

    async #getQuorum() {
        const indexerCount = await this.#state.indexerCount();
        return indexerCount <= 2 ? 1 : Math.floor(indexerCount / 2) + 1;
    }

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

        machine.appendContext({ currentEpoch, currentEpochHash, vdfDifficulty, vdfDiscriminantSize, quorum });
        await machine.send(EPOCH_EVENTS.START);
    }

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
            machine.appendContext({ vdf });
            await machine.send(EPOCH_EVENTS.LOCAL_PROOF_READY);
        } catch (error) {
            this.#logger.error(error);
            await machine.send(EPOCH_EVENTS.SOLVER_FAILURE);
        }
    }

    async #handleBuildAndSignProofProposal(context, machine) {
        const { currentEpoch, currentEpochHash, vdf } = context;
        const proofProposalMessage = await this.#operations.createProofProposal(currentEpoch, currentEpochHash, vdf);
        machine.appendContext({ proofProposalMessage, proofProposal: proofProposalMessage.proof_proposal });
        await machine.send(EPOCH_EVENTS.PROPOSAL_BUILT);
    }

    async #handleQuorumDecision(context, machine) {
        if (context.remoteProposalReceived) {
            await sleep(this.#config.epochRemoteProposalTimeout);
            const latestEpoch = await this.#state.getCurrentEpoch();
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

    async #handleSendProposalToIndexers(context, machine) {
        const approvers = await this.#operations.approvers();
        await this.#manager.connect();

        if (approvers.length + 1 < machine.context.quorum) {
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

    #dispatchApprovalRequests(approvers, machine, proposals) {
        for (const member of approvers) {
            const { currentEpoch, currentEpochHash, vdf } = machine.context;
            this.#operations.collectSignature(
                member,
                { currentEpoch, currentEpochHash, vdf },
                this.#manager,
            )
                .then((confirmation) => this.#handleApproval(confirmation, proposals, machine))
                .catch((error) => this.#handleApprovalFailure(error, member, proposals, machine));
        }
    }

    async #handleApproval(confirmation, proposals, machine) {
        if (proposals.closed) return;

        proposals.approvals.push(confirmation);
        if (proposals.approvals.length + 1 >= machine.context.quorum) {
            proposals.closed = true;
            await machine.send(EPOCH_EVENTS.QUORUM_REACHED);
        }
    }

    async #handleApprovalFailure(error, member, proposals, machine) {
        if (proposals.closed) return;

        proposals.rejections.push({ member, error });
        if (proposals.rejections.length > proposals.approvers.length - machine.context.quorum + 1) {
            proposals.closed = true;
            await machine.send(EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED);
        }
    }

    async #handleBuildSetEpoch(context, machine) {
        const setEpochPayload = await this.#operations.buildSetEpochPayload(
            context.proofProposal,
            context.proposals?.approvals ?? [],
        );
        machine.appendContext({ setEpochPayload });
        await machine.send(EPOCH_EVENTS.SET_EPOCH_BUILT);
    }

    async #handleRefreshSignedStateBeforeAppend(context, machine) {
        const latestEpochBeforeAppend = await this.#state.getCurrentEpoch();
        await machine.send(
            latestEpochBeforeAppend === context.currentEpoch
                ? EPOCH_EVENTS.TARGET_EPOCH_ABSENT
                : EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED,
        );
    }

    async #handleAppendSetEpoch(context, machine) {
        try {
            await this.#operations.appendSetEpoch(context.setEpochPayload);
            // append() only makes the operation durable locally. EPOCH_CREATED or the
            // append timeout decides whether this round succeeded.
        } catch (error) {
            this.#logger.error(error);
            await machine.send(EPOCH_EVENTS.APPEND_FAILED);
        }
    }

    async #handleSendAppendSignal(context) {
        context.next(this.#intervalMs);
    }

    async #handleRefreshSignedState(context, machine) {
        await this.#state.refresh();
        const latestEpoch = await this.#state.getCurrentEpoch();

        if (latestEpoch > context.currentEpoch) {
            await machine.send(EPOCH_EVENTS.NEW_EPOCH_DISCOVERED);
        } else if (context.vdf) {
            await machine.send(EPOCH_EVENTS.EPOCH_UNCHANGED_WITH_LOCAL_PROOF);
        } else {
            await machine.send(EPOCH_EVENTS.EPOCH_UNCHANGED_WITHOUT_LOCAL_PROOF);
        }
    }

    async #handleBackoff(_context, machine) {
        await machine.send(EPOCH_EVENTS.BACKOFF_ELAPSED);
    }

    async #handleReloadSignedContext(context, machine) {
        await machine.close();
        context.next(this.#intervalMs);
    }

    #wrapHandler(handler) {
        return async (context, machine) => {
            try {
                await handler(context, machine);
            } catch (error) {
                this.#logger.error(`[EpochCoordinatorService] handler failed: ${error.message}`);
                await machine.close();
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
            Object.entries(handlers).map(([state, handler]) => [state, this.#wrapHandler(handler)]),
        );
    }

}
