import { MAX_VALIDATORS } from "../../../utils/constants.js"

class ConnectionManager {
    #validators
    #validatorsIndex
    #currentValidatorIndex
    #requestCount
    #maxValidators

    constructor({ maxValidators })  {
        this.#validators = {}
        this.#validatorsIndex = []
        this.#currentValidatorIndex = 0
        this.#requestCount = 0
        this.#maxValidators = maxValidators || MAX_VALIDATORS
    }

    send(message, retries = 3) {
        if (this.#requestCount >= 10) {
            this.#requestCount = 0
            this.#updateNext()
        }
        this.#requestCount++

        try {
            this.#getConnection().messenger.send(message)
        } catch (e) { // Some retrying mechanism before reacting to close
            if (retries > 0) {
                this.rotate()
                this.send(message, retries - 1)
            }
        }
    }

    whiteList(publicKey) {
        this.#validators[publicKey] = null
    }

    addValidator(publicKey, connection) {
        if (!this.#exists(publicKey) && !this.maxConnections()) {
            return this.#append(publicKey, connection)
        } else if (!this.connected(publicKey)) {
            return this.#update(publicKey, connection)
        }

        return false
    }

    #currentValidator() {
        return this.#validatorsIndex[this.#currentValidatorIndex]
    }

    #getConnection() {
        return this.#validators[this.#currentValidator()]
    }

    #append(publicKey, connection) {
        this.#validatorsIndex.push(publicKey)
        this.#validators[publicKey] = connection

        connection.on('close', () => {
            if (!this.connected(publicKey))
                this.#remove(publicKey)
        })
    }

    #remove(publicKey) {
        const index = this.#validatorsIndex.indexOf(publicKey);
        if (index !== -1) {
            this.#validatorsIndex.splice(index, 1);
            delete this.#validators[publicKey]
        }
    }

    #update(publicKey, connection) {
        this.#validators[publicKey] = connection
    }

    maxConnections() {
        return this.connectionCount() >= this.#maxValidators
    }

    connectionCount() {
        return this.#validatorsIndex.filter(_ => this.connected(_)).length
    }

    connected(publicKey) {
        return this.#exists(publicKey) && this.#validators[publicKey]?.connected
    }

    rotate() {
        this.#updateNext()
        this.#requestCount = 0
    }
    #updateNext() {
        const next = this.#currentValidatorIndex + 1
        this.#currentValidatorIndex = next < this.#validatorsIndex.length ? next : 0
    }

    #exists(publicKey) {
        return !!this.#validators[publicKey]
    }

    prettyPrint() {
        console.log('Connection count: ', this.connectionCount())
        console.log('Current connection: ', this.#currentValidator())
        console.log('Validators: ', this.#validatorsIndex)
    }
}

export default ConnectionManager;