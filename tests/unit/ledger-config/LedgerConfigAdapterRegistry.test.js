import test from 'brittle';

import {
    LedgerConfigAdapterRegistry,
    UNSUPPORTED_CONSENSUS,
    UnsupportedLedgerConfigSchemaError
} from '../../../src/core/ledger-config/adapters/LedgerConfigAdapterRegistry.js';

const createFutureConsensusAdapter = () => Object.freeze({
    schemaId: 'test/future-consensus/v1',
    validate(snapshot) {
        if (!snapshot || snapshot.enabled !== true) {
            throw new Error('Future consensus must be enabled');
        }

        return Object.freeze({ enabled: true });
    }
});

const expectError = (t, run, pattern) => {
    let error = null;

    try {
        run();
    } catch (caught) {
        error = caught;
    }

    t.ok(error instanceof Error);
    t.ok(pattern.test(error?.message ?? ''), `Expected error message to match ${pattern}`);
};

test('LedgerConfigAdapterRegistry registers and resolves a schema-neutral adapter', t => {
    const adapter = createFutureConsensusAdapter();
    const registry = new LedgerConfigAdapterRegistry();

    t.is(registry.has(adapter.schemaId), false);
    t.is(registry.get(adapter.schemaId), undefined);
    t.is(registry.register(adapter), registry);
    t.is(registry.has(adapter.schemaId), true);
    t.is(registry.get(adapter.schemaId).schemaId, adapter.schemaId);
    t.ok(Object.isFrozen(registry.get(adapter.schemaId)));
    t.alike(registry.require(adapter.schemaId).validate({ enabled: true }), { enabled: true });
});

test('LedgerConfigAdapterRegistry supports construction from an adapter iterable', t => {
    const adapter = createFutureConsensusAdapter();
    const registry = new LedgerConfigAdapterRegistry([adapter]);

    t.is(registry.require(adapter.schemaId).schemaId, adapter.schemaId);
});

test('LedgerConfigAdapterRegistry rejects duplicate schema registrations', t => {
    const adapter = createFutureConsensusAdapter();
    const registry = new LedgerConfigAdapterRegistry([adapter]);

    expectError(
        t,
        () => registry.register(createFutureConsensusAdapter()),
        /Ledger config adapter already registered: test\/future-consensus\/v1/
    );
    t.is(registry.require(adapter.schemaId).schemaId, adapter.schemaId);
});

test('LedgerConfigAdapterRegistry captures adapters and seals runtime registration', t => {
    const adapter = {
        schemaId: 'test/captured/v1',
        validate: () => ({ version: 1 }),
    };
    const registry = new LedgerConfigAdapterRegistry([adapter]).seal();
    adapter.validate = () => ({ version: 2 });

    t.is(registry.sealed, true);
    t.alike(registry.require(adapter.schemaId).validate({}), { version: 1 });
    expectError(
        t,
        () => registry.register(createFutureConsensusAdapter()),
        /adapter registry is sealed/
    );
});

test('LedgerConfigAdapterRegistry validates the adapter interface', t => {
    const registry = new LedgerConfigAdapterRegistry();

    expectError(t, () => registry.register(null), /adapter must be an object/);
    expectError(t, () => registry.register({ schemaId: '', validate() {} }), /schemaId must be a non-empty string/);
    expectError(t, () => registry.register({ schemaId: 'test/no-validator/v1' }), /validate must be a function/);
    expectError(t, () => new LedgerConfigAdapterRegistry(null), /adapters must be iterable/);
});

test('LedgerConfigAdapterRegistry fails closed for an unsupported schema', t => {
    const registry = new LedgerConfigAdapterRegistry();
    const schemaId = 'trac/future-consensus/v7';
    let error = null;

    try {
        registry.require(schemaId);
    } catch (caught) {
        error = caught;
    }

    t.ok(error instanceof UnsupportedLedgerConfigSchemaError);
    t.is(error.name, 'UnsupportedLedgerConfigSchemaError');
    t.is(error.code, UNSUPPORTED_CONSENSUS);
    t.is(error.schemaId, schemaId);
    t.ok(error.message.includes(schemaId));
});
