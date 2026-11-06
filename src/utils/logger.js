export class Logger {
    #config

    constructor(config) {
        this.#config = config;
    }

    #format(message) {
        const timestamp = this.#config.enableLogTimestamp ? `[${new Date().toISOString()}] ` : '';
        return `${timestamp}${message}`;
    }

    info(message) {
        console.log(this.#format("i: " + message));
    }

    debug(message) {
        if (this.#config.debug) {
            console.debug(this.#format("d: " + message));
        }
    }

    error(message) {
        console.error(this.#format("e: " + message));
    }

    warn(message) {
        console.warn(this.#format("w: " + message));
    }

}
