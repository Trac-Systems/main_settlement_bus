import { VDFService } from './VDFService.js';

let bareBinaryPathPromise = null;

/**
 * Finds the bundled Bare executable and saves its path for later calls. Pear needs the actual file
 * path to start this worker. Sets the executable permission before using it.
 *
 * @returns {Promise<string>} Absolute executable path.
 */
async function resolveBareBinaryPath() {
    if (!bareBinaryPathPromise) {
        bareBinaryPathPromise = (async () => {
            const { fileURLToPath } = await import('bare-url');
            const fs = await import('bare-fs');

            const nodeModulesUrl = typeof globalThis.Pear !== 'undefined'
                ? `file://${globalThis.Pear.config.dir}/node_modules/`
                : new URL('../../../../node_modules/', import.meta.url).href;
            
            const binaryPath = fileURLToPath(
                new URL(`./bare-runtime-${Bare.platform}-${Bare.arch}/bin/bare`, nodeModulesUrl) // eslint-disable-line no-undef
            );

            // npm doesn't reliably preserve the executable bit on this binary across installs.
            await fs.promises.chmod(binaryPath, 0o755);

            return binaryPath;
        })();
    }
    return bareBinaryPathPromise;
}

/**
 * Runs each VDF calculation in a separate Bare process. This lets the parent stop the solver by
 * closing the process. Requests and responses use one JSON object per line. The service uses the same
 * write, read and close methods as the Node worker.
 */
class SubprocessPort {
    #workerScriptUrl;
    #workerProcess = null;
    #workerExitPromise = null;
    #workerResponsePromise = null;
    #resolvePendingResponse = null;
    #closed = false;

    /** @param {string} workerFileUrl file URL of the VDF worker script */
    constructor(workerFileUrl) {
        this.#workerScriptUrl = workerFileUrl;
    }

