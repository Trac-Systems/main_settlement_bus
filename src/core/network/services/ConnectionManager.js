import { MAX_VALIDATORS } from "../../../utils/constants.js"
import b4a from 'b4a'
import PeerWallet from "trac-wallet"
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';

// TODO: This class is flooding console with logs. Implement a verbosity flag to control this behavior
class ConnectionManager {
    #validators
    #validatorsIndex
    #maxValidators
    #messageThreshold // How many messages can be sent to a validator before removing from pool

    // Note: #validators is using publicKey (Buffer) as key
    // As Buffers are objects, we will rely on internal conversions done by JS to compare them.
    // It would be better to handle these conversions manually by using hex strings as keys to avoid issues

    constructor({ maxValidators }) {
        this.#validators = {}
        this.#validatorsIndex = []
        this.#maxValidators = maxValidators || MAX_VALIDATORS
        this.#messageThreshold = 1
    }

    /**
     * Sends a message to a single randomly selected connected validator.
     * Returns the public key (buffer) of the validator used, or throws
     * if no connected validators are available.
     */
    send(message) {
        const connectedValidators = this.#validatorsIndex.filter(_ => this.connected(_));

        if (connectedValidators.length === 0) {
            throw new Error('ConnectionManager: no connected validators available to send message');
        }

        const target = this.#pickRandomValidator(connectedValidators);
        const entry = this.#validators[target];
        if (!entry || !entry.connection || !entry.connection.messenger) return;

        try {
            entry.connection.messenger.send(message);
            entry.sent = (entry.sent || 0) + 1;
            if (entry.sent >= this.#messageThreshold) {
                const validatorAddress = PeerWallet.encodeBech32m(
                    TRAC_NETWORK_MSB_MAINNET_PREFIX, // TODO: This won't work for other networks. Make it dynamic.
                    target
                );
                console.log("Removing validator after reaching message threshold:", validatorAddress);
                this.remove(target); // TODO: In the future, only "flag for removal" and remove in a separate callback
                // TODO: Ideally, we should add a replacement immediately after removal, otherwise, we risk running out
                // of validators to send requests to.
            }
        } catch (e) {
            // Swallow individual send errors.
        }

        return target;
    }

    whiteList(publicKey) {
        this.#validators[publicKey] = { connection: null, sent: 0 };
    }

    addValidator(publicKey, connection) {
        const validatorAddress = PeerWallet.encodeBech32m(
            TRAC_NETWORK_MSB_MAINNET_PREFIX, // TODO: This won't work for other networks. Make it dynamic.
            publicKey
        );

        const inPool = !!this.#validators[publicKey];

        if (!inPool) {
            if (this.maxConnections()) {
                console.log("evicting validator", validatorAddress);
                this.#evictOneValidator();
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
            this.#validatorsIndex.splice(index, 1);
            delete this.#validators[publicKey];
        }
    }

    // Note: this function name is a bit misleading. It checks if we have reached max connections.
    maxConnections() {
        return this.connectionCount() >= this.#maxValidators
    }

    connectionCount() {
        return this.#validatorsIndex.length
    }

    connected(publicKey) {
        const entry = this.#validators[publicKey];
        return !!entry && !!entry.connection;
    }

    exists(publicKey) {
        return !!this.#validators[publicKey];
    }

    prettyPrint() {
        console.log('Connection count: ', this.connectionCount())
        console.log('Validators: ', this.#validatorsIndex.map(val => PeerWallet.encodeBech32m(TRAC_NETWORK_MSB_MAINNET_PREFIX, val)))
    }

    #append(publicKey, connection) {
        this.#validatorsIndex.push(publicKey);
        this.#validators[publicKey] = { connection, sent: 0 };

        connection.on('close', () => {
            this.remove(publicKey);
        });
    }

    #update(publicKey, connection) {
        if (this.#validators[publicKey]) {
            this.#validators[publicKey].connection = connection;
        } else {
            this.#validators[publicKey] = { connection, sent: 0 };
        }
    }

    // Node 1: This method shuffles the whole array (in practice, probably around 50 elements)
    //      just to fetch a small subset of it (most times, 1 element).
    //      There are more efficient ways to pick a small subset of validators. Consider optimizing.
    // Note 2: This method is unused now, but will be kept here for future reference
    #pickRandomSubset(validators, maxTargets) {
        const copy = validators.slice();
        const count = Math.min(maxTargets, copy.length);

        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }

        return copy.slice(0, count);
    }

    #pickRandomValidator(validators) {
        const index = Math.floor(Math.random() * validators.length);
        return validators[index];
    }

    #evictOneValidator() {
        const connected = this.#validatorsIndex.filter(pk => this.connected(pk));
        if (connected.length === 0) return;

        const idx = Math.floor(Math.random() * connected.length);
        const toRemove = connected[idx];
        this.remove(toRemove);
    }
}

export default ConnectionManager;
