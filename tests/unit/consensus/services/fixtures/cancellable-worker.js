import { workerData } from 'worker_threads';

workerData.port.on('message', ({ challenge, difficulty, discriminantSizeBits }) => {
    if (challenge[0] === 1) return;

    workerData.port.postMessage({
        result: {
            challenge,
            difficulty,
            discriminantSizeBits,
            solution: new Uint8Array([challenge[0]]),
        },
    });
});
