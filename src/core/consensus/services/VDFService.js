import ReadyResource from 'ready-resource';

export class VDFService extends ReadyResource {
    #port = null;

    _setPort(port) {
        this.#port = port;
    }

    async _close() {
        await this.#port?.close();
    }

    async calculateVDF(challenge, difficulty, discriminantSizeBits) {
        await this.#port.write({ challenge, difficulty, discriminantSizeBits });
        try {
            const response = await this.#port.read();
            if (response.error) return null;
            return response.result;
        } catch {
            return null;
        }
    }
}
