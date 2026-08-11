const { solveWesolowski } = await import('@tracsystems/trac-vdf');

async function solve(challenge, difficulty, discriminantSizeBits) {
    try {
        const solution = await solveWesolowski(challenge, difficulty, discriminantSizeBits);
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
    const stdin = new Pipe(0);
    const stdout = new Pipe(1);

    let buffer = '';
    stdin.on('data', async (chunk) => {
        buffer += chunk.toString();
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) return;
        const request = JSON.parse(buffer.slice(0, newlineIndex));
        const response = await solve(
            Buffer.from(request.challenge, 'hex'),
            request.difficulty,
            request.discriminantSizeBits
        );
        stdout.write(JSON.stringify(encodeResponse(response)) + '\n');
    });

    function encodeResponse(response) {
        if (response.error) return { error: response.error };
        const { challenge, difficulty, discriminantSizeBits, solution } = response.result;
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
    const port = workerData.port;

    port.on('message', async (request) => {
        port.postMessage(await solve(request.challenge, request.difficulty, request.discriminantSizeBits));
    });
}
