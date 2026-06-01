import Channel from "bare-channel";
import ReadyResource from "ready-resource";

export class VDFService extends ReadyResource {
    #thread = null;
    #port = null;
    #readLoop = null;
    #nextRequestId = 0;
    #pending = new Map();
    #closing = false;

    constructor() {
        super();
    }

    async _open() {
        const channel = new Channel();

        this.#closing = false;
        this.#port = channel.connect();
        this.#thread = new Bare.Thread("vdf-worker.js", { data: channel.handle }, async (handle) => {
            const { default: Channel } = await import("bare-channel");
            const channel = Channel.from(handle);
            const port = channel.connect();

            for await (const request of port) {
                const { id, challenge, difficulty, discriminantSizeBits } = request;

                try {
                    // TODO: replace with real VDF computation.
                    const solution = new Uint8Array(516);

                    await port.write({
                        id,
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
        this.#readLoop = this.#listen();
    }

    async _close() {
        this.#closing = true;
        this.#failPending(new Error("VDF worker is shutting down"));

        const port = this.#port;
        this.#port = null;

        const thread = this.#thread;
        this.#thread = null;

        if (thread) {
            thread.terminate();
            thread.join();
        }

        if (port) {
            try {
                await port.close();
            } catch {}
        }

        if (this.#readLoop) {
            try {
                await this.#readLoop;
            } catch {}

            this.#readLoop = null;
        }
    }

    async calculateVDF(challenge, difficulty, discriminantSizeBits) {
        if (!this.#port) {
            throw new Error("VDF worker is not ready");
        }

        const id = this.#nextRequestId++;
        const response = new Promise((resolve, reject) => {
            this.#pending.set(id, { resolve, reject });
        });

        try {
            await this.#port.write({
                id,
                challenge,
                difficulty,
                discriminantSizeBits,
            });
        } catch (error) {
            this.#pending.delete(id);
            throw error;
        }

        return await response;
    }

    async #listen() {
        try {
            for await (const message of this.#port) {
                const pendingRequest = this.#pending.get(message?.id);
                if (!pendingRequest) continue;

                this.#pending.delete(message.id);

                if (message.error) {
                    const error = new Error(message.error.message);
                    error.stack = message.error.stack ?? error.stack;
                    pendingRequest.reject(error);
                    continue;
                }

                pendingRequest.resolve(message.result);
            }
        } catch (error) {
            if (!this.#closing) {
                this.#failPending(error);
            }

            return;
        }

        if (!this.#closing) {
            this.#failPending(new Error("VDF worker closed unexpectedly"));
        }
    }

    #failPending(error) {
        for (const pendingRequest of this.#pending.values()) {
            pendingRequest.reject(error);
        }

        this.#pending.clear();
    }
}
