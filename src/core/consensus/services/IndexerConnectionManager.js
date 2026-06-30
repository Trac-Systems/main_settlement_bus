// TODO: ITS HERE
import { toHex } from '../../../utils/buffer.js';
import { BaseConnectionManager } from '../../shared/BaseConnectionManager.js'

class IndexerConnectionManager extends BaseConnectionManager {

    constructor(maxIndexers) {
        super(maxIndexers);
    }

    setMax(maxIndexers) {
        this._max = maxIndexers;
    }

    add(publicKey, connection) {
        const key = toHex(publicKey);
        if (this._connections.has(key)) {
            return false;
        }
        if (this._connections.size >= this._max) {
            return false;
        }
        this._connections.set(key, { connection });
        return true;
    }

    remove(publicKey) {
        const key = toHex(publicKey);
        this._connections.delete(key);
    }

    connectedIndexers() {
        return Array.from(this._connections.keys());
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

    prettyPrint() {
        console.log(`Connection count: ${this._connections.size}`);
        console.log(`Indexer map keys:\n${Array.from(this._connections.keys()).join('\n')}`);
    }
}

export default IndexerConnectionManager;
