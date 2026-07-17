export const UNSUPPORTED_CONSENSUS = 'UNSUPPORTED_CONSENSUS';
export const UNSUPPORTED_LEDGER_CONFIG_SCHEMA = UNSUPPORTED_CONSENSUS;

export class UnsupportedLedgerConfigSchemaError extends Error {
    constructor(schemaId) {
        super(`Unsupported ledger config schema: ${String(schemaId)}`);
        this.name = this.constructor.name;
        this.code = UNSUPPORTED_CONSENSUS;
        this.schemaId = schemaId;
    }
}

const assertAdapter = adapter => {
    if (!adapter || typeof adapter !== 'object') {
        throw new TypeError('Ledger config adapter must be an object');
    }

    if (typeof adapter.schemaId !== 'string' || adapter.schemaId.length === 0) {
        throw new TypeError('Ledger config adapter schemaId must be a non-empty string');
    }

    if (typeof adapter.validate !== 'function') {
        throw new TypeError('Ledger config adapter validate must be a function');
    }
};

const captureAdapter = adapter => Object.freeze({
    schemaId: adapter.schemaId,
    validate: adapter.validate.bind(adapter),
});

export class LedgerConfigAdapterRegistry {
    #adapters = new Map();
    #sealed = false;

    constructor(adapters = []) {
        if (!adapters || typeof adapters[Symbol.iterator] !== 'function') {
            throw new TypeError('Ledger config adapters must be iterable');
        }

        for (const adapter of adapters) {
            this.register(adapter);
        }
    }

    register(adapter) {
        if (this.#sealed) {
            throw new Error('Ledger config adapter registry is sealed');
        }
        assertAdapter(adapter);

        if (this.#adapters.has(adapter.schemaId)) {
            throw new Error(`Ledger config adapter already registered: ${adapter.schemaId}`);
        }

        this.#adapters.set(adapter.schemaId, captureAdapter(adapter));
        return this;
    }

    seal() {
        this.#sealed = true;
        return this;
    }

    get sealed() {
        return this.#sealed;
    }

    has(schemaId) {
        return this.#adapters.has(schemaId);
    }

    get(schemaId) {
        return this.#adapters.get(schemaId);
    }

    require(schemaId) {
        const adapter = this.get(schemaId);

        if (!adapter) {
            throw new UnsupportedLedgerConfigSchemaError(schemaId);
        }

        return adapter;
    }
}

export default LedgerConfigAdapterRegistry;
