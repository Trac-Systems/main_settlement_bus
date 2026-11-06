import { VDFService } from './VDFService.js';

/**
 * Runs VDF calculations in a Node worker thread. Provides the write, read and close methods used by
 * VDFService.
 */
export class VDFNode extends VDFService {
    #workerThread = null;
    #workerURL; // for test injection

    /**
     * Creates the Node VDF service. A different worker URL can be provided for tests.
     *
     * @param {URL} workerURL Script to run in the worker thread.
     */
    constructor (workerURL = new URL('./vdf-worker.js', import.meta.url)) {
        super();
        this.#workerURL = workerURL;
    }

    /**
     * Starts a worker thread and connects its MessagePort to VDFService.
     *
     * @returns {Promise<void>}
     * @protected
     */
    async _open() {
        const { Worker, MessageChannel } = await import('worker_threads');
        const { port1, port2 } = new MessageChannel();
        const workerPortAdapter = this.#createWorkerPortAdapter(port1);
        this._setPort(workerPortAdapter);
        this.#workerThread = new Worker(this.#workerURL, {
            workerData: { port: port2 },
            transferList: [port2],
        });
        this.#workerThread.on('error', (workerError) => workerPortAdapter.fail(workerError));
        this.#workerThread.on('exit', (exitCode) => {
            workerPortAdapter.fail(new Error(`VDF worker exited with code ${exitCode}`));
        });
    }

    /**
     * Cancels pending reads and stops the worker thread.
     *
     * @returns {Promise<void>}
     * @protected
     */
    async _close() {
        await super._close();
        await this.#workerThread?.terminate();
        this.#workerThread = null;
    }

    /**
     * Keeps worker responses until read() is called. If the worker fails or closes, returns the same
     * error to all pending reads and clears stored responses.
     *
     * @param {import('worker_threads').MessagePort} messagePort Node message port used by the parent process.
     * @returns {import('./VDFService.js').VdfWorkerPort & {fail: function(Error): void}} Worker port with a callback for reporting worker errors.
     */
    #createWorkerPortAdapter(messagePort) {
        const bufferedResponses = [];
        const pendingReaders = [];
        let closed = false;
        let closeError = null;

        const failPendingReads = (error) => {
            if (closed) return;

            closed = true;
            closeError = error instanceof Error ? error : new Error(String(error));
            bufferedResponses.length = 0;
            for (const resolve of pendingReaders) resolve({ error: closeError });
            pendingReaders.length = 0;
            messagePort.close();
        };

        messagePort.on('message', (workerResponse) => {
            if (closed) return;

            if (pendingReaders.length > 0) {
                pendingReaders.shift()(workerResponse);
            } else {
                bufferedResponses.push(workerResponse);
            }
        });
        messagePort.on('close', () => failPendingReads(new Error('VDF worker port closed')));

        return {
            write: (calculationRequest) => {
                if (closed) return Promise.reject(closeError);
                messagePort.postMessage(calculationRequest);
                return Promise.resolve();
            },
            read: () => new Promise(resolve => {
                if (bufferedResponses.length > 0) {
                    resolve(bufferedResponses.shift());
                } else if (closed) {
                    resolve({ error: closeError });
                } else {
                    pendingReaders.push(resolve);
                }
            }),
            close: (error = new Error('VDF worker closed')) => {
                failPendingReads(error);
                return Promise.resolve();
            },
            fail: failPendingReads,
        };
    }
}
