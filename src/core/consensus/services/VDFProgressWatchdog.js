// These counters describe completed work, not timer heartbeats. Keep the order in
// sync between the solver thread and its guardian.
export const VDF_PROGRESS_PHASES = [
    'discriminant-sieve', 'discriminant-candidates', 'squaring', 'challenge-prime',
    'proof-setup', 'proof-blocks', 'proof-aggregation', 'serialization',
];

const MIN_PROGRESS_TIMEOUT_MS = 30_000;

/** Detects silence without imposing a deadline on the complete calculation. */
export class VDFProgressWatchdog {
    #now;
    #onStall;
    #timer;
    #lastProgress;
    #longestGap = 0;
    #counts = VDF_PROGRESS_PHASES.map(() => 0n);
    #stopped = false;
    #phase = 'startup';
    #ready = false;

    constructor({ now, onStall }) {
        this.#now = now;
        this.#onStall = onStall;
        this.#lastProgress = now();
        // Before the first observation there is no measured pace. This is a
        // startup allowance, not a limit derived from VDF difficulty or length.
        this.#arm(MIN_PROGRESS_TIMEOUT_MS);
    }

    ready() {
        if (this.#ready || this.#stopped) return;
        this.#ready = true;
        // Process/thread startup is separate from the native solver's pace.
        this.#lastProgress = this.#now();
    }

    progress(counts) {
        if (this.#stopped) return;
        if (!Array.isArray(counts) || counts.length !== this.#counts.length) {
            throw new Error('Invalid VDF progress counters');
        }
        const next = counts.map(count => {
            if (typeof count !== 'string' || !/^\d{1,20}$/.test(count)) {
                throw new Error('Invalid VDF progress counter');
            }
            return BigInt(count);
        });
        let advanced = false;
        for (let i = 0; i < next.length; i++) {
            if (next[i] < this.#counts[i]) throw new Error('VDF progress moved backwards');
            if (next[i] > this.#counts[i]) {
                advanced = true;
                this.#phase = VDF_PROGRESS_PHASES[i];
            }
        }
        if (!advanced) return;
        const now = this.#now();
        this.#longestGap = Math.max(this.#longestGap, now - this.#lastProgress);
        this.#lastProgress = now;
        this.#counts = next;
        this.#arm(Math.max(MIN_PROGRESS_TIMEOUT_MS, this.#longestGap * 8));
    }

    stop() {
        this.#stopped = true;
        clearTimeout(this.#timer);
    }

    #arm(delay) {
        clearTimeout(this.#timer);
        this.#timer = setTimeout(() => {
            this.stop();
            const error = new Error(`VDF stopped making progress (${this.#phase})`);
            error.code = 'VDF_STALLED';
            this.#onStall(error);
        }, Math.min(delay, 2_147_483_647));
    }
}
