import ReadyResource from "ready-resource"
import { toHex } from "../../utils/buffer.js";
import { publicKeyToAddress } from "../../utils/helpers.js";

export class PeerConnectionManagerError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
    }
}

export class PeerConnectionManager extends ReadyResource {
    #messages
    _connections = new Map();
    _max;

    constructor(max, config, logger, messages) {
        super();
        this._max = max;
        this._config = config;
        this._logger = logger
        this.#messages = messages
    }
    

    setMax(maxPeers) {
        this._max = maxPeers;
    }

    _toHexString(publicKey) {
        return toHex(publicKey);
    }

    /**
     * Adds a peer to the pool if not already present.
     * @param {String | Buffer} publicKey - The public key hex string of the peer to add
     * @param {Object} connection - The connection object associated with the peer
     * @returns {Boolean} - Returns true if the peer was added or updated, false otherwise
     */
    _add(publicKey, connection) {
        connection.protocolSession = this.#messages.createProtomux(connection);
        
        const publicKeyHex = this._toHexString(publicKey);
        if (this.maxConnectionsReached()) {
            this._logger.debug('add: max connections reached.');
            return false;
        }
        this._logger.debug(`add: adding peer ${publicKeyToAddress(publicKeyHex, this._config)}`);
        if (!this.exists(publicKeyHex)) {
            this._logger.debug(`add: appending peer ${publicKeyToAddress(publicKeyHex, this._config)}`);
            this.#append(publicKeyHex, connection);
            return true;
        } else if (!this.connected(publicKeyHex)) {
            this._logger.debug(`add: updating peer ${publicKeyToAddress(publicKeyHex, this._config)}`);
            this.#update(publicKeyHex, connection);
            return true;
        }

        this._logger.debug(`add: didn't add peer ${publicKeyToAddress(publicKeyHex, this._config)}`);
        return false; // TODO: Implement better success/failure reporting
    }

    /**
     * Checks if a peer exists in the pool.
     * @param {String | Buffer} publicKey - The public key hex string of the peer to check
     * @returns {Boolean} - Returns true if the peer exists, false otherwise
    */
    exists(publicKey) {
        const publicKeyHex = this._toHexString(publicKey);
        return this._connections.has(publicKeyHex);
    }

    /**
     * Checks if a peer is currently connected.
     * @param {String | Buffer} publicKey - The public key hex string of the peer to check
     * @returns {Boolean} - Returns true if the peer is connected, false otherwise
     */
    connected(publicKey) {
        const publicKeyHex = this._toHexString(publicKey);
        return this.exists(publicKeyHex) && this._connections.get(publicKeyHex).connection !== null;
    }
    
    /**
     * Retrieves the connection object for a given peer public key.
     * @param {String | Buffer} publicKey - The public key (Buffer or hex string) of the peer.
     * @returns {Connection|undefined} - The connection object if found, otherwise undefined.
     */
    getConnection(publicKey) {
        const publicKeyHex = this._toHexString(publicKey);
        const entry = this._connections.get(publicKeyHex);
        return entry ? entry.connection : undefined;
    }
    
    /**
     * Removes a peer from the pool.
     * @param {String | Buffer} publicKey - The public key hex string of the peer to remove
     */
    remove(publicKey) {
        const key = toHex(publicKey);
        const connection = this.getConnection(key)

        if (connection) connection.protocolSession.close();
        this._connections.delete(key);
    }
    
    /**
     * Gets the current number of connected peers.
     * @returns {Number} - The count of connected peers
     */
    connectionCount() {
        return Array.from(this._connections.keys()).filter(hex => this.connected(hex)).length
    }

    /**
     * Gets a list of all currently connected peers' public keys.
     * @returns {Array} - An array of public key hex strings of connected peers
     */
    connectedPeers() {
        return Array.from(this._connections.keys()).filter(pk => this.connected(pk));
    }
    
    /**
     * Checks if the maximum number of connections has been reached.
     * @returns {Boolean} - Returns true if the maximum number of connections has been reached, false otherwise.
     */
    // Note: this function name is a bit misleading. It checks if we have reached max connections and returns boolean
    // The name leads to think it returns the number of max connections
    maxConnectionsReached() {
        return this.connectionCount() >= this._max;
    }
    
