const { default: Pipe } = await import('bare-pipe');
const stdin = new Pipe(0);
const stdout = new Pipe(1);

stdin.on('data', () => {
    stdout.write('✖ Unrecognized Argument\n');
});
