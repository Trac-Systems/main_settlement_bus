import SchedulableService from '../../../utils/scheduler/SchedulableService.js';
import { Logger } from '../../../utils/logger.js';
import { CustomEventType } from '../../../utils/constants.js';
import { EpochCoordinationRound } from './EpochCoordinationRound.js';
import { VDFServiceManager } from './VDFServiceManager.js';

/**
 * Schedules epoch rounds on this indexer. When consensus config changes, cancels the current round,
 * replaces the VDF worker and resumes scheduling. All rounds use the same appender selector.
 */
class EpochCoordinatorService extends SchedulableService {
    #state;
    #wallet;
    #config;
    #indexerConnectionManager;
    #roundIntervalMs;
    #logger;
    #vdfServiceManager;
    #coordinationEnabled = false;
    #currentRound = null;
    #pendingRoundExecutions = new Set();
    #configReloadPromise = null;
    #cancelReloadDelay = null;
    #consensusConfigChangeListener;
    #appenderSelector;

    /**
     * Creates the scheduler and VDF service manager. Call start() to enable epoch rounds.
     *
     * @param {import('../../state/State.js').default} state Signed ledger access and consensus events.
     * @param {object} wallet Wallet used to sign local proofs.
     * @param {object} config Round intervals, timeouts and network configuration.
     * @param {import('../../network/services/IndexerConnectionManager.js').default} indexerConnectionManager Authenticated peer sessions.
     * @param {import('../epochAppenderSelection/EpochAppenderSelector.js').EpochAppenderSelector|null} [appenderSelector=null] Shared selector required once genesis is initialized.
     */
    constructor(state, wallet, config, indexerConnectionManager, appenderSelector = null) {
        super();
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
        this.#indexerConnectionManager = indexerConnectionManager;
        this.#appenderSelector = appenderSelector;
        this.#roundIntervalMs = config.epochInterval;
        this.#logger = new Logger(config);
        this.#vdfServiceManager = new VDFServiceManager(state, wallet, config);
        this.#consensusConfigChangeListener = this.#handleConfigChange.bind(this);
    }

    /**
     * Opens the VDF service and starts listening for consensus config changes.
     *
     * @returns {Promise<void>}
     */
    async _open() {
        await this.#vdfServiceManager.open();
        this.#state.on(CustomEventType.CONSENSUS_CONFIG_CHANGED, this.#consensusConfigChangeListener);
    }

    /**
     * Removes the config listener, cancels the current round and closes the VDF service. Does not wait
     * for network operations that cannot be cancelled.
     *
     * @returns {Promise<void>}
     */
    async _close() {
        this.#state.off(CustomEventType.CONSENSUS_CONFIG_CHANGED, this.#consensusConfigChangeListener);
        this.#coordinationEnabled = false;
        this.#cancelReloadDelay?.();

        const roundCancelled = this.#cancelCurrentRound();
        const schedulerStopped = super.stop(false);
        const vdfClosed = this.#vdfServiceManager.close();

        await Promise.all([
            roundCancelled,
            schedulerStopped,
            this.#configReloadPromise,
            vdfClosed,
        ]);
    }

