import b4a from 'b4a';
import { CustomEventType, EPOCH_BYTE_LENGTH } from '../../../utils/constants.js';
import { EPOCH_EVENTS, EPOCH_STATES } from './EpochStateMachine.js';

/**
 * Adds an event listener and returns a function that removes it.
 *
 * @param {object} eventEmitter Event source with on and off methods.
 * @param {string} event Event name.
 * @param {Function} handler Listener called by the source.
 * @returns {function(): void} Removes this listener.
 */
const listenTo = (eventEmitter, event, handler) => {
    eventEmitter.on(event, handler);
    return () => eventEmitter.off(event, handler);
};

/**
 * Listens for validated proposals and epoch events during one round. Manages the approval timeout and
 * asks the round to check signed epoch progress. Closing the round's FSM removes the listeners and
 * timers.
 */
export class EpochRoundListeners {
    #state;
    #epochStateMachine;
    #config;
    #isRoundActive;
    #listenerCleanups = [];
    #checkSignedEpochProgress;

    /**
     * Sets the event sources and callbacks for this round. start() adds the listeners.
     *
     * @param {object} dependencies Services and callbacks used by this round.
     * @param {object} dependencies.state Ledger and consensus event emitter.
     * @param {import('./EpochStateMachine.js').EpochStateMachine} dependencies.machine Round FSM.
     * @param {object} dependencies.config Supplies epochSignatureTimeout in milliseconds.
     * @param {function(): boolean} dependencies.isRoundActive Rejects late events after cancellation or completion.
     * @param {function(): Promise<void>} dependencies.onEpochProgress Checks signed progress after an epoch event.
     */
    constructor({ state, machine: epochStateMachine, config, isRoundActive, onEpochProgress: checkSignedEpochProgress }) {
        this.#state = state;
        this.#epochStateMachine = epochStateMachine;
        this.#config = config;
        this.#isRoundActive = isRoundActive;
        this.#checkSignedEpochProgress = checkSignedEpochProgress;
    }

    /** Starts this round's listeners and timers. They are removed when the FSM closes. */
    start() {
        this.#listenForValidatedProposals();
        this.#listenForEpochCreated();
        this.#manageApprovalDeadline();

        this.#epochStateMachine.once('close', () => this.#removeListenersAndTimers());
    }

    /** Removes the listeners and timers added by start(). */
    #removeListenersAndTimers() {
        for (const cleanup of this.#listenerCleanups.splice(0)) {
            cleanup();
        }
    }

    /** Marks a remote proposal only if it matches this round's epoch and parent hash. */
    #listenForValidatedProposals() {
        this.#listenerCleanups.push(
            listenTo(this.#state, CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS, (event) => {
                if (!this.#isRoundActive()) return;
                const { currentEpoch, currentEpochHash } = this.#epochStateMachine.context;
                const { epoch, previous_epoch_record_hash: proposalParentHash } = event?.proofProposal ?? {};
                // Validation can finish after the round that received the proposal has ended.
                if (typeof currentEpoch !== 'bigint') return;
                if (!b4a.isBuffer(epoch) || epoch.length !== EPOCH_BYTE_LENGTH) return;
                if (epoch.readBigUInt64BE(0) !== currentEpoch + 1n) return;
                if (!b4a.isBuffer(currentEpochHash) || !b4a.isBuffer(proposalParentHash)) return;
                if (!b4a.equals(proposalParentHash, currentEpochHash)) return;
                this.#epochStateMachine.appendContext({ remoteProposalReceived: true });
            }),
        );
    }

    /** Asks the round to check signed progress when an epoch event arrives. */
    #listenForEpochCreated() {
        this.#listenerCleanups.push(
            listenTo(this.#state, CustomEventType.EPOCH_CREATED, async () => {
                if (!this.#isRoundActive()) return;
                await this.#checkSignedEpochProgress();
            }),
        );
    }

    /** Starts the approval timer when collection begins and clears it when collection ends. */
    #manageApprovalDeadline() {
        let approvalDeadlineTimer = null;

        this.#epochStateMachine.on('*', ({ next, prev }) => {
            if (!this.#isRoundActive()) return;

            if (next === EPOCH_STATES.COLLECT_APPROVALS && prev !== EPOCH_STATES.COLLECT_APPROVALS) {
                approvalDeadlineTimer = setTimeout(
                    () => {
                        if (this.#isRoundActive()) {
                            this.#epochStateMachine.send(EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED);
                        }
                    },
                    this.#config.epochSignatureTimeout,
                );
            } else if (prev === EPOCH_STATES.COLLECT_APPROVALS && next !== EPOCH_STATES.COLLECT_APPROVALS) {
                clearTimeout(approvalDeadlineTimer);
            }
        });

        this.#listenerCleanups.push(() => clearTimeout(approvalDeadlineTimer));
    }
}
