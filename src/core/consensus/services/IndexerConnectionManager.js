import { toHex } from '../../../utils/buffer.js';

class IndexerConnectionManager {
    #indexers = new Map();

    add(publicKey, connection) {
        const key = toHex(publicKey);
        if (this.#indexers.has(key)) return false;
        this.#indexers.set(key, connection);
        return true;
    }

    remove(publicKey) {
        this.#indexers.delete(toHex(publicKey));
    }

    getConnection(publicKey) {
        return this.#indexers.get(toHex(publicKey));
    }

    connected(publicKey) {
        return this.#indexers.has(toHex(publicKey));
    }

    connectedIndexers() {
        return Array.from(this.#indexers.keys());
    }

    async send(publicKey, message) {
        const connection = this.getConnection(publicKey);
        if (!connection?.consensusProtocolSession) {
            throw new Error(`IndexerConnectionManager: no indexer session for ${toHex(publicKey)}`);
        }
        return connection.consensusProtocolSession.send(message);
    }

    sendAndForget(publicKey, message) {
        const connection = this.getConnection(publicKey);
        if (!connection?.consensusProtocolSession) return;
        connection.consensusProtocolSession.sendAndForget(message);
    }
}

export default IndexerConnectionManager;
