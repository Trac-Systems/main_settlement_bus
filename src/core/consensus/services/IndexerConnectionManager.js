import { PeerConnectionManager } from '../../shared/PeerConnectionManager.js'

class IndexerConnectionManager extends PeerConnectionManager {
    constructor(maxIndexers, config, logger, messages) {
        super(maxIndexers, config, logger, messages);
    }

    add(publicKey, connection) {
        this._add(publicKey, connection)
    }

    prettyPrint() {
        console.log(`Connection count: ${this._connections.size}`);
        console.log(`Indexer map keys:\n${Array.from(this._connections.keys()).join('\n')}`);
    }
}

export default IndexerConnectionManager;
