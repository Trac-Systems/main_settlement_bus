import SchedulableService from '../../../utils/scheduler/SchedulableService.js';
import { Logger } from '../../../utils/logger.js';
import { CustomEventType } from '../../../utils/constants.js';
import { EpochCoordinationRound } from './EpochCoordinationRound.js';
import { VDFServiceManager } from './VDFServiceManager.js';

class EpochCoordinatorService extends SchedulableService {
    #state;
    #wallet;
    #config;
    #manager;
    #intervalMs;
    #logger;
    #vdfManager;
    #enabled = false;
    #currentRound = null;
    #unfinishedRounds = new Set();
    #configReload = null;
    #configChangeListener;

    /**
     * Creates the coordinator and its VDF manager.
     * The scheduler is started later by {@link start}.
     *
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
        this.#intervalMs = config.epochInterval;
        this.#logger = new Logger(config);
        this.#vdfManager = new VDFServiceManager(state, wallet, config);
        this.#configChangeListener = this.#handleConfigChange.bind(this);
    }

    /**
     * Opens the first VDF service and starts listening for config changes.
     *
     * @returns {Promise<void>}
     */
    async _open() {
        await this.#vdfManager.open();
        this.#state.on(CustomEventType.CONSENSUS_CONFIG_CHANGED, this.#configChangeListener);
    }

    /**
     * Stops listening for config changes, cancels the current round and closes the VDF.
     * It does not wait for network operations which cannot be cancelled.
     *
     * @returns {Promise<void>}
     */
    async _close() {
        this.#state.off(CustomEventType.CONSENSUS_CONFIG_CHANGED, this.#configChangeListener);
        this.#enabled = false;

        const roundCancelled = this.#cancelCurrentRound();
        const schedulerStopped = super.stop(false);
        const vdfClosed = this.#vdfManager.close();

        await Promise.all([
            roundCancelled,
            schedulerStopped,
            this.#configReload,
            vdfClosed,
        ]);
    }

