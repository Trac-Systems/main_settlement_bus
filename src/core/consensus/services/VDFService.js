import Channel from "bare-channel";
import ReadyResource from "ready-resource";

export class VDFService extends ReadyResource {
    #thread = null;
    #port = null;

    constructor() {
        super();
    }

    async _open() {
        const channel = new Channel();
        this.#port = channel.connect();
        this.#thread = new Bare.Thread("vdf-worker.js", { data: channel.handle }, async (handle) => {
            const { default: Channel } = await import("bare-channel");
            const { loadVdfWasm } = await import("@tracsystems/trac-vdf");
            const vdf = await loadVdfWasm();
            const channel = Channel.from(handle);
            const port = channel.connect();

            for await (const request of port) {
                const { challenge, difficulty, discriminantSizeBits } = request;
                try {
                    const solution = vdf.solveWesolowski(challenge, difficulty, discriminantSizeBits);
                    await port.write({
                        result: { challenge, difficulty, discriminantSizeBits, solution },
                    });
                } catch {}
            }
        });
    }

    async _close() {
        await this.#thread.terminate();
        await this.#thread.join();
        await this.#port.close();
    }

    async calculateVDF(challenge, difficulty, discriminantSizeBits) {
        await this.#port.write({ challenge, difficulty, discriminantSizeBits });
        return await this.#port.read();
    }
}