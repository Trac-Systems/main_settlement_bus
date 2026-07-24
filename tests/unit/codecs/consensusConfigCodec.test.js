import test from 'brittle';
import b4a from 'b4a';

import applyOperationsGenerated from '../../../src/codecs/apply/applyOperations.generated.cjs';
import {
    decodeConsensusConfig,
    encodeConsensusConfig,
    safeDecodeConsensusConfig,
    safeEncodeConsensusConfig
} from '../../../src/codecs/apply/applyOperationCodec.js';

const { SetConsensusConfigOperation } = applyOperationsGenerated.apply.operations;

const APPLY_TO_OBJECT_OPTIONS = Object.freeze({
    enums: Number,
    longs: Number,
    bytes: Buffer,
    defaults: false,
    arrays: true,
    oneofs: false
});

test('Consensus config codec uses the SetConsensusConfigOperation wire format', t => {
    const config = {
        version: b4a.from([0x01]),
        configData: b4a.from([0x02, 0x03, 0x04])
    };

    const encoded = encodeConsensusConfig(config);
    const decodedWirePayload = SetConsensusConfigOperation.toObject(
        SetConsensusConfigOperation.decode(encoded),
        APPLY_TO_OBJECT_OPTIONS
    );
    const decoded = decodeConsensusConfig(encoded);

    t.alike(decodedWirePayload, { cc: config });
    t.alike(decoded, config);
});

test('Consensus config codec supports empty configData', t => {
    const config = {
        version: b4a.from([0x01]),
        configData: b4a.alloc(0)
    };

    const encoded = encodeConsensusConfig(config);
    const decoded = decodeConsensusConfig(encoded);

    t.alike(decoded, config);
});

test('Consensus config codec preserves unknown versions and opaque configData', t => {
    const config = {
        version: b4a.from([0xff]),
        configData: b4a.from([0x00, 0xff, 0x7f, 0x80])
    };

    const decoded = decodeConsensusConfig(encodeConsensusConfig(config));

    t.alike(decoded, config);
});

test('encodeConsensusConfig rejects invalid payloads', t => {
    const validVersion = b4a.from([0x01]);
    const validConfigData = b4a.from([0x02]);
    const invalidPayloads = [
        null,
        undefined,
        [],
        b4a.alloc(0),
        'config',
        {},
        { version: validVersion },
        { configData: validConfigData },
        { version: 1, configData: validConfigData },
        { version: b4a.alloc(0), configData: validConfigData },
        { version: b4a.alloc(2), configData: validConfigData },
        { version: validVersion, configData: null },
        { version: validVersion, configData: [] },
        { version: validVersion, configData: 'data' }
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
        version: b4a.from([0x80]),
        configData: b4a.from([0x01, 0x02])
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
        { version: b4a.alloc(0), configData: b4a.alloc(0) },
        { version: b4a.from([0x01]), configData: null }
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