    /**
     * Makes sure that VDF is ready and starts the scheduler.
     *
     * @param {number} initialDelayMs delay before the first coordination round
     * @returns {Promise<boolean>} true when the scheduler was started
     */
    async start(initialDelayMs = this.#intervalMs) {
        if (this.isSchedulerRunning || this.closing !== null || this.closed) return false;

        this.#enabled = true;

        try {
            await this.#openVdf();
        } catch (error) {
            this.#logger.error(`[EpochCoordinatorService] failed to initialize VDF service: ${error.message}`);
            return false;
        }

        if (!this.#canStart()) return false;
        return super.start(initialDelayMs);
    }

    /**
     * Stops the scheduler and cancels the current round.
     *
     * @param {boolean} waitForCurrent wait for operations which have already started
     * @returns {Promise<boolean>} true when a running scheduler was stopped
     */
    async stop(waitForCurrent = true) {
        this.#enabled = false;
        const roundCancelled = this.#cancelCurrentRound();
        const stopped = await super.stop(false);

        await roundCancelled;
        if (waitForCurrent) {
            await Promise.allSettled([...this.#unfinishedRounds]);
        }

        return stopped;
    }

    /** @returns {number} delay between coordination rounds */
    getScheduleInterval() {
        return this.#intervalMs;
    }

    /**
     * Creates and runs one coordination round.
     * The round is stored before async work starts, so stop() can always cancel it.
     *
     * @param {(delay: number) => void} next schedules the next worker run
     * @param {() => void} hold marks scheduling as owned by the round
     * @returns {Promise<void>}
     */
    async worker(next, hold) {
        if (!this.#canRun()) return;

        const operations = this.#vdfManager.operations;
        if (!operations) return;

        hold();

        const round = new EpochCoordinationRound({
            state: this.#state,
            wallet: this.#wallet,
            config: this.#config,
            manager: this.#manager,
            logger: this.#logger,
            operations,
            intervalMs: this.#intervalMs,
        });

        this.#replaceCurrentRound(round);

        const roundRun = round.run((delay) => this.#scheduleNextRound(round, next, delay));
        this.#unfinishedRounds.add(roundRun);

        try {
            await roundRun;
        } catch (error) {
            if (round !== this.#currentRound || !this.#canRun()) return;

            this.#logger.error(`[EpochCoordinatorService] round failed: ${error.message}`);
            await this.#cancelRound(round);
            this.#scheduleNextRound(round, next, this.#intervalMs);
        } finally {
            this.#unfinishedRounds.delete(roundRun);
        }
    }

    /**
     * Waits for the current config reload and opens VDF before the scheduler starts.
     * It repeats when another reload starts while VDF is opening.
     *
     * @returns {Promise<void>}
     */
    async #openVdf() {
        do {
            if (this.#configReload) await this.#configReload;
            await this.#vdfManager.open();
        } while (this.#configReload);
    }

    /**
     * Checks if a worker can run or schedule an epoch round.
     * It also checks if stop() interrupted the scheduler.
     *
     * @returns {boolean}
     */
    #canRun() {
        return this.#canStart() && !this.isInterrupted;
    }

    /**
     * Checks if the coordinator is enabled and can start the scheduler.
     * It ignores the temporary scheduler stop used during a config reset.
     *
     * @returns {boolean}
     */
    #canStart() {
        return this.#enabled && this.closing === null && !this.closed;
    }

    /**
     * Stores the new current round and cancels the previous one.
     *
     * @param {EpochCoordinationRound} round
     */
    #replaceCurrentRound(round) {
        const previousRound = this.#currentRound;
        this.#currentRound = round;

        if (previousRound) this.#cancelRound(previousRound);
    }

    /**
     * Cancels the current round and removes it from the coordinator.
     *
     * @returns {Promise<void>}
     */
    async #cancelCurrentRound() {
        const round = this.#currentRound;
        this.#currentRound = null;

        if (round) await this.#cancelRound(round);
    }

    /**
     * Cancels a round and logs a cleanup error instead of passing it to the caller.
     *
     * @param {EpochCoordinationRound} round
     * @returns {Promise<void>}
     */
    async #cancelRound(round) {
        try {
            await round.cancel();
        } catch (error) {
            this.#logger.error(`[EpochCoordinatorService] failed to cancel epoch round: ${error.message}`);
        }
    }

    /**
     * Schedules the next run only for the current round.
     * A callback from an old round cannot replace the new timer.
     *
     * @param {EpochCoordinationRound} round
     * @param {(delay: number) => void} next
     * @param {number} delay
     */
    #scheduleNextRound(round, next, delay) {
        if (round !== this.#currentRound || !this.#canRun()) return;

        this.#currentRound = null;
        next(delay);
    }

    /**
     * Handles a consensus config change.
     * It cancels the round first, replaces the old VDF and starts the scheduler again.
     * Repeated signals use the same reset which is already running.
     *
     * @returns {void}
     */
    #handleConfigChange() {
        if (this.closing !== null || this.closed || this.#configReload) return;
        this.#configReload = this.#reloadConfig();
    }

    /**
     * Stops the current round and reloads VDF.
     * If the coordinator was running, it starts again without delay.
     *
     * @returns {Promise<void>}
     */
    async #reloadConfig() {
        const shouldRestart = this.#enabled;

        try {
            const roundCancelled = this.#cancelCurrentRound();
            const schedulerStopped = super.stop(false);
            let vdfReload;

            if (shouldRestart) {
                vdfReload = this.#vdfManager.replace();
            } else {
                vdfReload = this.#vdfManager.close();
            }

            await schedulerStopped;
            await roundCancelled;
            await vdfReload;
        } catch (error) {
            this.#logger.error(`[EpochCoordinatorService] config reload failed: ${error.message}`);
            return;
        } finally {
            this.#configReload = null;
        }

        if (!shouldRestart) return;
        if (!this.#vdfManager.operations || !this.#canStart()) return;

        super.start(0);
    }
}

export default EpochCoordinatorService;
