/**
 * @typedef {object} VdfWorkerResponse
 * @property {{challenge: Buffer, difficulty: number, discriminantSizeBits: number, solution: Buffer}} [result] Successful calculation.
 * @property {Error|string} [error] Error from the worker, connection or cancellation.
 *
 * @typedef {object} VdfWorkerPort
 * @property {function({challenge: Buffer, difficulty: number, discriminantSizeBits: number}): Promise<void>} write Start a calculation.
 * @property {function(): Promise<VdfWorkerResponse>} read Wait for that calculation's response.
 * @property {function(Error): Promise<void>} close Cancels pending reads and closes the worker port.
 */
import ReadyResource from 'ready-resource';

/**
 * Runs VDF calculations one at a time through the worker port. The Node and Bare services manage their
 * workers. This class queues calculations and returns results and errors in the same format.
 */
export class VDFService extends ReadyResource {
    #workerPort = null;
    #calculationQueue = Promise.resolve();

    /**
     * Sets the worker port opened by the Node or Bare service.
     *
     * @param {VdfWorkerPort} workerPort Worker port used by this service.
     * @protected
     */
    _setPort(workerPort) {
        this.#workerPort = workerPort;
    }

    /**
     * Closes the worker port and waits for queued calculations to finish.
     *
     * @returns {Promise<void>}
     * @protected
     */
    async _close() {
        const workerPort = this.#workerPort;
        this.#workerPort = null;

        const [closeResult] = await Promise.allSettled([
            workerPort?.close(new Error('VDF service closed')),
            this.#calculationQueue,
        ]);

        if (closeResult.status === 'rejected') throw closeResult.reason;
    }

    /**
     * Queues a calculation with the signed VDF parameters. Requests made after shutdown return an
     * error without reaching the worker.
     *
     * @param {Buffer} challenge Encoded epoch challenge.
     * @param {number} difficulty VDF iteration count.
     * @param {number} discriminantSizeBits Discriminant size in bits.
     * @returns {Promise<VdfWorkerResponse>} Response containing the result or an error.
     */
    async calculateVDF(challenge, difficulty, discriminantSizeBits) {
        if (this.closing !== null || this.closed) {
            return { error: new Error('VDF service is closed') };
        }

        const calculationPromise = this.#calculationQueue.then(() => this.#calculateWithWorker(challenge, difficulty, discriminantSizeBits));
        this.#calculationQueue = calculationPromise.catch(() => {});
        return calculationPromise;
    }

    /**
     * Sends one calculation to the worker. Returns connection failures as response errors.
     *
     * @param {Buffer} challenge Encoded epoch challenge.
     * @param {number} difficulty VDF iteration count.
     * @param {number} discriminantSizeBits Discriminant size in bits.
     * @returns {Promise<VdfWorkerResponse>} Response containing the result or an error.
     */
    async #calculateWithWorker(challenge, difficulty, discriminantSizeBits) {
        const workerPort = this.#workerPort;
        if (!workerPort) return { error: new Error('VDF service is not ready') };

        try {
            await workerPort.write({ challenge, difficulty, discriminantSizeBits });
            return await workerPort.read();
        } catch (error) {
            return { error };
        }
    }
}
