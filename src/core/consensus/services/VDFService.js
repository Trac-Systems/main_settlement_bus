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
            const channel = Channel.from(handle);
            const port = channel.connect();

            for await (const request of port) {
                const { challenge, difficulty, discriminantSizeBits } = request;

                try {
                    // TODO: replace with real VDF computation.
                    const solution = new Uint8Array(516);

                    await port.write({
                        result: {
                            challenge,
                            difficulty,
                            discriminantSizeBits,
                            solution,
                        },
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
        try {
            await this.#port.write({
                challenge,
                difficulty,
                discriminantSizeBits,
            });

            const result = await this.#port.read();

            return result;
        } catch (error) {
            throw error;
        }

        return await response;
    }
}
