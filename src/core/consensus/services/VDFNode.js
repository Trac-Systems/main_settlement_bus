import { VDFService } from './VDFService.js';

export class VDFNode extends VDFService {
    #thread = null;
    #workerURL; // for test injection

    constructor (workerURL = new URL('./vdf-worker.js', import.meta.url)) {
        super();
        this.#workerURL = workerURL;
    }

    async _open() {
        const { Worker, MessageChannel } = await import('worker_threads');
        const { port1, port2 } = new MessageChannel();
        const port = this.#wrapNodePort(port1);
        this._setPort(port);
        this.#thread = new Worker(this.#workerURL, {
            workerData: { port: port2 },
            transferList: [port2],
        });
        this.#thread.on('error', (err) => port.rejectPending(err));
        this.#thread.on('exit', (code) => {
            if (code !== 0) port.rejectPending(new Error(`VDF worker exited with code ${code}`));
        });
    }

    async _close() {
        await this.#thread.terminate();
        await super._close();
    }

    #wrapNodePort(port) {
        const pending = [];
        const resolvers = [];

        port.on('message', (msg) => {
            if (resolvers.length > 0) {
                resolvers.shift()(msg);
            } else {
                pending.push(msg);
            }
        });

        return {
            write: (data) => { port.postMessage(data); return Promise.resolve(); },
            read: () => new Promise(resolve => {
                if (pending.length > 0) {
                    resolve(pending.shift());
                } else {
                    resolvers.push(resolve);
                }
            }),
            close: () => { port.close(); return Promise.resolve(); },
            rejectPending: (err) => {
                for (const resolve of resolvers) resolve ({ error: err });
                resolvers.length = 0;
            }
        };
    }
}