    /**
     * Starts a Bare process and sends the calculation to its standard input. Checks whether the port
     * was closed during setup before starting the process.
     *
     * @param {object} calculationRequest Worker calculation data.
     * @param {Buffer} calculationRequest.challenge Encoded epoch challenge.
     * @param {number} calculationRequest.difficulty VDF iteration count.
     * @param {number} calculationRequest.discriminantSizeBits Discriminant size in bits.
     * @returns {Promise<void>} Resolves after sending the request. Call read() for the result.
     */
    async write({ challenge, difficulty, discriminantSizeBits }) {
        if (this.#closed) throw new Error('VDF subprocess is closed');

        const { spawn } = await import('bare-subprocess');
        const { fileURLToPath } = await import('bare-url');

        const bareBinaryPath = await resolveBareBinaryPath();
        if (this.#closed) throw new Error('VDF subprocess is closed');

        const workerProcess = spawn(
            bareBinaryPath,
            [fileURLToPath(new URL(this.#workerScriptUrl))],
            { stdio: ['pipe', 'pipe', 'pipe'] }
        );
        this.#workerProcess = workerProcess;

        let resolveChildExit;
        this.#workerExitPromise = new Promise(resolve => {
            resolveChildExit = resolve;
        });

        // Attached synchronously, right after spawn, in the same tick as the write below -
        // no await/gap in between where a fast response or an unexpected early exit could
        // fire before a listener exists to catch it.
        this.#workerResponsePromise = new Promise(resolve => {
            let responseBuffer = '';
            let settled = false;

            const resolveWorkerResponse = (workerResponse) => {
                if (settled) return;
                settled = true;
                resolve(workerResponse);
                // Deferred to the next tick: killing the child synchronously here, in the
                // same tick as resolve(), was empirically linked to a downstream deadlock
                // elsewhere in the process (unrelated pending autobase/hyperbee work never
                // resolving) - reproduced and fixed by decoupling the kill from the resolve.
                setImmediate(() => workerProcess.kill('SIGKILL'));
            };
            this.#resolvePendingResponse = resolveWorkerResponse;

            workerProcess.stdout.on('data', (chunk) => {
                responseBuffer += chunk.toString();
                const newlineIndex = responseBuffer.indexOf('\n');
                if (newlineIndex === -1) return;
                const responseLine = responseBuffer.slice(0, newlineIndex);
                let encodedResponse;
                try {
                    encodedResponse = JSON.parse(responseLine);
                } catch {
                    // Not a Bare.Thread/bare-subprocess assumption - stdout is a boundary to an
                    // external process, so unexpected content there (e.g. a CLI usage error
                    // from spawning the wrong binary, as happened in manual QA) must fail the
                    // request instead of crashing the caller.
                    resolveWorkerResponse({ error: `VDF worker returned an invalid response: ${responseLine}` });
                    return;
                }
                resolveWorkerResponse(decodeWorkerResponse(encodedResponse));
            });

            workerProcess.on('exit', () => {
                resolveWorkerResponse({ error: 'VDF worker process exited unexpectedly' });
                resolveChildExit();
            });
        });

        try {
            workerProcess.stdin.write(JSON.stringify({
                challenge: challenge.toString('hex'),
                difficulty,
                discriminantSizeBits
            }) + '\n');
        } catch (error) {
            this.#resolvePendingResponse?.({ error });
            workerProcess.kill('SIGKILL');
            throw error;
        }
    }

    /**
     * Waits for the response and for the process to exit. Clears the references only if they still
     * belong to this calculation.
     *
     * @returns {Promise<import('./VDFService.js').VdfWorkerResponse>}
     */
    async read() {
        const workerResponse = this.#workerResponsePromise;
        const workerExitPromise = this.#workerExitPromise;
        if (!workerResponse) return { error: 'No pending VDF request' };

        try {
            const calculationResponse = await workerResponse;
            await workerExitPromise;
            return calculationResponse;
        } finally {
            if (this.#workerResponsePromise === workerResponse) {
                this.#workerProcess = null;
                this.#workerExitPromise = null;
                this.#workerResponsePromise = null;
                this.#resolvePendingResponse = null;
            }
        }
    }

    /**
     * Returns an error to the pending calculation, stops the process and waits for it to exit.
     *
     * @param {Error} error cancellation reason returned to the waiting calculation
     * @returns {Promise<void>}
     */
    async close(error = new Error('VDF subprocess closed')) {
        this.#closed = true;

        const workerProcess = this.#workerProcess;
        const workerExitPromise = this.#workerExitPromise;
        const workerResponse = this.#workerResponsePromise;

        this.#resolvePendingResponse?.({ error });
        workerProcess?.kill('SIGKILL');

        try {
            await Promise.all([workerResponse, workerExitPromise]);
        } finally {
            if (this.#workerProcess === workerProcess) this.#workerProcess = null;
            if (this.#workerExitPromise === workerExitPromise) this.#workerExitPromise = null;
            if (this.#workerResponsePromise === workerResponse) this.#workerResponsePromise = null;
            this.#resolvePendingResponse = null;
        }
    }
}

/**
 * Converts the challenge and solution in the worker response from hex to buffers.
 *
 * @param {object} encodedResponse Parsed JSON worker response.
 * @returns {import('./VDFService.js').VdfWorkerResponse}
 */
function decodeWorkerResponse(encodedResponse) {
    if (encodedResponse.error) return { error: encodedResponse.error };
    const { challenge, difficulty, discriminantSizeBits, solution } = encodedResponse.result;
    return {
        result: {
            challenge: Buffer.from(challenge, 'hex'),
            difficulty,
            discriminantSizeBits,
            solution: Buffer.from(solution, 'hex')
        }
    };
}

/**
 * Runs VDF calculations in Bare and Pear using separate processes. Messages use JSON between processes
 * and buffers inside the consensus module.
 */
export class VDFBare extends VDFService {
    #workerURL; // for test injection

    /**
     * Creates the Bare VDF service. A different worker URL can be provided for tests.
     *
     * @param {URL} workerURL Script to run in the worker process.
     */
    constructor(workerURL = new URL('./vdf-worker.js', import.meta.url)) {
        super();
        this.#workerURL = workerURL;
    }

    /** Creates the worker port used by VDFService. */
    async _open() {
        this._setPort(new SubprocessPort(this.#resolveWorkerFileUrl()));
    }

    /**
     * Returns the worker file URL that Bare or Pear can open.
     *
     * @returns {string}
     */
    #resolveWorkerFileUrl() {
        // Pear's `pear://dev/` module protocol isn't registered inside a freshly
        // spawned subprocess, so a pear:// reference (e.g. import.meta.url under
        // `pear run`) fails with UNKNOWN_PROTOCOL there. Pear.config.dir is the
        // real on-disk path this app runs from (trac-msb is always run via a
        // local directory link, not a seeded pear:// app), so build a plain
        // file:// URL from it instead. Outside Pear (plain `bare`), the injected/default
        // worker URL is already a file:// URL and works as-is.
        if (typeof globalThis.Pear !== 'undefined') {
            const applicationDirectory = globalThis.Pear.config.dir;
            return new URL('./vdf-worker.js', `file://${applicationDirectory}/src/core/consensus/services/`).href;
        }
        return this.#workerURL.href;
    }
}
