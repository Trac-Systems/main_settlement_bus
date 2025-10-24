class ConnectionManager {
    #validators
    #validatorsIndex
    #currentValidator

    constructor()  {
        this.#validators = {}
        this.#validatorsIndex = []
        this.currentValidator = 0
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

    getConnection() {
        this.#validatorsIndex[this.#currentValidator]
        this.#updateNext()
    }

    #append(publicKey, connection) {
        this.#validatorsIndex.push(publicKey)
        this.#validators[publicKey] = connection
    }

    #update(publicKey, connection) {
        this.#validators[publicKey] = connection
    }

    connectionCount() {
        return this.#validatorsIndex.filter(_ => this.isConnected(_)).length
    }

    isConnected(publicKey) {
        return this.#exists(publicKey) && this.#validators[publicKey]?.isConnected
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