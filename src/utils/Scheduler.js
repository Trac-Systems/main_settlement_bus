class Scheduler {
    #worker;
    #defaultInterval;
    #isRunning = false;
    #timer = null;
    #currentWorkerRun = null;

    constructor(worker, defaultInterval) {
        if (typeof worker !== 'function') {
            throw new TypeError('Worker must be a function');
        }
        const interval = Scheduler.#validateDelay(defaultInterval ?? 100, 'defaultInterval');
        this.#worker = worker;
        this.#defaultInterval = interval;
    }

    get isRunning() {
        return this.#isRunning;
    }

    get defaultInterval() {
        return this.#defaultInterval;
    }

    get timer() {
        return this.#timer;
    }

    get currentWorkerRun() {
        return this.#currentWorkerRun;
    }

    static #validateDelay(delayMs, scope = 'delayMs') {
        const ms = Number(delayMs);
        if (!Number.isFinite(ms) || ms < 0) {
            throw new RangeError(`Invalid ${scope} value: ${delayMs}`);
        }
        return ms;
    }

    start(initialDelayMs = 0) {
        if (this.isRunning) return;
        const delayMs = Scheduler.#validateDelay(initialDelayMs, 'start delayMs');
        this.#isRunning = true;
        this.#next(delayMs);
    }

    async run() {
        if (!this.isRunning) return null;

        let scheduleCalled = false;
        let nextDelay = null;

        const scheduleNext = (ms) => {
            scheduleCalled = true;
            nextDelay = Scheduler.#validateDelay(ms, 'scheduleNext delayMs');
        };

        this.#currentWorkerRun = this.#worker(scheduleNext);
        try {
            await this.#currentWorkerRun; // this await is needed here because #worker can be async
        } catch (error) {
            console.error('Worker error:', error);
            return this.defaultInterval;
        } finally {
            this.#currentWorkerRun = null;
        }

        return scheduleCalled ? nextDelay : this.defaultInterval;
    }

    #next(delayMs) {
        if (!this.isRunning) return;
        const ms = Scheduler.#validateDelay(delayMs, 'next delayMs');
        this.#timer = setTimeout(async () => {
            const nextDelay = await this.run();
            if (this.isRunning) {
                this.#next(nextDelay);
            }
        }, ms);
    }

    async stop(waitForCurrent = true) {
        if (!this.isRunning) return;
        this.#isRunning = false;

        if (this.#timer) {
            clearTimeout(this.#timer);
            this.#timer = null;
        }

        if (waitForCurrent && this.#currentWorkerRun) {
            await this.#currentWorkerRun; // this await is needed here because #worker can be async
        }
    }
}

export default Scheduler;
