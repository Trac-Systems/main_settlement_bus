import { VDFService } from './VDFService.js';

export class VDFNode extends VDFService {
    #thread = null;

    async _open() {
        const { Worker, MessageChannel } = await import('worker_threads');
        const { port1, port2 } = new MessageChannel();
        this._setPort(this.#wrapNodePort(port1));
        this.#thread = new Worker(new URL('./vdf-worker.js', import.meta.url), {
            workerData: { port: port2 },
            transferList: [port2],
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
        };
    }
}
