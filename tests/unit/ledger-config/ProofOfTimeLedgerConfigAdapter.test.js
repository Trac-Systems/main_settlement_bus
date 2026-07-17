import test from 'brittle';
import b4a from 'b4a';

import {
    INVALID_LEDGER_CONFIG_SNAPSHOT,
    InvalidLedgerConfigSnapshotError,
    PROOF_OF_TIME_CONFIG_KEYS,
    PROOF_OF_TIME_SCHEMA_ID,
    ProofOfTimeLedgerConfigAdapter,
    proofOfTimeLedgerConfigAdapter
} from '../../../src/core/ledger-config/adapters/ProofOfTimeLedgerConfigAdapter.js';

const encodeUint16BE = value => {
    const buffer = b4a.alloc(2);
    buffer.writeUInt16BE(value, 0);
    return buffer;
};

const encodeUint32BE = value => {
    const buffer = b4a.alloc(4);
    buffer.writeUInt32BE(value, 0);
    return buffer;
};

const entry = (key, value) => ({ key: b4a.from(key, 'utf8'), value });

const createSnapshot = (overrides = {}) => ({
    schemaId: PROOF_OF_TIME_SCHEMA_ID,
    entries: [
        entry(PROOF_OF_TIME_CONFIG_KEYS.VDF_DIFFICULTY, encodeUint32BE(1_000_000)),
        entry(PROOF_OF_TIME_CONFIG_KEYS.VDF_DISCRIMINANT_SIZE_BITS, encodeUint16BE(2_048))
    ],
    ...overrides
});

const expectInvalidSnapshot = (t, run, pattern) => {
    let error = null;

    try {
        run();
    } catch (caught) {
        error = caught;
    }

    t.ok(error instanceof InvalidLedgerConfigSnapshotError);
    t.is(error?.code, INVALID_LEDGER_CONFIG_SNAPSHOT);
    t.is(error?.schemaId, PROOF_OF_TIME_SCHEMA_ID);
    t.ok(pattern.test(error?.message ?? ''), `Expected error message to match ${pattern}`);
};

test('ProofOfTimeLedgerConfigAdapter exposes the canonical schema id', t => {
    const adapter = new ProofOfTimeLedgerConfigAdapter();

    t.is(adapter.schemaId, 'trac/autobase-proof-of-time/v1');
    t.is(proofOfTimeLedgerConfigAdapter.schemaId, adapter.schemaId);
    t.ok(Object.isFrozen(proofOfTimeLedgerConfigAdapter));
});

test('ProofOfTimeLedgerConfigAdapter validates and safely decodes a complete snapshot', t => {
    const adapter = new ProofOfTimeLedgerConfigAdapter();
    const snapshot = createSnapshot({ entries: createSnapshot().entries.reverse() });
    const originalEntries = snapshot.entries.map(({ key, value }) => ({
        key: b4a.from(key),
        value: b4a.from(value)
    }));

    const decoded = adapter.validate(snapshot);

    t.alike(decoded, {
        vdfDifficulty: 1_000_000,
        vdfDiscriminantSize: 2_048
    });
    t.ok(Object.isFrozen(decoded));
    t.alike(snapshot.entries, originalEntries);
    let mutationError = null;

    try {
        decoded.vdfDifficulty = 1;
    } catch (caught) {
        mutationError = caught;
    }

    t.ok(mutationError instanceof TypeError);
    t.is(decoded.vdfDifficulty, 1_000_000);
});

test('ProofOfTimeLedgerConfigAdapter accepts the complete positive uint ranges', t => {
    const adapter = new ProofOfTimeLedgerConfigAdapter();
    const decoded = adapter.validate(createSnapshot({
        entries: [
            entry(PROOF_OF_TIME_CONFIG_KEYS.VDF_DIFFICULTY, encodeUint32BE(0xFFFFFFFF)),
            entry(PROOF_OF_TIME_CONFIG_KEYS.VDF_DISCRIMINANT_SIZE_BITS, encodeUint16BE(0xFFFF))
        ]
    }));

    t.alike(decoded, {
        vdfDifficulty: 0xFFFFFFFF,
        vdfDiscriminantSize: 0xFFFF
    });
});

