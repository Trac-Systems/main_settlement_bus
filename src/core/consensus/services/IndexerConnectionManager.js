// TODO: ITS HERE
import { toHex } from '../../../utils/buffer.js';

class IndexerConnectionManager {
    #indexers = new Map();
    #maxIndexers;

    constructor(maxIndexers) {
        this.#maxIndexers = maxIndexers;
    }

    setMax(maxIndexers) {
        this.#maxIndexers = maxIndexers;
    }

    add(publicKey, connection) {
        const key = toHex(publicKey);
        if (this.#indexers.has(key)) {
            return false;
        }
        if (this.#indexers.size >= this.#maxIndexers) {
            return false;
        }
        this.#indexers.set(key, connection);
        return true;
    }

    remove(publicKey) {
        const key = toHex(publicKey);
        this.#indexers.delete(key);
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
            throw new Error(`IndexerConnectionManager: no consensus session for ${toHex(publicKey)}`);
        }
        return connection.consensusProtocolSession.send(message);
    }

    sendAndForget(publicKey, message) {
        const connection = this.getConnection(publicKey);
        if (!connection?.consensusProtocolSession) return;
        connection.consensusProtocolSession.sendAndForget(message);
    }

    /**
     * Checks if a indexer exists in the pool.
     * @param {String | Buffer} publicKey - The public key hex string of the indexer to check
     * @returns {Boolean} - Returns true if the indexer exists, false otherwise
     */
    exists(publicKey) {
        const publicKeyHex = this.#toHexString(publicKey);
        return this.#indexers.has(publicKeyHex);
    }

    #toHexString(publicKey) {
        return toHex(publicKey)
    }

    prettyPrint() {
        console.log(`Connection count: ${this.#indexers.size}`);
        console.log(`Indexer map keys:\n${Array.from(this.#indexers.keys()).join('\n')}`);
    }

    clear() {
        this.#indexers.clear();
    }
}

export default IndexerConnectionManager;
