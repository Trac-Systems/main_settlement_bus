import ReadyResource from 'ready-resource';

export class VDFService extends ReadyResource {
    #port = null;
    #queue = Promise.resolve();

    /**
     * Installs the communication port created by a subclass during _open().
     *
     * @param {object} port
     * @protected
     */
    _setPort(port) {
        this.#port = port;
    }

    /**
     * Removes and closes the port.
     * It also waits until all calculations already added to the queue finish.
     *
     * @returns {Promise<void>}
     * @protected
     */
    async _close() {
        const port = this.#port;
        this.#port = null;

        const [closeResult] = await Promise.allSettled([
            port?.close(new Error('VDF service closed')),
            this.#queue,
        ]);

        if (closeResult.status === 'rejected') throw closeResult.reason;
    }

    /**
     * Adds a VDF calculation to the queue. Calls made after shutdown return an error and
     * are not added to the old worker queue.
     *
     * @param {Buffer} challenge
     * @param {number} difficulty
     * @param {number} discriminantSizeBits
     * @returns {Promise<{result?: object, error?: Error|string}>}
     */
    async calculateVDF(challenge, difficulty, discriminantSizeBits) {
        if (this.closing !== null || this.closed) {
            return { error: new Error('VDF service is closed') };
        }

        const response = this.#queue.then(() => this.#calculate(challenge, difficulty, discriminantSizeBits));
        this.#queue = response.catch(() => {});
        return response;
    }

    /**
     * Runs one request using the current port.
     * Port errors are returned in the format expected by EpochCoordinatorOperations.
     *
     * @param {Buffer} challenge
     * @param {number} difficulty
     * @param {number} discriminantSizeBits
     * @returns {Promise<{result?: object, error?: Error|string}>}
     */
    async #calculate(challenge, difficulty, discriminantSizeBits) {
        const port = this.#port;
        if (!port) return { error: new Error('VDF service is not ready') };

        try {
            await port.write({ challenge, difficulty, discriminantSizeBits });
            return await port.read();
        } catch (error) {
            return { error };
        }
    }
}