test('ProofOfTimeLedgerConfigAdapter rejects malformed snapshot containers', t => {
    const adapter = new ProofOfTimeLedgerConfigAdapter();

    expectInvalidSnapshot(t, () => adapter.validate(null), /snapshot must be an object/);
    expectInvalidSnapshot(t, () => adapter.validate([]), /snapshot must be an object/);
    expectInvalidSnapshot(t, () => adapter.validate({}), /entries must be an array/);
    expectInvalidSnapshot(
        t,
        () => adapter.validate(createSnapshot({ schemaId: 'trac/other-consensus/v1' })),
        /snapshot schemaId must be trac\/autobase-proof-of-time\/v1/
    );
});

test('ProofOfTimeLedgerConfigAdapter rejects missing, unknown, and duplicate keys', t => {
    const adapter = new ProofOfTimeLedgerConfigAdapter();
    const valid = createSnapshot().entries;

    expectInvalidSnapshot(
        t,
        () => adapter.validate(createSnapshot({ entries: [valid[0]] })),
        /Missing .*vdf\/discriminant-size-bits/
    );
    expectInvalidSnapshot(
        t,
        () => adapter.validate(createSnapshot({ entries: [valid[0], entry('vdf/unknown', encodeUint16BE(1))] })),
        /Unknown Proof-of-Time ledger config key/
    );
    expectInvalidSnapshot(
        t,
        () => adapter.validate(createSnapshot({ entries: [valid[0], valid[0]] })),
        /Duplicate .*vdf\/difficulty/
    );
});

test('ProofOfTimeLedgerConfigAdapter requires exact Buffer keys and values', t => {
    const adapter = new ProofOfTimeLedgerConfigAdapter();
    const [difficulty, discriminant] = createSnapshot().entries;

    expectInvalidSnapshot(
        t,
        () => adapter.validate(createSnapshot({ entries: [{ ...difficulty, key: PROOF_OF_TIME_CONFIG_KEYS.VDF_DIFFICULTY }, discriminant] })),
        /entry key must be a Buffer/
    );
    expectInvalidSnapshot(
        t,
        () => adapter.validate(createSnapshot({ entries: [{ ...difficulty, value: '00000001' }, discriminant] })),
        /value for vdf\/difficulty must be a Buffer/
    );
    expectInvalidSnapshot(
        t,
        () => adapter.validate(createSnapshot({ entries: [null, discriminant] })),
        /entry must be an object/
    );
});

test('ProofOfTimeLedgerConfigAdapter enforces exact canonical integer lengths', t => {
    const adapter = new ProofOfTimeLedgerConfigAdapter();
    const [difficulty, discriminant] = createSnapshot().entries;

    for (const invalidLength of [3, 5]) {
        expectInvalidSnapshot(
            t,
            () => adapter.validate(createSnapshot({
                entries: [{ ...difficulty, value: b4a.alloc(invalidLength, 1) }, discriminant]
            })),
            /value for vdf\/difficulty must be exactly 4 bytes/
        );
    }

    for (const invalidLength of [1, 3]) {
        expectInvalidSnapshot(
            t,
            () => adapter.validate(createSnapshot({
                entries: [difficulty, { ...discriminant, value: b4a.alloc(invalidLength, 1) }]
            })),
            /value for vdf\/discriminant-size-bits must be exactly 2 bytes/
        );
    }
});

test('ProofOfTimeLedgerConfigAdapter rejects zero values', t => {
    const adapter = new ProofOfTimeLedgerConfigAdapter();
    const [difficulty, discriminant] = createSnapshot().entries;

    expectInvalidSnapshot(
        t,
        () => adapter.validate(createSnapshot({ entries: [{ ...difficulty, value: b4a.alloc(4) }, discriminant] })),
        /value for vdf\/difficulty must be greater than zero/
    );
    expectInvalidSnapshot(
        t,
        () => adapter.validate(createSnapshot({ entries: [difficulty, { ...discriminant, value: b4a.alloc(2) }] })),
        /value for vdf\/discriminant-size-bits must be greater than zero/
    );
});
