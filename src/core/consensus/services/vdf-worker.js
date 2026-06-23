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
    const { default: Channel } = await import('bare-channel');
    const channel = Channel.from(globalThis.Bare.Thread.self.data);
    const port = channel.connect();

    for await (const request of port) {
        await port.write(await solve(request.challenge, request.difficulty, request.discriminantSizeBits));
    }
} else {
    const { workerData } = await import('worker_threads');
    const port = workerData.port;

    port.on('message', async (request) => {
        port.postMessage(await solve(request.challenge, request.difficulty, request.discriminantSizeBits));
    });
}
