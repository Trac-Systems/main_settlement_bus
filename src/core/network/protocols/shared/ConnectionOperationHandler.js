import {publicKeyToAddress} from "../../../../utils/helpers.js";

export default class ConnectionOperationHandler {
    #config;

    constructor(config) {
        this.#config = config;
    }

    get config() {
        return this.#config;
    }

    async sendResponseAndMaybeClose(connection, response, endConnection = true) {
        connection.protocolSession.sendAndForget(response);
        if (!endConnection) return;

        await connection.flush();
        connection.end();
    }

    displayError(step = "undefined step", senderPublicKey, error) {
        const errorMessage = error?.message ?? 'Unexpected error';
        console.error(`${this.constructor.name}: ${step} ${publicKeyToAddress(senderPublicKey, this.#config)}: ${errorMessage}`);
    }

}