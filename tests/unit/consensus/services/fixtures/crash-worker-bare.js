const { default: Pipe } = await import('bare-pipe');
const stdin = new Pipe(0);

stdin.on('data', () => {
    Bare.exit(1);
});