    /**
     * Opens the VDF service if needed and starts the scheduler.
     *
     * @param {number} initialDelayMs delay before the first coordination round
     * @returns {Promise<boolean>} true when the scheduler was started
     */
    async start(initialDelayMs = this.#roundIntervalMs) {
        if (this.isSchedulerRunning || this.closing !== null || this.closed) return false;

        this.#coordinationEnabled = true;

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
        this.#coordinationEnabled = false;
        this.#cancelReloadDelay?.();
        const roundCancelled = this.#cancelCurrentRound();
        const schedulerStopped = await super.stop(false);

        await roundCancelled;
        if (waitForCurrent) {
            await Promise.allSettled([...this.#pendingRoundExecutions]);
        }

        return schedulerStopped;
    }

    /** @returns {number} delay between coordination rounds */
    getScheduleInterval() {
        return this.#roundIntervalMs;
    }

    /**
     * Starts one round and lets it schedule the next run. Only the current round may set the next
     * timer. A result from an older round cannot replace it.
     *
     * @param {function(number): void} scheduleNextRound Schedules the next round after the given delay in milliseconds.
     * @param {function(): void} holdScheduling Prevent the scheduler from scheduling automatically.
     * @returns {Promise<void>} Completes when run() returns. The round may still be active.
     */
    async worker(scheduleNextRound, holdScheduling) {
        if (!this.#canRun()) return;

        const epochOperations = this.#vdfServiceManager.operations;
        if (!epochOperations) return;

        holdScheduling();

        const round = new EpochCoordinationRound({
            state: this.#state,
            wallet: this.#wallet,
            config: this.#config,
            manager: this.#indexerConnectionManager,
            logger: this.#logger,
            operations: epochOperations,
            intervalMs: this.#roundIntervalMs,
            appenderSelector: this.#appenderSelector,
        });

        this.#replaceCurrentRound(round);

        const roundExecution = round.run((delayMs) => this.#scheduleNextRound(round, scheduleNextRound, delayMs));
        this.#pendingRoundExecutions.add(roundExecution);

        try {
            await roundExecution;
        } catch (error) {
            if (round !== this.#currentRound || !this.#canRun()) return;

            this.#logger.error(`[EpochCoordinatorService] round failed: ${error.message}`);
            await this.#cancelRound(round);
            this.#scheduleNextRound(round, scheduleNextRound, this.#roundIntervalMs);
        } finally {
            this.#pendingRoundExecutions.delete(roundExecution);
        }
    }

    /**
     * Waits for any config reload and opens the VDF service before scheduling starts. Repeats if
     * another reload starts while the service is opening.
     *
     * @returns {Promise<void>}
     */
    async #openVdf() {
        do {
            if (this.#configReloadPromise) await this.#configReloadPromise;
            await this.#vdfServiceManager.open();
        } while (this.#configReloadPromise);
    }

    /**
     * Checks whether the scheduler can run or schedule another round.
     *
     * @returns {boolean}
     */
    #canRun() {
        return this.#canStart() && !this.isInterrupted;
    }

    /**
     * Checks whether coordination is enabled and the service can start. A temporary scheduler stop
     * during config reload does not disable coordination.
     *
     * @returns {boolean}
     */
    #canStart() {
        return this.#coordinationEnabled && this.closing === null && !this.closed;
    }

    /**
     * Sets the current round and cancels the previous one.
     *
     * @param {EpochCoordinationRound} round New round to use for coordination.
     */
    #replaceCurrentRound(round) {
        const previousRound = this.#currentRound;
        this.#currentRound = round;

        if (previousRound) void this.#cancelRound(previousRound);
    }

    /**
     * Clears the current round and waits for its cancellation.
     *
     * @returns {Promise<void>}
     */
    async #cancelCurrentRound() {
        const round = this.#currentRound;
        this.#currentRound = null;

        if (round) await this.#cancelRound(round);
    }

    /**
     * Cancels a round and logs any cleanup error.
     *
     * @param {EpochCoordinationRound} round Round to cancel.
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
     * Schedules the next run if this round is still current. A callback from an older round cannot
     * change the timer.
     *
     * @param {EpochCoordinationRound} round Round requesting the next run.
     * @param {(delay: number) => void} scheduleNextRound Callback that sets the next scheduler timer.
     * @param {number} delayMs Delay before the next round, in milliseconds.
     */
    #scheduleNextRound(round, scheduleNextRound, delayMs) {
        if (round !== this.#currentRound || !this.#canRun()) return;

        this.#currentRound = null;
        scheduleNextRound(delayMs);
    }

    /**
     * Starts a consensus config reload. Events received during the same reload are ignored.
     *
     * @returns {void}
     */
    #handleConfigChange() {
        if (this.closing !== null || this.closed || this.#configReloadPromise) return;
        this.#configReloadPromise = this.#reloadConfig();
    }

    /**
     * Cancels the round, stops the scheduler and reloads VDF. Restarts scheduling if coordination is
     * still enabled.
     *
     * @returns {Promise<void>}
     */
    async #reloadConfig() {
        const shouldRestart = this.#coordinationEnabled;

        try {
            await Promise.all([
                this.#cancelCurrentRound(),
                super.stop(false),
                shouldRestart ? this.#reloadVdf() : this.#vdfServiceManager.close(),
            ]);
        } catch (error) {
            this.#logger.error(`[EpochCoordinatorService] config reload failed: ${error.message}`);
            return;
        } finally {
            this.#configReloadPromise = null;
        }

        if (!shouldRestart) return;
        if (!this.#vdfServiceManager.operations || !this.#canStart()) return;

        super.start(0);
    }

    /** Reloads VDF and retries on failure while coordination remains enabled. */
    async #reloadVdf() {
        while (this.#canStart()) {
            try {
                await this.#vdfServiceManager.replace();
                return true;
            } catch (error) {
                if (!this.#canStart()) return false;

                this.#logger.error(
                    `[EpochCoordinatorService] config reload failed: ${error.message}; ` +
                    `retrying in ${this.#config.epochBackoffDelay}ms`,
                );
                await this.#waitBeforeVdfReloadRetry();
            }
        }

        return false;
    }

    /**
     * Waits before retrying a VDF reload. stop() and close() end the wait early.
     *
     * @returns {Promise<void>} Resolves when the timer ends or the wait is cancelled.
     */
    #waitBeforeVdfReloadRetry() {
        return new Promise(resolve => {
            const timer = setTimeout(resolve, this.#config.epochBackoffDelay);
            this.#cancelReloadDelay = () => {
                clearTimeout(timer);
                resolve();
            };
        }).finally(() => {
            this.#cancelReloadDelay = null;
        });
    }
}

export default EpochCoordinatorService;
