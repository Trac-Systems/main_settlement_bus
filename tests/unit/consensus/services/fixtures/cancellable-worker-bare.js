const { default: Pipe } = await import('bare-pipe');

const stdin = new Pipe(0);
const stdout = new Pipe(1);
let buffer = '';

stdin.on('data', (chunk) => {
    buffer += chunk.toString();
    const newlineIndex = buffer.indexOf('\n');
    if (newlineIndex === -1) return;

    const request = JSON.parse(buffer.slice(0, newlineIndex));
    if (request.challenge.startsWith('01')) return;

    stdout.write(JSON.stringify({
        result: {
            challenge: request.challenge,
            difficulty: request.difficulty,
            discriminantSizeBits: request.discriminantSizeBits,
            solution: request.challenge.slice(0, 2),
        },
    }) + '\n');
});
