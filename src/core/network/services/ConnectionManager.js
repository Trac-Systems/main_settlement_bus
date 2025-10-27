import { MAX_VALIDATORS } from "../../../utils/constants.js"

class ConnectionManager {
    #validators
    #validatorsIndex
    #currentValidator
    #requestCount
    #maxValidators

    constructor({ maxValidators })  {
        this.#validators = {}
        this.#validatorsIndex = []
        this.#currentValidator = 0
        this.#requestCount = 0
        this.#maxValidators = maxValidators || MAX_VALIDATORS
    }

    send(message) {
        if (this.#requestCount >= 10) {
            this.#requestCount = 0
            this.#updateNext()
        }
        this.#requestCount++
        this.#getConnection().messenger.send(message)
    }

    whiteList(publicKey) {
        this.#validators[publicKey] = null
    }

    addValidator(publicKey, connection) {
        if (!this.#exists(publicKey) && this.#isSet(publicKey)) {
            return this.#append(publicKey, connection)
        } else if (!this.isConnected(publicKey)) {
            return this.#update(publicKey, connection)
        }

        return false
    }

    #getConnection() {
        return this.#validators[this.#validatorsIndex[this.#currentValidator]]
    }

    #append(publicKey, connection) {
        this.#validatorsIndex.push(publicKey)
        this.#validators[publicKey] = connection
        connection.on('close', () => this.#remove(publicKey))
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
        return this.#validatorsIndex.filter(_ => this.isConnected(_)).length
    }

    isConnected(publicKey) {
        return this.#exists(publicKey) && this.#validators[publicKey]?.isConnected
    }

    rotate() {
        this.#updateNext()
        this.#requestCount = 0
    }
    #updateNext() {
        this.#currentValidator = this.#currentValidator <= this.#validatorsIndex.length ? this.#currentValidator + 1 : 0
    }

    #exists(publicKey) {
        return !!this.#validators[publicKey]
    }

    #isSet(publicKey) {
        return publicKey in this.#validators
    }
}

export default ConnectionManager;