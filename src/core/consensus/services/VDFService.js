import ReadyResource from 'ready-resource';

export class VDFService extends ReadyResource {
    #port = null;
    #queue = Promise.resolve();

    _setPort(port) {
        this.#port = port;
    }

    async _close() {
        await this.#port?.close();
    }
    
    async calculateVDF(challenge, difficulty, discriminantSizeBits) {
        const response = this.#queue.then(() => this.#calculate(challenge, difficulty, discriminantSizeBits));
        if (response.result) {
            this.#queue = response.result.catch(() => {});
        }
        
        return response;
    }

    async #calculate(challenge, difficulty, discriminantSizeBits) {
        await this.#port.write({ challenge, difficulty, discriminantSizeBits });
        try {
            const response = await this.#port.read();
            return response;
        } catch (error) {
            return {error};
        }
    }
}
