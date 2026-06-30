import { toHex } from "../../utils/buffer.js";

export class BaseConnectionManager {
    _connections = new Map();
    _max;

    constructor(max) {
        this._max = max;
    }

    _toHexString(publicKey) {
        return toHex(publicKey);
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
        const publicKeyHex = this._toHexString(publicKey);
        this._connections.delete(publicKeyHex);
    }
    
    /**
     * Gets the current number of connected peers.
     * @returns {Number} - The count of connected peers
     */
    connectionCount() {
        return Array.from(this._connections.keys()).filter(hex => this.connected(hex)).length
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
}