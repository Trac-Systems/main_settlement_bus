import ReadyResource from 'ready-resource';

export class VDFBareService extends ReadyResource {
    #thread = null;
    #port = null;

    async _open() {
        const { default: Channel } = await import('bare-channel');
        const channel = new Channel();
        this.#port = channel.connect();
        this.#thread = new globalThis.Bare.Thread('./vdf-worker.js', { data: channel.handle });
    }

    async _close() {
        await this.#thread.terminate();
        await this.#thread.join();
        await this.#port.close();
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