    clear() {
        this._connections.clear()
    }

    /**
     * Appends a new peer connection.
     * @param {String|Buffer} publicKey - The public key hex string of the peer
     * @param {Object} connection - The connection object
     */
    #append(publicKey, connection) {
        this._logger.debug(`#append: appending peer ${publicKeyToAddress(publicKey, this._config)}`);
        const publicKeyHex = this._toHexString(publicKey);
        if (this._connections.has(publicKeyHex)) {
            this._logger.debug(`#append: tried to append existing peer: ${publicKeyToAddress(publicKey, this._config)}`);
            return;
        }
        this._connections.set(publicKeyHex, {connection, sent: 0});
        connection.on('close', () => {
            this._logger.debug(`#append: connection closing for peer ${publicKeyToAddress(publicKey, this._config)}`);
            this.remove(publicKeyHex);
            this._logger.debug(`#append: connection closed for peer ${publicKeyToAddress(publicKey, this._config)}`);
        });
    }

    /**
     * Updates an existing peer connection or adds it if not present.
     * @param {String|Buffer} publicKey - The public key hex string of the peer
     * @param {Object} connection - The connection object
     */
    #update(publicKey, connection) {
        // Note: Is there a good reason for the function 'update' to exist separately from 'append'?
        // It seems that both could be merged into a single function that either adds or updates the entry.
        // It would be preferable to keep them separated though, but we would need to review all usages to ensure correctness.
        // Also, we should remove the 'else' branch below if we decide to keep 'update' and 'append' separated.
        const publicKeyHex = this._toHexString(publicKey);
        this._logger.debug(`#update: updating peer ${publicKeyToAddress(publicKey, this._config)}`);
        if (this._connections.has(publicKeyHex)) {
            this._connections.get(publicKeyHex).connection = connection;
        } else {
            this._connections.set(publicKeyHex, {connection, sent: 0});
        }
    }

    /**
     * Sends a message through a specific peer without increasing sent messages count.
     * @param {Object} message - The message to send to the peer.
     * @param {String | Buffer} publicKey - A peer public key hex string to be fetched from the pool.
     * @returns {Promise<*>} A promise returned by `peer.connection.protocolSession.send(message)`.
     * @throws {PeerConnectionManagerError} If the peer is not connected.
     * @throws {PeerConnectionManagerError} If the peer has no valid connection or protocol session.
     */
    async sendSingleMessage(message, publicKey) {
        let publicKeyHex = this._toHexString(publicKey);
        if (!this.connected(publicKeyHex)) {
            throw new PeerConnectionManagerError(
                `Cannot send message: peer ${publicKeyToAddress(publicKey, this._config)} is not connected.`
            );
        }
        const peer = this._connections.get(publicKeyHex);
        if (!peer) {
            throw new PeerConnectionManagerError(
                `Cannot send message: no valid connection found for peer ${publicKeyToAddress(peer, this._config)}.`
            );
        }
        return peer.connection.protocolSession.send(message)
    }

    sendAndForget(publicKey, message) {
        const connection = this.getConnection(publicKey);
        if (!connection?.protocolSession) return;
        connection.protocolSession.sendAndForget(message);
    }

    async send(publicKey, message) {
        const connection = this.getConnection(publicKey);
        if (!connection?.protocolSession) {
            throw new Error(`PeerConnectionManager: no session for ${toHex(publicKey)}`);
        }
        return connection.protocolSession.send(message);
    }

    /**
     * Gets the number of messages sent through a peer.
     * @param {String | Buffer} publicKey - The public key hex string of the peer
     * @returns {Number} - The count of messages sent
     */
    getSentCount(publicKey) {
        const publicKeyHex = this._toHexString(publicKey);
        const entry = this._connections.get(publicKeyHex);
        return entry ? (entry.sent || 0) : 0;
    }

    /**
     * Increments the count of messages sent through a peer.
     * @param {String | Buffer} publicKey - The public key hex string of the peer
     */
    incrementSentCount(publicKey) {
        const publicKeyHex = this._toHexString(publicKey);
        const entry = this._connections.get(publicKeyHex);
        if (entry) {
            entry.sent = (entry.sent || 0) + 1;
        }
    }
}

export function isPeerConnectionError(err) {
    return (err instanceof PeerConnectionManagerError)
}
