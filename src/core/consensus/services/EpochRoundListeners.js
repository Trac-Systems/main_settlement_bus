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
    #wallet;
    #config;
    #intervalMs;
    #isRoundActive;
    #cleanups = [];

    /** Creates listeners for one state machine round. */
    constructor({ state, machine, wallet, config, intervalMs, isRoundActive }) {
        this.#state = state;
        this.#machine = machine;
        this.#wallet = wallet;
        this.#config = config;
        this.#intervalMs = intervalMs;
        this.#isRoundActive = isRoundActive;
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

    /** Saves information about a valid remote proposal. */
    #listenForRemoteProposal() {
        this.#cleanups.push(
            listenTo(this.#state, CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS, () => {
                if (!this.#isRoundActive()) return;
                this.#machine.appendContext({ remoteProposalReceived: true });
            }),
        );
    }

    /** Restarts coordination when a new epoch is created outside the append state. */
    #listenForEpochCreated() {
        this.#cleanups.push(
            listenTo(this.#state, CustomEventType.EPOCH_CREATED, async () => {
                if (!this.#isRoundActive()) return;
                if (this.#machine.state !== EPOCH_STATES.APPEND_SET_EPOCH) {
                    await this.#machine.close();
                    await this.#machine.context.next(this.#intervalMs);
                }
            }),
        );
    }

    /**
     * Starts and clears approval and append timers.
     * The EPOCH_CREATED listener exists only in APPEND_SET_EPOCH state.
     */
    #listenForStateTransitions() {
        let signatureTimer = null;
        let appendTimer = null;
        let stopAppendListener = null;

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

            if (next === EPOCH_STATES.APPEND_SET_EPOCH) {
                appendTimer = setTimeout(
                    () => {
                        if (this.#isRoundActive()) this.#machine.send(EPOCH_EVENTS.APPEND_FAILED);
                    },
                    this.#config.epochAppendTimeout,
                );

                const targetEpoch = this.#machine.context.currentEpoch + 1n;
                stopAppendListener = listenTo(
                    this.#state,
                    CustomEventType.EPOCH_CREATED,
                    (event) => {
                        if (!this.#isRoundActive()) return;

                        const { epoch, proposerAddress } = event ?? {};
                        if (!b4a.isBuffer(epoch) || epoch.length !== EPOCH_BYTE_LENGTH) return;

                        const eventEpoch = epoch.readBigUInt64BE(0);
                        if (eventEpoch !== targetEpoch) return;
                        this.#machine.send(
                            proposerAddress === this.#wallet.address
                                ? EPOCH_EVENTS.APPEND_ACCEPTED
                                : EPOCH_EVENTS.TARGET_EPOCH_ALREADY_SIGNED,
                        );
                    },
                );
            } else if (prev === EPOCH_STATES.APPEND_SET_EPOCH) {
                clearTimeout(appendTimer);
                stopAppendListener?.();
                stopAppendListener = null;
            }
        });

        this.#cleanups.push(() => clearTimeout(signatureTimer));
        this.#cleanups.push(() => clearTimeout(appendTimer));
        this.#cleanups.push(() => stopAppendListener?.());
    }
}
