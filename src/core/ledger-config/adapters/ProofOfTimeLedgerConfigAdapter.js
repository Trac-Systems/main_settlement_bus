import b4a from 'b4a';

export const PROOF_OF_TIME_SCHEMA_ID = 'trac/autobase-proof-of-time/v1';

export const PROOF_OF_TIME_CONFIG_KEYS = Object.freeze({
    VDF_DIFFICULTY: 'vdf/difficulty',
    VDF_DISCRIMINANT_SIZE_BITS: 'vdf/discriminant-size-bits'
});

export const INVALID_LEDGER_CONFIG_SNAPSHOT = 'INVALID_LEDGER_CONFIG_SNAPSHOT';

const VDF_DIFFICULTY_KEY = b4a.from(PROOF_OF_TIME_CONFIG_KEYS.VDF_DIFFICULTY, 'utf8');
const VDF_DISCRIMINANT_SIZE_BITS_KEY = b4a.from(
    PROOF_OF_TIME_CONFIG_KEYS.VDF_DISCRIMINANT_SIZE_BITS,
    'utf8'
);

export class InvalidLedgerConfigSnapshotError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
        this.code = INVALID_LEDGER_CONFIG_SNAPSHOT;
        this.schemaId = PROOF_OF_TIME_SCHEMA_ID;
    }
}

const invalidSnapshot = message => {
    throw new InvalidLedgerConfigSnapshotError(message);
};

const findKeyName = key => {
    if (b4a.equals(key, VDF_DIFFICULTY_KEY)) {
        return PROOF_OF_TIME_CONFIG_KEYS.VDF_DIFFICULTY;
    }

    if (b4a.equals(key, VDF_DISCRIMINANT_SIZE_BITS_KEY)) {
        return PROOF_OF_TIME_CONFIG_KEYS.VDF_DISCRIMINANT_SIZE_BITS;
    }

    return null;
};

const decodePositiveInteger = (value, byteLength, key, read) => {
    if (!b4a.isBuffer(value)) {
        invalidSnapshot(`Ledger config value for ${key} must be a Buffer`);
    }

    if (value.length !== byteLength) {
        invalidSnapshot(`Ledger config value for ${key} must be exactly ${byteLength} bytes`);
    }

    const decoded = read(value);

    if (decoded === 0) {
        invalidSnapshot(`Ledger config value for ${key} must be greater than zero`);
    }

    return decoded;
};

const decodeDifficulty = value => decodePositiveInteger(
    value,
    4,
    PROOF_OF_TIME_CONFIG_KEYS.VDF_DIFFICULTY,
    buffer => buffer.readUInt32BE(0)
);

const decodeDiscriminantSizeBits = value => decodePositiveInteger(
    value,
    2,
    PROOF_OF_TIME_CONFIG_KEYS.VDF_DISCRIMINANT_SIZE_BITS,
    buffer => buffer.readUInt16BE(0)
);

export class ProofOfTimeLedgerConfigAdapter {
    get schemaId() {
        return PROOF_OF_TIME_SCHEMA_ID;
    }

    validate(snapshot) {
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
            invalidSnapshot('Proof-of-Time ledger config snapshot must be an object');
        }

        if (snapshot.schemaId !== undefined && snapshot.schemaId !== this.schemaId) {
            invalidSnapshot(`Ledger config snapshot schemaId must be ${this.schemaId}`);
        }

        if (!Array.isArray(snapshot.entries)) {
            invalidSnapshot('Proof-of-Time ledger config snapshot entries must be an array');
        }

        const values = new Map();

        for (const entry of snapshot.entries) {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                invalidSnapshot('Ledger config entry must be an object');
            }

            if (!b4a.isBuffer(entry.key)) {
                invalidSnapshot('Ledger config entry key must be a Buffer');
            }

            const key = findKeyName(entry.key);

            if (key === null) {
                invalidSnapshot(`Unknown Proof-of-Time ledger config key: ${b4a.toString(entry.key, 'hex')}`);
            }

            if (values.has(key)) {
                invalidSnapshot(`Duplicate Proof-of-Time ledger config key: ${key}`);
            }

            values.set(key, entry.value);
        }

        for (const requiredKey of Object.values(PROOF_OF_TIME_CONFIG_KEYS)) {
            if (!values.has(requiredKey)) {
                invalidSnapshot(`Missing Proof-of-Time ledger config key: ${requiredKey}`);
            }
        }

        if (values.size !== Object.keys(PROOF_OF_TIME_CONFIG_KEYS).length) {
            invalidSnapshot('Proof-of-Time ledger config snapshot contains an invalid number of entries');
        }

        const vdfDifficulty = decodeDifficulty(values.get(PROOF_OF_TIME_CONFIG_KEYS.VDF_DIFFICULTY));
        const vdfDiscriminantSize = decodeDiscriminantSizeBits(
            values.get(PROOF_OF_TIME_CONFIG_KEYS.VDF_DISCRIMINANT_SIZE_BITS)
        );

        return Object.freeze({ vdfDifficulty, vdfDiscriminantSize });
    }
}

export const ProofOfTimeConfigAdapter = ProofOfTimeLedgerConfigAdapter;
export const proofOfTimeLedgerConfigAdapter = Object.freeze(new ProofOfTimeLedgerConfigAdapter());

export default ProofOfTimeLedgerConfigAdapter;
