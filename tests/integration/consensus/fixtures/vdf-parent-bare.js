import { VDFBare } from '../../../../src/core/consensus/services/VDFBare.js';
import subprocess from 'bare-subprocess';

const subscribe = subprocess.Subprocess.prototype.on;
subprocess.Subprocess.prototype.on = function (event, listener) {
    const result = subscribe.call(this, event, listener);
    if (event === 'exit') {
        console.log(JSON.stringify({ child: this.pid }));
        this.stdio[3].on('data', chunk => {
            if (chunk.toString().includes('"progress"')) console.log(JSON.stringify({ progress: true }));
        });
    }
    return result;
};

const service = new VDFBare();
await service.ready();
const response = await service.calculateVDF(Buffer.alloc(32, 1), 100_000_000, 512);
console.log(JSON.stringify({ error: String(response.error), result: !!response.result }));
await service.close();
