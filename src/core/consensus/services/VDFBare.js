import { VDFService } from './VDFService.js';

export class VDFBare extends VDFService {
    #thread = null;

    async _open() {
        const { default: Channel } = await import('bare-channel');
        const channel = new Channel();
        this._setPort(channel.connect());
        this.#thread = new globalThis.Bare.Thread(new URL('./vdf-worker.js', import.meta.url), { data: channel.handle });
    }

    async _close() {
        await this.#thread.terminate();
        await this.#thread.join();
        await super._close();
    }
}
