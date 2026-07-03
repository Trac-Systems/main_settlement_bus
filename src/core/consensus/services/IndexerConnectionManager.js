import { PeerConnectionManager } from '../../shared/PeerConnectionManager.js'

class IndexerConnectionManager extends PeerConnectionManager {
    #messages

    constructor(maxIndexers, config, logger, messages) {
        super(maxIndexers, config, logger);
        this.#messages = messages
    }

    add(publicKey, connection) {
        connection.protocolSession = this.#messages.createProtomux(connection);
        this._add(publicKey, connection)
    }

    prettyPrint() {
        console.log(`Connection count: ${this._connections.size}`);
        console.log(`Indexer map keys:\n${Array.from(this._connections.keys()).join('\n')}`);
    }
}

export default IndexerConnectionManager;
