import { VDFService } from './VDFService.js';

export class VDFBare extends VDFService {
    #thread = null;

    async _open() {
        const { default: Channel } = await import('bare-channel');
        const channel = new Channel();
        this._setPort(channel.connect());
        this.#thread = new globalThis.Bare.Thread(this.#workerFileUrl(), { data: channel.handle });
    }

    #workerFileUrl() {
        // Pear's `pear://dev/` module protocol isn't registered inside a freshly
        // spawned Bare.Thread, so a pear:// reference (e.g. import.meta.url under
        // `pear run`) fails with UNKNOWN_PROTOCOL there. Pear.config.dir is the
        // real on-disk path this app runs from (trac-msb is always run via a
        // local directory link, not a seeded pear:// app), so build a plain
        // file:// URL from it instead. Outside Pear (plain `bare`), import.meta.url
        // is already a file:// URL and works as-is.
        if (typeof globalThis.Pear !== 'undefined') {
            const baseDir = globalThis.Pear.config.dir;
            return new URL('./vdf-worker.js', `file://${baseDir}/src/core/consensus/services/`).href;
        }
        return new URL('./vdf-worker.js', import.meta.url).href;
    }

    async _close() {
        await this.#thread.terminate();
        await this.#thread.join();
        await super._close();
    }
}
