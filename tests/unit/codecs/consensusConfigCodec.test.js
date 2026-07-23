import test from 'brittle';
import b4a from 'b4a';

import {
    decodeConsensusConfig,
    encodeConsensusConfig,
    safeDecodeConsensusConfig,
    safeEncodeConsensusConfig
} from '../../../src/codecs/consensus/consensusConfigCodec.js';

test('Consensus config codec encodes and decodes canonical field order', t => {
    const config = {
        version: b4a.from([0x01]),
        data: b4a.from([0x02, 0x03, 0x04])
    };

    const encoded = encodeConsensusConfig(config);
    const decoded = decodeConsensusConfig(encoded);

    t.alike(encoded, b4a.from([0x01, 0x02, 0x03, 0x04]));
    t.alike(decoded, config);
});

test('Consensus config codec supports empty data', t => {
    const config = {
        version: b4a.from([0x01]),
        data: b4a.alloc(0)
    };

    const encoded = encodeConsensusConfig(config);
    const decoded = decodeConsensusConfig(encoded);

    t.alike(encoded, b4a.from([0x01]));
    t.alike(decoded, config);
});

test('Consensus config codec preserves unknown versions and opaque data', t => {
    const config = {
        version: b4a.from([0xff]),
        data: b4a.from([0x00, 0xff, 0x7f, 0x80])
    };

    const decoded = decodeConsensusConfig(encodeConsensusConfig(config));

    t.alike(decoded, config);
});

test('encodeConsensusConfig rejects invalid payloads', t => {
    const validVersion = b4a.from([0x01]);
    const validData = b4a.from([0x02]);
    const invalidPayloads = [
        null,
        undefined,
        [],
        b4a.alloc(0),
        'config',
        {},
        { version: validVersion },
        { data: validData },
        { version: 1, data: validData },
        { version: b4a.alloc(0), data: validData },
        { version: b4a.alloc(2), data: validData },
        { version: validVersion, data: null },
        { version: validVersion, data: [] },
        { version: validVersion, data: 'data' }
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
        b4a.alloc(0)
    ];

    for (const encoded of invalidEncodedValues) {
        t.exception(() => decodeConsensusConfig(encoded));
    }
});

test('Safe consensus config codec roundtrips valid configurations', t => {
    const config = {
        version: b4a.from([0x80]),
        data: b4a.from([0x01, 0x02])
    };

    const encoded = safeEncodeConsensusConfig(config);
    const decoded = safeDecodeConsensusConfig(encoded);

    t.alike(encoded, b4a.from([0x80, 0x01, 0x02]));
    t.alike(decoded, config);
});

test('Safe consensus config codec returns fallback values for invalid input', t => {
    const invalidConfigs = [
        null,
        {},
        { version: b4a.alloc(0), data: b4a.alloc(0) },
        { version: b4a.from([0x01]), data: null }
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
