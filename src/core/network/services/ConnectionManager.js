import { MAX_VALIDATORS } from "../../../utils/constants.js"
import b4a from 'b4a'
import PeerWallet from "trac-wallet"
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';

class ConnectionManager {
    #validators
    #validatorsIndex
    #maxValidators

    constructor({ maxValidators })  {
        this.#validators = {}
        this.#validatorsIndex = []
        this.#maxValidators = maxValidators || MAX_VALIDATORS
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

        const target = this.#pickRandomSubset(connectedValidators, 1)[0];
        const connection = this.#validators[target];
        if (!connection || !connection.messenger) return;

        try {
            connection.messenger.send(message);
        } catch (e) {
            // Swallow individual send errors. 
        }

        return target;
    }

    whiteList(publicKey) {
        this.#validators[publicKey] = null
    }

    addValidator(publicKey, connection) {
        const validatorAddress = PeerWallet.encodeBech32m(
            TRAC_NETWORK_MSB_MAINNET_PREFIX,
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

        return false
    }

    remove(publicKey) {
        const index = this.#validatorsIndex.findIndex(current => b4a.equals(publicKey, current));
        if (index !== -1) {
            this.#validatorsIndex.splice(index, 1);
            delete this.#validators[publicKey]
        }
    }

    maxConnections() {
        return this.connectionCount() >= this.#maxValidators
    }

    connectionCount() {
        return this.#validatorsIndex.length
    }

    connected(publicKey) {
        return !!this.#validators[publicKey]
    }

    exists(publicKey) {
        return !!this.#validators[publicKey]
    }

    prettyPrint() {
        console.log('Connection count: ', this.connectionCount())
        console.log('Validators: ', this.#validatorsIndex.map(val => PeerWallet.encodeBech32m(TRAC_NETWORK_MSB_MAINNET_PREFIX, val)))
    }

    #append(publicKey, connection) {
        this.#validatorsIndex.push(publicKey)
        this.#validators[publicKey] = connection

        connection.on('close', () => {
            this.remove(publicKey)
        })
    }

    #update(publicKey, connection) {
        this.#validators[publicKey] = connection
    }

    #pickRandomSubset(validators, maxTargets) {
        const copy = validators.slice();
        const count = Math.min(maxTargets, copy.length);

        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }

        return copy.slice(0, count);
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
