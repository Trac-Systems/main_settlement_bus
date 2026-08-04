import test from 'brittle';
import b4a from 'b4a';

import applyOperationsGenerated from '../../../src/codecs/apply/applyOperations.generated.cjs';
import {
    decodeConsensusConfig,
    encodeConsensusConfig,
    safeDecodeConsensusConfig,
    safeEncodeConsensusConfig
} from '../../../src/codecs/apply/applyOperationCodec.js';

const { ConsensusControlOperation } = applyOperationsGenerated.apply.operations;

const APPLY_TO_OBJECT_OPTIONS = Object.freeze({
    enums: Number,
    longs: Number,
    bytes: Buffer,
    defaults: false,
    arrays: true,
    oneofs: false
});

test('Consensus config codec uses the ConsensusControlOperation wire format', t => {
    const config = {
        sv: b4a.from([0x01]),
        cd: b4a.from([0x02, 0x03, 0x04])
    };

    const encoded = encodeConsensusConfig(config);
    const decodedWirePayload = ConsensusControlOperation.toObject(
        ConsensusControlOperation.decode(encoded),
        APPLY_TO_OBJECT_OPTIONS
    );
    const decoded = decodeConsensusConfig(encoded);

    t.alike(decodedWirePayload, { cc: config });
    t.alike(decoded, config);
});

test('Consensus config codec supports empty cd', t => {
    const config = {
        sv: b4a.from([0x01]),
        cd: b4a.alloc(0)
    };

    const encoded = encodeConsensusConfig(config);
    const decoded = decodeConsensusConfig(encoded);

    t.alike(decoded, config);
});

test('Consensus config codec preserves unknown schema versions and opaque cd', t => {
    const config = {
        sv: b4a.from([0xff]),
        cd: b4a.from([0x00, 0xff, 0x7f, 0x80])
    };

    const decoded = decodeConsensusConfig(encodeConsensusConfig(config));

    t.alike(decoded, config);
});

test('encodeConsensusConfig rejects invalid payloads', t => {
    const validSchemaVersion = b4a.from([0x01]);
    const validConfigData = b4a.from([0x02]);
    const invalidPayloads = [
        null,
        undefined,
        [],
        b4a.alloc(0),
        'config',
        {},
        { sv: validSchemaVersion },
        { cd: validConfigData },
        { sv: 1, cd: validConfigData },
        { sv: b4a.alloc(0), cd: validConfigData },
        { sv: b4a.alloc(2), cd: validConfigData },
        { sv: validSchemaVersion, cd: null },
        { sv: validSchemaVersion, cd: [] },
        { sv: validSchemaVersion, cd: 'data' }
    ];

    for (const payload of invalidPayloads) {
        t.exception(() => encodeConsensusConfig(payload));
    }
});

test('decodeConsensusConfig rejects invalid encoded values', t => {
    const invalidEncodedValues = [
        null,
        undefined,
        {},
        [],
        'encoded',
        b4a.alloc(0),
        b4a.from([0x1a, 0x00])
    ];

    for (const encoded of invalidEncodedValues) {
        t.exception(() => decodeConsensusConfig(encoded));
    }
});

test('Safe consensus config codec roundtrips valid configurations', t => {
    const config = {
        sv: b4a.from([0x80]),
        cd: b4a.from([0x01, 0x02])
    };

    const encoded = safeEncodeConsensusConfig(config);
    const decoded = safeDecodeConsensusConfig(encoded);

    t.ok(b4a.isBuffer(encoded) && encoded.length > 0);
    t.alike(decoded, config);
});

test('Safe consensus config codec returns fallback values for invalid input', t => {
    const invalidConfigs = [
        null,
        {},
        { sv: b4a.alloc(0), cd: b4a.alloc(0) },
        { sv: b4a.from([0x01]), cd: null }
    ];
    const invalidEncodedValues = [
        null,
        {},
        'encoded',
        b4a.alloc(0)
    ];

    for (const config of invalidConfigs) {
        const encoded = safeEncodeConsensusConfig(config);

        t.ok(b4a.isBuffer(encoded));
        t.is(encoded.length, 0);
    }

    for (const encoded of invalidEncodedValues) {
        t.is(safeDecodeConsensusConfig(encoded), null);
    }
});
