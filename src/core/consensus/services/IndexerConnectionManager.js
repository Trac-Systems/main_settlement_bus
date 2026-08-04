import tracCryptoApi from 'trac-crypto-api'
import { PeerConnectionManager } from '../../shared/PeerConnectionManager.js'
import b4a from "b4a"
import { bufferToAddress } from '../../state/utils/address.js'

class IndexerConnectionManager extends PeerConnectionManager {
    #messages
    #state
    #network
    #wallet


    constructor(maxIndexers, config, logger, messages, state, network, wallet) {
        super(maxIndexers, config, logger);
        this.#messages = messages;
        this.#state = state;
        this.#network = network;
        this.#wallet = wallet;
    }

    add(publicKey, connection) {
        this.#messages.attachChannel(connection);
        this._add(publicKey, connection)
    }

    async connect() {
        const entries = await this.#state.getIndexersEntry();

        for (const entry of entries) {
            const writerKeyHex = b4a.toString(entry.key, 'hex');
            const addressBuffer = await this.#state.getRegisteredWriterKey(writerKeyHex);
            if (!addressBuffer) continue;

            const addr = bufferToAddress(addressBuffer, this._config.addressPrefix);
            if (!addr || addr === this.#wallet.address) continue;

            const publicKey = tracCryptoApi.address.decode(addr);
            const publicKeyHex = b4a.toString(publicKey, 'hex');

            const isConnected = this.connected(publicKey);
            const isPending = this.#network.isConnectionPending(publicKeyHex);
            if (isConnected || isPending) continue;

            await this.#network.tryConnect(publicKeyHex, "indexer", this);
        }
    }

    remove(publicKey, connection = null) {
        const key = this._toHexString(publicKey);
        const entry = this._connections.get(key);
        if (!entry) return;
        if (connection && entry.connection !== connection) return;

        const targetConnection = connection ?? entry.connection;
        targetConnection.protocolSessions.indexer.close();
        this._connections.delete(key);
    }

    async send(publicKey, message) {
        const connection = this.getConnection(publicKey);
        if (!connection) {
            throw new Error(`PeerConnectionManager: no session for ${this._toHexString(publicKey)}`);
        }
        if (!connection.connected) {
            this.remove(publicKey, connection);
            throw new Error(`PeerConnectionManager: stale connection for ${this._toHexString(publicKey)}`);
        }
        return connection.protocolSessions.indexer.send(message);
    }

    sendAndForget(publicKey, message) {
        const connection = this.getConnection(publicKey);
        if (!connection) return;
        connection.protocolSessions.indexer.sendAndForget(message);
    }

    prettyPrint() {
        console.log(`Connection count: ${this._connections.size}`);
        console.log(`Indexer map keys:\n${Array.from(this._connections.keys()).join('\n')}`);
    }
}

export default IndexerConnectionManager;
