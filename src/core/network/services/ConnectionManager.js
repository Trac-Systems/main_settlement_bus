import { MAX_VALIDATORS } from "../../../utils/constants.js"
import b4a from 'b4a'
import PeerWallet from "trac-wallet"
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';

// TODO: This class is flooding console with logs. Implement a verbosity flag to control this behavior
// or remove them after debugging is done.
class ConnectionManager {
    #validators
    #validatorsIndex
    #maxValidators

    // Note: #validators is using publicKey (Buffer) as key
    // As Buffers are objects, we will rely on internal conversions done by JS to compare them.
    // It would be better to handle these conversions manually by using hex strings as keys to avoid issues

    constructor({ maxValidators }) {
        this.#validators = new Map();
        this.#validatorsIndex = []
        this.#maxValidators = maxValidators || MAX_VALIDATORS
    }

    /**
     * Sends a message to a single randomly selected connected validator.
     * Returns the public key (buffer) of the validator used, or throws
     * if the specified validator is unavailable.
     */
    send(message) {
        const connectedValidators = this.#validatorsIndex.filter(_ => this.connected(_));

        if (connectedValidators.length === 0) {
            throw new Error('ConnectionManager: no connected validators available to send message');
        }

        const target = this.pickRandomValidator(connectedValidators);
        const entry = this.#validators.get(target);
        if (!entry || !entry.connection || !entry.connection.messenger) return null;

        try {
            entry.connection.messenger.send(message);
            entry.sent = (entry.sent || 0) + 1;
        } catch (e) {
            // Swallow individual send errors.
        }

        return target;
    }

    /**
     * Sends a message through a specific validator without increasing sent messages count.
     * @param {Object} message - The message to send to the validator
     * @param {Object} validatorPubKey - A validator public key to be fetched from the pool.
     * @returns 
     */
    sendSingleMessage(message, validatorPubKey) {
        if (!this.exists(validatorPubKey) || !this.connected(validatorPubKey)) return false; // Fail silently
        const validator = this.#validators.get(validatorPubKey);
        if (!validator || !validator.connection || !validator.connection.messenger) return false;
        try {
            validator.connection.messenger.send(message);
        } catch (e) {
            // Swallow individual send errors.
        }
        return true; // TODO: Implement better success/failure reporting
    }

    whiteList(publicKey) {
        this.#validators.set(publicKey, { connection: null, sent: 0 });
    }

    addValidator(publicKey, connection) {
        const validatorAddress = this.#toAddress(publicKey);

        const inPool = this.#validators.has(publicKey);

        if (!inPool) {
            if (this.maxConnections()) {
                console.log("evicting validator", validatorAddress);
                this.#evictRandomValidator();
            }

            console.log("Adding ", validatorAddress);
            return this.#append(publicKey, connection)
        } else {
            return this.#update(publicKey, connection)
        }
    }

    remove(publicKey) {
        const index = this.#validatorsIndex.findIndex(current => b4a.equals(publicKey, current));
        if (index !== -1) {
            // Close the connection socket if it exists
            const entry = this.#validators.get(publicKey);
            if (entry && entry.connection && typeof entry.connection.end === 'function') {
                try {
                    entry.connection.end();
                } catch (e) {
                    // Ignore errors on connection end
                    // TODO: Consider logging these errors here in verbose mode
                }
            }
            this.#validatorsIndex.splice(index, 1);
            this.#validators.delete(publicKey);
        }
    }

    // Note: this function name is a bit misleading. It checks if we have reached max connections and returns boolean
    // The name leads to think it returns the number of max connections
    maxConnections() {
        return this.connectionCount() >= this.#maxValidators
    }

    connectionCount() {
        return this.#validatorsIndex.length
    }

    connected(publicKey) {
        const entry = this.#validators.get(publicKey);
        return !!entry && !!entry.connection;
    }

    exists(publicKey) {
        return this.#validators.has(publicKey);
    }

    getSentCount(publicKey) {
        const entry = this.#validators.get(publicKey);
        return entry ? (entry.sent || 0) : 0;
    }

    incrementSentCount(publicKey) {
        const entry = this.#validators.get(publicKey);
        if (entry) {
            entry.sent = (entry.sent || 0) + 1;
        }
    }

    prettyPrint() {
        console.log('Connection count: ', this.connectionCount())
        console.log('Validators: ', this.#validatorsIndex.map(val => this.#toAddress(val)).join(', '))
    }

    // Node 1: This method shuffles the whole array (in practice, probably around 50 elements)
    //      just to fetch a small subset of it (most times, 1 element).
    //      There are more efficient ways to pick a small subset of validators. Consider optimizing.
    // Note 2: This method is unused now, but will be kept here for future reference
    pickRandomSubset(validators, maxTargets) {
        const copy = validators.slice();
        const count = Math.min(maxTargets, copy.length);

        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }

        return copy.slice(0, count);
    }

    /**
     * Picks a random validator from the given array of validator public keys.
     * @param {Buffer} validatorPubKeys 
     * @returns 
     */
    pickRandomValidator(validatorPubKeys) {
        const index = Math.floor(Math.random() * validatorPubKeys.length);
        return validatorPubKeys[index];
    }

    pickRandomConnectedValidator() {
        const connected = this.#getConnectedValidators();
        if (connected.length === 0) return null;
        return this.pickRandomValidator(connected);
    }

    #append(publicKey, connection) {
        if (this.#validators.has(publicKey)) {
            // This should never happen, but just in case, we log it
            console.log(`ConnectionManager: tried to append existing validator: ${this.#toAddress(publicKey)}`);
            return;
        }
        this.#validatorsIndex.push(publicKey);
        this.#validators.set(publicKey, { connection, sent: 0 });

        connection.on('close', () => {
            this.remove(publicKey);
        });
    }

    #update(publicKey, connection) {
        // Note: Is there a good reason for the function 'update' to exist separately from 'append'?
        // It seems that both could be merged into a single function that either adds or updates the entry.
        // It would be preferable to keep them separated though, but we would need to review all usages to ensure correctness.
        // Also, we should remove the 'else' branch below if we decide to keep 'update' and 'append' separated.
        if (this.#validators.has(publicKey)) {
            this.#validators.get(publicKey).connection = connection;
        } else {
            this.#validators.set(publicKey, { connection, sent: 0 });
        }
    }

    #evictRandomValidator() {
        const connected = this.#getConnectedValidators();
        if (connected.length === 0) return;

        const idx = Math.floor(Math.random() * connected.length);
        const toRemove = connected[idx];
        this.remove(toRemove);
    }

    /**
     * @returns {Array} - Array of connected validator public keys
     */
    #getConnectedValidators() {
        return this.#validatorsIndex.filter(pk => this.connected(pk));
    }

    #toAddress(publicKey) {
        return PeerWallet.encodeBech32m(
            TRAC_NETWORK_MSB_MAINNET_PREFIX, // TODO: This won't work for other networks. Make it dynamic after configuration is available.
            publicKey
        );
    }
}

export default ConnectionManager;
