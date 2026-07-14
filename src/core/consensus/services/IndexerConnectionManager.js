import { PeerConnectionManager } from '../../shared/PeerConnectionManager.js'

class IndexerConnectionManager extends PeerConnectionManager {
    #messages
    // Tracks connections that already have a consensus/v1 Protomux channel opened on them.
    // `connection.protocolSession` is shared with the validator protocol (already set by the
    // swarm's connection listener before a peer is known to be an indexer), so it can't be used
    // as the "already initialized" check here. Without this, calling add() twice for the same
    // connection (once via IS_INDEXER state event, once via the IndexerObserverService polling
    // loop) would open a second, unpaired consensus/v1 channel and silently swallow every send.
    //
    // A peer can also be demoted (disconnectIndexerPeer -> remove()) and later re-promoted on the
    // *same* underlying connection - remove() only closes our consensus/v1 channel, not the whole
    // connection. So "already initialized" alone isn't enough: if that channel was since closed,
    // we must open a fresh one instead of re-registering the dead one.

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
