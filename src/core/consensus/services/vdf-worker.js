/**
 * Receives calculations and returns their results. Node uses workerData.port to pass binary messages.
 * Bare reads one JSON request per line from standard input and writes the response to standard output.
 * Solver errors are included in the response.
 */
import { VDF_PROGRESS_PHASES } from './VDFProgressWatchdog.js';
const { solveWesolowski } = await import('@tracsystems/trac-vdf');

/**
 * Runs the Wesolowski solver and returns the proof with its input parameters.
 *
 * @param {Buffer} challenge Encoded epoch challenge.
 * @param {number} difficulty VDF iteration count.
 * @param {number} discriminantSizeBits Discriminant size in bits.
 * @param {function({phase: string, completed: bigint}): void} [onProgress] Native progress observer.
 * @returns {Promise<import('./VDFService.js').VdfWorkerResponse>}
 */
async function solveVdfChallenge(challenge, difficulty, discriminantSizeBits, onProgress) {
    try {
        const solution = await solveWesolowski(challenge, difficulty, discriminantSizeBits, { onProgress });
        return { result: { challenge, difficulty, discriminantSizeBits, solution } };
    } catch (error) {
        return { error: error.message };
    }
}

if (typeof globalThis.Bare !== 'undefined') {
    // Runs as a standalone OS subprocess (spawned via bare-subprocess by VDFBare), not a
    // Bare.Thread: a real solveWesolowski() call leaves native/WASM state that crashes
    // Bare.Thread's teardown (V8's internal WASM compiler threads never rejoin cleanly), so
    // each computation gets its own disposable process instead - see VDFBare.js.
    const { default: Pipe } = await import('bare-pipe');
    const { default: Thread } = await import('bare-thread');
    const shared = new SharedArrayBuffer(8 + VDF_PROGRESS_PHASES.length * 8);
    const ready = new Int32Array(shared, 0, 1);
    const counters = new BigUint64Array(shared, 8, VDF_PROGRESS_PHASES.length);
    // Keep the guardian alive for the whole disposable process. It owns fd 3.
    const guardian = new Thread(new URL('./vdf-guardian.js', import.meta.url).href, { data: shared });
    while (Atomics.load(ready, 0) === 0) Atomics.wait(ready, 0, 0);
    if (guardian.joined) throw new Error('VDF guardian exited before calculation');
    const onProgress = ({ phase, completed }) => {
        const index = VDF_PROGRESS_PHASES.indexOf(phase);
        if (index === -1) throw new Error(`Unknown VDF progress phase: ${phase}`);
        Atomics.store(counters, index, completed);
    };
    const stdin = new Pipe(0);
    const stdout = new Pipe(1);

    let requestBuffer = '';
    stdin.on('data', async (chunk) => {
        requestBuffer += chunk.toString();
        const newlineIndex = requestBuffer.indexOf('\n');
        if (newlineIndex === -1) return;
        stdin.pause();
        const calculationRequest = JSON.parse(requestBuffer.slice(0, newlineIndex));
        const calculationResponse = await solveVdfChallenge(
            Buffer.from(calculationRequest.challenge, 'hex'),
            calculationRequest.difficulty,
            calculationRequest.discriminantSizeBits,
            onProgress
        );
        stdout.write(JSON.stringify(encodeWorkerResponse(calculationResponse)) + '\n');
    });

    /**
     * Converts buffers to hex so the Bare worker can send the response as JSON.
     *
     * @param {import('./VDFService.js').VdfWorkerResponse} calculationResponse Worker result.
     * @returns {object} Response that can be encoded as JSON.
     */
    function encodeWorkerResponse(calculationResponse) {
        if (calculationResponse.error) return { error: calculationResponse.error };
        const { challenge, difficulty, discriminantSizeBits, solution } = calculationResponse.result;
        return {
            result: {
                challenge: challenge.toString('hex'),
                difficulty,
                discriminantSizeBits,
                solution: solution.toString('hex')
            }
        };
    }
} else {
    const { workerData } = await import('worker_threads');
    const workerPort = workerData.port;

    workerPort.on('message', async (calculationRequest) => {
        workerPort.postMessage(await solveVdfChallenge(calculationRequest.challenge, calculationRequest.difficulty, calculationRequest.discriminantSizeBits));
    });
}
