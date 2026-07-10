import ReadyResource from 'ready-resource';
import Scheduler from './Scheduler.js';

/**
 * Base class for services that execute recurring work through the shared scheduler.
 *
 * Subclasses should implement:
 * - {@link SchedulableService#getScheduleInterval}
 * - {@link SchedulableService#worker}
 */
class SchedulableService extends ReadyResource {
    #scheduler = null;
    #isInterrupted = false;

    /**
     * Returns the default interval in milliseconds used between scheduled runs.
     *
     * @protected
     * @returns {number}
     */
    getScheduleInterval() {
        return 0;
    }

    /**
     * Runs a single scheduled cycle.
     *
     * Call `next(delayMs)` to override the next run delay; otherwise the scheduler uses
     * {@link SchedulableService#getScheduleInterval}.
     *
     * @protected
     * @param {(delayMs: number) => void} _next
     * @returns {Promise<void>|void}
     */
    worker(_next, _hold) {}

    /**
     * Indicates whether the service has requested interruption of scheduled work.
     *
     * @protected
     * @returns {boolean}
     */
    get isInterrupted() {
        return this.#isInterrupted;
    }

    /**
     * Indicates whether the scheduler is currently running.
     *
     * @protected
     * @returns {boolean}
     */
    get isSchedulerRunning() {
        return this.#scheduler?.isRunning ?? false;
    }

    /**
     * Starts the scheduler if it is not already running.
     *
     * @param {number} [initialDelayMs=0]
     * @returns {boolean}
     */
    start(initialDelayMs = 0) {
        this.#ensureScheduler();
        if (this.isSchedulerRunning) {
            console.info(`${this.constructor.name} is already started`);
            return false;
        }

        this.#isInterrupted = false;
        this.#scheduler.start(initialDelayMs);
        return true;
    }

    /**
     * Stops the scheduler if it is currently running.
     *
     * @param {boolean} [waitForCurrent=true]
     * @returns {Promise<boolean>}
     */
    async stop(waitForCurrent = true) {
        if (!this.isSchedulerRunning) return false;

        this.#isInterrupted = true;
        await this.#scheduler.stop(waitForCurrent);
        return true;
    }

    async _close() {
        await this.stop(true);
    }

    #ensureScheduler() {
        if (this.#scheduler) return;
        this.#scheduler = new Scheduler(
            (next, hold) => this.worker(next, hold),
            this.getScheduleInterval(),
        );
    }
}

export default SchedulableService;
