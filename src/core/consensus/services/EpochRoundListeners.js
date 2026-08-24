import { SCHEDULABLE_SERVICE_EVENTS } from '../../../utils/scheduler/SchedulableService.js';
import { CustomEventType } from '../../../utils/constants.js';
import { EPOCH_EVENTS, EPOCH_STATES } from './EpochStateMachine.js';

const listenTo = (eventEmitter, event, handler) => {
    eventEmitter.on(event, handler);
    return () => eventEmitter.off(event, handler);
};

/** Owns event subscriptions and timers for one epoch round. */
export class EpochRoundListeners {
    #state;
    #stopEmitter;
    #machine;
    #wallet;
    #config;
    #intervalMs;
    #cleanups = [];

    constructor({ state, stopEmitter, machine, wallet, config, intervalMs }) {
        this.#state = state;
        this.#stopEmitter = stopEmitter;
        this.#machine = machine;
        this.#wallet = wallet;
        this.#config = config;
        this.#intervalMs = intervalMs;
    }

    start() {
        this.#listenForStop();
        this.#listenForRemoteProposal();
        this.#listenForEpochCreated();
        this.#listenForStateTransitions();

        this.#machine.once('close', () => this.#cleanup());
    }

    #cleanup() {
        for (const cleanup of this.#cleanups.splice(0)) {
            cleanup();
        }
    }

    #listenForStop() {
        this.#cleanups.push(
            listenTo(this.#stopEmitter, SCHEDULABLE_SERVICE_EVENTS.STOP, () => {
                this.#machine.close();
            }),
        );
    }

    #listenForRemoteProposal() {
        this.#cleanups.push(
            listenTo(this.#state, CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS, () => {
                this.#machine.appendContext({ remoteProposalReceived: true });
            }),
        );
    }

    #listenForEpochCreated() {
        this.#cleanups.push(
            listenTo(this.#state, CustomEventType.EPOCH_CREATED, async () => {
                if (this.#machine.state !== EPOCH_STATES.APPEND_SET_EPOCH) {
                    await this.#machine.close();
                    this.#machine.context.next(this.#intervalMs);
                }
            }),
        );
    }

    #listenForStateTransitions() {
        let signatureTimer = null;
        let appendTimer = null;
        let stopAppendListener = null;

        this.#machine.on('*', ({ next, prev }) => {
            if (next === EPOCH_STATES.COLLECT_APPROVALS && prev !== EPOCH_STATES.COLLECT_APPROVALS) {
                signatureTimer = setTimeout(
                    () => this.#machine.send(EPOCH_EVENTS.APPROVAL_COLLECTION_FAILED),
                    this.#config.epochSignatureTimeout,
                );
            } else if (prev === EPOCH_STATES.COLLECT_APPROVALS && next !== EPOCH_STATES.COLLECT_APPROVALS) {
                clearTimeout(signatureTimer);
            }

            if (next === EPOCH_STATES.APPEND_SET_EPOCH) {
                appendTimer = setTimeout(
                    () => this.#machine.send(EPOCH_EVENTS.APPEND_FAILED),
                    this.#config.epochAppendTimeout,
                );

                const targetEpoch = this.#machine.context.currentEpoch + 1n;
                stopAppendListener = listenTo(
                    this.#state,
                    CustomEventType.EPOCH_CREATED,
                    ({ epoch, proposerAddress }) => {
                        if (epoch !== targetEpoch) return;
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
