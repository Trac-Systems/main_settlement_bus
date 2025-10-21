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
        this.#worker = worker;
        this.#defaultInterval = defaultInterval ?? 100;
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

    start(initialDelayMs = 0) {
        if (this.isRunning) return;
        this.#isRunning = true;
        this.#next(initialDelayMs);
    }

    async run() {
        if (!this.isRunning) return null;

        let scheduleCalled = false;
        let nextDelay = null;

        const scheduleNext = (ms) => {
            const delayMs = Number(ms);

            if (!Number.isFinite(delayMs) || delayMs < 0) {
                throw new RangeError(`Invalid scheduleNext value: ${ms}`);
            }

            scheduleCalled = true;
            nextDelay = delayMs;
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

        this.#timer = setTimeout(async () => {
            const nextDelay = await this.run();
            if (this.isRunning) {
                this.#next(nextDelay);
            }
        }, delayMs);
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
