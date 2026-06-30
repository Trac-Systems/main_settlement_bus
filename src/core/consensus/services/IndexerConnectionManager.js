import { PeerConnectionManager } from '../../shared/PeerConnectionManager.js'

class IndexerConnectionManager extends PeerConnectionManager {
    #messages

    constructor(maxIndexers, config, logger, messages) {
        super(maxIndexers, config, logger);
        this.#messages = messages
    }

    add(publicKey, connection) {
        this.#messages.attachChannel(connection);
        this._add(publicKey, connection)
    }

    remove(publicKey, connection = null) {
        const key = this._toHexString(publicKey);
        const entry = this._connections.get(key);
        if (!entry) return;
        if (connection && entry.connection !== connection) return;

        const targetConnection = connection ?? entry.connection;
        targetConnection.protocolSessions.indexers.close();
        this._connections.delete(key);
    }

    async send(publicKey, message) {
        const connection = this.getConnection(publicKey);
        if (!connection) {
            throw new Error(`PeerConnectionManager: no session for ${this._toHexString(publicKey)}`);
        }
        return connection.protocolSessions.indexers.send(message);
    }

    sendAndForget(publicKey, message) {
        const connection = this.getConnection(publicKey);
        if (!connection) return;
        connection.protocolSessions.indexers.sendAndForget(message);
    }

    prettyPrint() {
        console.log(`Connection count: ${this._connections.size}`);
        console.log(`Indexer map keys:\n${Array.from(this._connections.keys()).join('\n')}`);
    }
}

export default IndexerConnectionManager;
