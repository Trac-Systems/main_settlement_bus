/**
 * Scheduler is a utility for running a worker function on a recurring schedule with flexible timing.
 *
 * There are three time-related entities:
 *
 * 1. initialDelayMs (start):
 *    - Used to delay the very first execution after Scheduler is started.
 *    - Useful for resource initialization, startup backoff, or staged launches.
 *
 * 2. defaultInterval (constructor):
 *    - The fallback interval used between worker runs if no custom delay is scheduled.
 *    - Represents the "heartbeat" or normal cadence of the scheduler.
 *
 * 3. scheduleNext (runtime):
 *    - Allows the worker to dynamically adjust the next run's delay at runtime.
 *    - Enables backoff, fast retry, or adaptive scheduling based on workload or errors.
 *
 * This design allows for robust, adaptive scheduling: you can start with a delay, run at a default interval,
 * and dynamically adjust timing as needed for backoff or responsiveness.
 */
class Scheduler {
    #worker;
    #defaultInterval;
    #isRunning = false;
    #timer = null;
    #currentWorkerRun = null;

    /**
     * Creates a scheduler for one worker and its default interval.
     *
     * @param {Function} worker
     * @param {number} defaultInterval
     */
    constructor(worker, defaultInterval) {
        const interval = Scheduler.#validateDelay(defaultInterval ?? 100, 'defaultInterval');
        this.#worker = worker;
        this.#defaultInterval = interval;
    }

    /** @returns {boolean} true when the scheduler is running */
    get isRunning() {
        return this.#isRunning;
    }

    /** @returns {number} delay used when the worker does not set one */
    get defaultInterval() {
        return this.#defaultInterval;
    }

    /**
     * Converts and validates a scheduler delay.
     *
     * @returns {number}
     */
    static #validateDelay(delayMs, scope = 'delayMs') {
        const ms = Number(delayMs);
        if (!Number.isFinite(ms) || ms < 0) {
            throw new RangeError(`Invalid ${scope} value: ${delayMs}`);
        }
        return ms;
    }

    /** Starts the scheduler and sets the timer for the first run. */
    start(initialDelayMs = 0) {
        if (this.isRunning) return;
        const delayMs = Scheduler.#validateDelay(initialDelayMs, 'start delayMs');
        this.#isRunning = true;
        this.#next(delayMs);
    }

    /**
     * Runs one worker and schedules the next run.
     * hold() and scheduleNext() allow the worker to control the next timer.
     *
     * @returns {Promise<void>}
     */
    async run() {
        if (!this.isRunning) return;

        // `hold()` means the worker has taken responsibility for scheduling the next run itself,
        // by calling `scheduleNext(ms)` later - possibly long after this `run()` call has already
        // returned (e.g. from an event listener waiting on external confirmation). Because of that,
        // `scheduleNext` arms the timer directly instead of returning a delay for `run()` to hand
        // back to its caller - a delay handed back here would be meaningless once `run()` has
        // already resolved.
        let scheduleCalled = false;

        const hold = () => {
            scheduleCalled = true;
        }

        const scheduleNext = (ms) => {
            scheduleCalled = true;
            this.#next(Scheduler.#validateDelay(ms, 'scheduleNext delayMs'));
        };

        const workerRun = this.#worker(scheduleNext, hold);
        this.#currentWorkerRun = workerRun;
        try {
            await workerRun;
        } catch (error) {
            console.error('Worker error:', error);
            this.#next(this.defaultInterval);
            return;
        } finally {
            if (this.#currentWorkerRun === workerRun) {
                this.#currentWorkerRun = null;
            }
        }

        if (!scheduleCalled) {
            this.#next(this.defaultInterval);
        }
    }

    /** Replaces the current timer with a new timer. */
    #next(delayMs) {
        if (!this.isRunning) return;
        const ms = Scheduler.#validateDelay(delayMs, 'next delayMs');
        if (this.#timer) {
            clearTimeout(this.#timer);
        }
        this.#timer = setTimeout(() => {
            this.run();
        }, ms);
    }

    /**
     * Stops future runs and can wait for the current worker.
     *
     * @param {boolean} waitForCurrent
     * @returns {Promise<void>}
     */
    async stop(waitForCurrent = true) {
        if (!this.isRunning) return;
        this.#isRunning = false;

        if (this.#timer) {
            clearTimeout(this.#timer);
            this.#timer = null;
        }

        if (waitForCurrent && this.#currentWorkerRun) {
            await this.#currentWorkerRun;
        }
    }
}

export default Scheduler;
