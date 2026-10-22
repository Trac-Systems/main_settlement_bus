import b4a from 'b4a';
import { CustomEventType, EPOCH_BYTE_LENGTH } from '../../../utils/constants.js';
import { EPOCH_EVENTS, EPOCH_STATES } from './EpochStateMachine.js';

/**
 * Adds an event listener and returns a function which removes it.
 *
 * @returns {() => void}
 */
const listenTo = (eventEmitter, event, handler) => {
    eventEmitter.on(event, handler);
    return () => eventEmitter.off(event, handler);
};

/** Keeps event listeners and timers for one epoch round. */
export class EpochRoundListeners {
    #state;
    #machine;
    #config;
    #isRoundActive;
    #cleanups = [];
    #onEpochProgress;

    /** Creates listeners for one state machine round. */
    constructor({ state, machine, config, isRoundActive, onEpochProgress }) {
        this.#state = state;
        this.#machine = machine;
        this.#config = config;
        this.#isRoundActive = isRoundActive;
        this.#onEpochProgress = onEpochProgress;
    }

    /**
     * Starts listeners and timers for this round.
     * They are removed when the state machine closes.
     */
    start() {
        this.#listenForRemoteProposal();
        this.#listenForEpochCreated();
        this.#listenForStateTransitions();

        this.#machine.once('close', () => this.#cleanup());
    }

    /** Removes all listeners and timers created by {@link start}. */
    #cleanup() {
        for (const cleanup of this.#cleanups.splice(0)) {
            cleanup();
        }
    }

    /** Only a proposal for this round's epoch and parent can delay local coordination. */
    #listenForRemoteProposal() {
        this.#cleanups.push(
            listenTo(this.#state, CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS, (event) => {
                if (!this.#isRoundActive()) return;
                const { currentEpoch, currentEpochHash } = this.#machine.context;
                const { epoch, previous_epoch_record_hash: previousHash } = event?.proofProposal ?? {};
                // Validation can finish after the round that received the proposal has ended.
                if (typeof currentEpoch !== 'bigint') return;
                if (!b4a.isBuffer(epoch) || epoch.length !== EPOCH_BYTE_LENGTH) return;
                if (epoch.readBigUInt64BE(0) !== currentEpoch + 1n) return;
                if (!b4a.isBuffer(currentEpochHash) || !b4a.isBuffer(previousHash)) return;
                if (!b4a.equals(previousHash, currentEpochHash)) return;
                this.#machine.appendContext({ remoteProposalReceived: true });
            }),
        );
    }

    /** Asks the round to verify signed progress when an epoch event arrives. */
    #listenForEpochCreated() {
        this.#cleanups.push(
            listenTo(this.#state, CustomEventType.EPOCH_CREATED, async () => {
                if (!this.#isRoundActive()) return;
                await this.#onEpochProgress();
            }),
        );
    }

    /** Starts and clears the proof approval timer. */
    #listenForStateTransitions() {
        let signatureTimer = null;

        this.#machine.on('*', ({ next, prev }) => {
            if (!this.#isRoundActive()) return;

            if (next === EPOCH_STATES.COLLECT_APPROVALS && prev !== EPOCH_STATES.COLLECT_APPROVALS) {
                signatureTimer = setTimeout(
                    () => {
                        if (this.#isRoundActive()) {
                            this.#machine.send(EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED);
                        }
                    },
                    this.#config.epochSignatureTimeout,
                );
            } else if (prev === EPOCH_STATES.COLLECT_APPROVALS && next !== EPOCH_STATES.COLLECT_APPROVALS) {
                clearTimeout(signatureTimer);
            }
        });

        this.#cleanups.push(() => clearTimeout(signatureTimer));
    }
}
