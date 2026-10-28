import test from 'brittle';

// A separate host survives the application SIGKILL and can both assert and clean
// up the subprocess. POSIX signals are exercised, not mocked worker events.
if (typeof globalThis.Bare === 'undefined' && process.platform !== 'win32') {
    const { spawn } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const { once } = await import('node:events');
    const binary = fileURLToPath(new URL(`../../../node_modules/bare-runtime-${process.platform}-${process.arch}/bin/bare`, import.meta.url));
    const fixture = fileURLToPath(new URL('./fixtures/vdf-parent-bare.js', import.meta.url));
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    function alive(pid) {
        try { process.kill(pid, 0); return true; } catch (error) {
            if (error.code === 'ESRCH') return false;
            throw error;
        }
    }

    for (const when of ['startup', 'computing']) {
        test(`parent SIGKILL during ${when} leaves no running VDF process`, { timeout: 15000 }, async t => {
            const parent = spawn(binary, [fixture], { stdio: ['ignore', 'pipe', 'pipe'] });
            const exited = once(parent, 'exit');
            const children = new Set();
            let buffer = '';
            let stderr = '';
            let progress = false;
            parent.stderr.on('data', chunk => { stderr += chunk; });
            parent.stdout.on('data', chunk => {
                buffer += chunk;
                let newline;
                while ((newline = buffer.indexOf('\n')) !== -1) {
                    const event = JSON.parse(buffer.slice(0, newline));
                    buffer = buffer.slice(newline + 1);
                    if (event.child) children.add(event.child);
                    if (event.progress) progress = true;
                }
            });
            t.teardown(async () => {
                parent.kill('SIGKILL');
                for (const pid of children) {
                    try { process.kill(pid, 'SIGKILL'); } catch (error) {
                        if (error.code !== 'ESRCH') throw error;
                    }
                }
                await exited;
            }, { force: true });

            const deadline = Date.now() + 10000;
            while ((!children.size || (when === 'computing' && !progress)) && Date.now() < deadline) {
                if (parent.exitCode !== null || parent.signalCode !== null) throw new Error(`Parent exited: ${stderr}`);
                await delay(5);
            }
            t.is(children.size, 1, 'a real VDF subprocess was created');
            if (!children.size) throw new Error(`No child: ${stderr}`);
            if (when === 'computing') t.ok(progress, 'native solver was making live progress before SIGKILL');
            const child = [...children][0];
            t.ok(alive(child));
            const killedAt = Date.now();
            parent.kill('SIGKILL');
            await exited;
            while (alive(child) && Date.now() - killedAt < 5000) await delay(10);
            t.absent(alive(child), 'guardian terminates the orphan without assistance from the dead parent');
            t.comment(`VDF exited within ${Date.now() - killedAt} ms of parent SIGKILL`);
        });
    }
}
