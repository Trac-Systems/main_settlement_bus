class SafeLogger {
    #config;

    constructor(config) {
        this.#config = config;
    }

    info(operationType = "Common", message, writingKey = null) {
        this.#log(console.info, operationType, message, writingKey);
    }

    error(operationType = "Common", message, writingKey = null) {
        this.#log(console.error, operationType, message, writingKey);
    }

    warn(operationType = "Common", message, writingKey = null) {
        this.#log(console.warn, operationType, message, writingKey);
    }

    #log(logMethod, operationType, message, writingKey) {
        if (!this.#config.enableErrorApplyLogs) return;
        try {
            const date = new Date().toISOString();
            const wk = writingKey ? writingKey.toString('hex') : 'N/A';
            logMethod(`[${date}][${operationType}][${message}][${wk}]`);
        } catch (e) {
            console.error(`[LOG_ERROR][Failed to log error][${e}]`);
        }
    }
}

export default SafeLogger;
