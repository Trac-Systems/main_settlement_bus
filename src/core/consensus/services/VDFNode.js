import { VDFService } from './VDFService.js';

export class VDFNode extends VDFService {
    #thread = null;
    #workerURL; // for test injection

    /**
     * Creates the Node adapter. The worker URL can be replaced by tests.
     *
     * @param {URL} workerURL
     */
    constructor (workerURL = new URL('./vdf-worker.js', import.meta.url)) {
        super();
        this.#workerURL = workerURL;
    }

    /**
     * Creates a worker thread and installs a MessagePort compatible with VDFService.
     *
     * @returns {Promise<void>}
     * @protected
     */
    async _open() {
        const { Worker, MessageChannel } = await import('worker_threads');
        const { port1, port2 } = new MessageChannel();
        const port = this.#wrapNodePort(port1);
        this._setPort(port);
        this.#thread = new Worker(this.#workerURL, {
            workerData: { port: port2 },
            transferList: [port2],
        });
        this.#thread.on('error', (err) => port.fail(err));
        this.#thread.on('exit', (code) => {
            port.fail(new Error(`VDF worker exited with code ${code}`));
        });
    }

    /**
     * Cancels pending port reads before terminating the worker thread.
     *
     * @returns {Promise<void>}
     * @protected
     */
    async _close() {
        await super._close();
        await this.#thread?.terminate();
        this.#thread = null;
    }

    /**
     * Adds the write, read and close methods required by VDFService to a Node MessagePort.
     * A worker error also finishes all pending reads.
     *
     * @param {import('worker_threads').MessagePort} port
     * @returns {object}
     */
    #wrapNodePort(port) {
        const pending = [];
        const resolvers = [];
        let closed = false;
        let closeError = null;

        const fail = (error) => {
            if (closed) return;

            closed = true;
            closeError = error instanceof Error ? error : new Error(String(error));
            pending.length = 0;
            for (const resolve of resolvers) resolve({ error: closeError });
            resolvers.length = 0;
            port.close();
        };

        port.on('message', (msg) => {
            if (closed) return;

            if (resolvers.length > 0) {
                resolvers.shift()(msg);
            } else {
                pending.push(msg);
            }
        });
        port.on('close', () => fail(new Error('VDF worker port closed')));

        return {
            write: (data) => {
                if (closed) return Promise.reject(closeError);
                port.postMessage(data);
                return Promise.resolve();
            },
            read: () => new Promise(resolve => {
                if (pending.length > 0) {
                    resolve(pending.shift());
                } else if (closed) {
                    resolve({ error: closeError });
                } else {
                    resolvers.push(resolve);
                }
            }),
            close: (error = new Error('VDF worker closed')) => {
                fail(error);
                return Promise.resolve();
            },
            fail,
        };
    }
}
