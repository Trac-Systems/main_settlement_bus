import { VDFService } from './VDFService.js';

let bareBinaryPathPromise = null;

// Resolves the bare-runtime native binary bundled via the `bare-runtime` project dependency,
// instead of using Bare.argv[0]. Under `pear run .`, Bare.argv[0] is Pear's own pear-runtime
// binary, whose CLI expects `pear run <link>`-style arguments rather than a raw script path -
// spawning it directly with the worker script path produces a "Unrecognized Argument" usage
// error instead of running the worker (reproduced while diagnosing a crash surfaced in manual
// QA). Resolving our own bundled bare-runtime-<platform>-<arch> binary works the same
// regardless of what launched the current process.
//
// The path is built directly from Pear.config.dir/import.meta.url rather than through ES
// module resolution (e.g. import.meta.resolve): Pear's `pear://dev/` module resolver doesn't
// reliably see bare-runtime's platform-specific optional dependency, even by its literal
// package name, and returns MODULE_NOT_FOUND for it despite npm installing it fine (also
// reproduced in manual QA - worked outside Pear, failed under `pear run .`). Reading the
// already-installed file straight off disk sidesteps that resolver entirely, the same way
// #workerFileUrl() below already does for vdf-worker.js.
async function resolveBareBinaryPath() {
    if (!bareBinaryPathPromise) {
        bareBinaryPathPromise = (async () => {
            const { fileURLToPath } = await import('bare-url');
            const fs = await import('bare-fs');

            const nodeModulesUrl = typeof globalThis.Pear !== 'undefined'
                ? `file://${globalThis.Pear.config.dir}/node_modules/`
                : new URL('../../../../node_modules/', import.meta.url).href;
            const binaryPath = fileURLToPath(
                new URL(`./bare-runtime-${Bare.platform}-${Bare.arch}/bin/bare`, nodeModulesUrl)
            );

            // npm doesn't reliably preserve the executable bit on this binary across installs.
            await fs.promises.chmod(binaryPath, 0o755);

            return binaryPath;
        })();
    }
    return bareBinaryPathPromise;
}

// Each VDF computation runs in its own disposable OS subprocess instead of a Bare.Thread:
// a real solveWesolowski() call leaves native/WASM state that crashes Bare.Thread's teardown
// (V8's internal WASM compiler threads never rejoin cleanly - reproduced in isolation, with
// no trac-vdf/Bare.Thread-specific code involved beyond calling the function once). A crash
// in a short-lived, disposable subprocess after it has already reported its result is
// harmless to the parent process, so shutdown is a plain SIGKILL instead of a graceful join.
class SubprocessPort {
    #workerFileUrl;
    #child = null;
    #pendingResponse = null;

    constructor(workerFileUrl) {
        this.#workerFileUrl = workerFileUrl;
    }

    async write({ challenge, difficulty, discriminantSizeBits }) {
        const { spawn } = await import('bare-subprocess');
        const { fileURLToPath } = await import('bare-url');

        const bareBinaryPath = await resolveBareBinaryPath();
        const child = spawn(
            bareBinaryPath,
            [fileURLToPath(new URL(this.#workerFileUrl))],
            { stdio: ['pipe', 'pipe', 'pipe'] }
        );
        this.#child = child;

        // Attached synchronously, right after spawn, in the same tick as the write below -
        // no await/gap in between where a fast response or an unexpected early exit could
        // fire before a listener exists to catch it.
        this.#pendingResponse = new Promise(resolve => {
            let buffer = '';
            let settled = false;

            const finish = (response) => {
                if (settled) return;
                settled = true;
                resolve(response);
                // Deferred to the next tick: killing the child synchronously here, in the
                // same tick as resolve(), was empirically linked to a downstream deadlock
                // elsewhere in the process (unrelated pending autobase/hyperbee work never
                // resolving) - reproduced and fixed by decoupling the kill from the resolve.
                setImmediate(() => child.kill('SIGKILL'));
            };

            child.stdout.on('data', (chunk) => {
                buffer += chunk.toString();
                const newlineIndex = buffer.indexOf('\n');
                if (newlineIndex === -1) return;
                const line = buffer.slice(0, newlineIndex);
                let message;
                try {
                    message = JSON.parse(line);
                } catch {
                    // Not a Bare.Thread/bare-subprocess assumption - stdout is a boundary to an
                    // external process, so unexpected content there (e.g. a CLI usage error
                    // from spawning the wrong binary, as happened in manual QA) must fail the
                    // request instead of crashing the caller.
                    finish({ error: `VDF worker returned an invalid response: ${line}` });
                    return;
                }
                finish(decodeResponse(message));
            });

            child.on('exit', () => finish({ error: 'VDF worker process exited unexpectedly' }));
        });

        child.stdin.write(JSON.stringify({
            challenge: challenge.toString('hex'),
            difficulty,
            discriminantSizeBits
        }) + '\n');
    }

    async read() {
        const response = this.#pendingResponse;
        this.#child = null;
        this.#pendingResponse = null;
        return response ?? { error: 'No pending VDF request' };
    }

    async close() {
        this.#child?.kill('SIGKILL');
        this.#child = null;
        this.#pendingResponse = null;
    }
}

function decodeResponse(message) {
    if (message.error) return { error: message.error };
    const { challenge, difficulty, discriminantSizeBits, solution } = message.result;
    return {
        result: {
            challenge: Buffer.from(challenge, 'hex'),
            difficulty,
            discriminantSizeBits,
            solution: Buffer.from(solution, 'hex')
        }
    };
}

export class VDFBare extends VDFService {
    #workerURL; // for test injection

    constructor(workerURL = new URL('./vdf-worker.js', import.meta.url)) {
        super();
        this.#workerURL = workerURL;
    }

    async _open() {
        this._setPort(new SubprocessPort(this.#workerFileUrl()));
    }

    #workerFileUrl() {
        // Pear's `pear://dev/` module protocol isn't registered inside a freshly
        // spawned subprocess, so a pear:// reference (e.g. import.meta.url under
        // `pear run`) fails with UNKNOWN_PROTOCOL there. Pear.config.dir is the
        // real on-disk path this app runs from (trac-msb is always run via a
        // local directory link, not a seeded pear:// app), so build a plain
        // file:// URL from it instead. Outside Pear (plain `bare`), the injected/default
        // worker URL is already a file:// URL and works as-is.
        if (typeof globalThis.Pear !== 'undefined') {
            const baseDir = globalThis.Pear.config.dir;
            return new URL('./vdf-worker.js', `file://${baseDir}/src/core/consensus/services/`).href;
        }
        return this.#workerURL.href;
    }
}
