import Pipe from 'bare-pipe';
import { kill, pid } from 'bare-os';
import { self } from 'bare-thread';
import { VDF_PROGRESS_PHASES } from './VDFProgressWatchdog.js';

// This thread never executes WASM: its event loop remains responsive while the
// solver blocks the subprocess's main thread. EOF also works after parent SIGKILL.
const owner = new Pipe(3);
const die = () => kill(pid(), 'SIGKILL');
owner.on('end', die);
owner.on('close', die);
owner.on('error', die);
owner.resume();

const ready = new Int32Array(self.data, 0, 1);
const counters = new BigUint64Array(self.data, 8, VDF_PROGRESS_PHASES.length);
let previous = VDF_PROGRESS_PHASES.map(() => '0');
let writable = true;
owner.on('drain', () => { writable = true; });

setInterval(() => {
    if (!writable) return;
    const progress = previous.map((_, i) => Atomics.load(counters, i).toString());
    if (progress.every((count, i) => count === previous[i])) return;
    previous = progress;
    writable = owner.write(JSON.stringify({ progress }) + '\n');
}, 100);

// Arm ownership monitoring before the main thread enters the native solver.
owner.write(JSON.stringify({ ready: true }) + '\n');
Atomics.store(ready, 0, 1);
Atomics.notify(ready, 0);
