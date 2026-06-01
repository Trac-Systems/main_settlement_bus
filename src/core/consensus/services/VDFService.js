import Channel from "bare-channel";
import ReadyResource from "ready-resource";
import { sleep } from "../../../utils/helpers.js";

export class VDFService extends ReadyResource {
    #thread;
    #port;

    constructor() {
        super();
    }

    async _open() {
        const Thread = Bare.Thread
        const channel = new Channel()
        this.#port = channel.connect() // listen port

        this.#thread = new Thread(__filename, { data: channel.handle }, async (handle) => {
            const channel = Channel.from(handle)
            const port = channel.connect() // write port

            while(true) {
                port.write("message")
                await sleep(1000)
            }
        })
    }
    
    async _close() {

    }

    async calculateVDF(challenge, difficulty, discriminantSizeBits) {
        return new Promise((resolve, reject) => {
            this.#port.on("message", (result) => console.log(result));
            this.#port.on("error", (err) => reject(err));
            return this.#thread.write({ discriminantSizeBits, challenge, difficulty });
        });
    }
}
