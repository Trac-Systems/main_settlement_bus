import test from 'brittle';
import b4a from 'b4a';

import {
    decodeVdfConfig,
    encodeVdfConfig,
    safeDecodeVdfConfig,
    safeEncodeVdfConfig
} from '../../../src/codecs/consensus/v1/vdfConfigCodec.js';

test('VDF config codec encodes and decodes the canonical six-byte representation', t => {
    const config = {
        difficulty: b4a.from([0x01, 0x02, 0x03, 0x04]),
        discriminantBitSize: b4a.from([0x05, 0x06])
    };

    const encoded = encodeVdfConfig(config);
    const decoded = decodeVdfConfig(encoded);

    t.alike(encoded, b4a.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]));
    t.is(encoded.length, 6);
    t.alike(decoded, config);
});

test('VDF config codec preserves big-endian field bytes', t => {
    const config = {
        difficulty: b4a.from([0x12, 0x34, 0x56, 0x78]),
        discriminantBitSize: b4a.from([0x9a, 0xbc])
    };

    const decoded = decodeVdfConfig(encodeVdfConfig(config));

    t.is(decoded.difficulty.readUInt32BE(0), 0x12345678);
    t.is(decoded.discriminantBitSize.readUInt16BE(0), 0x9abc);
    t.alike(decoded, config);
});

test('VDF config codec accepts structurally valid zero values', t => {
    const config = {
        difficulty: b4a.alloc(4, 0x00),
        discriminantBitSize: b4a.alloc(2, 0x00)
    };

    const encoded = encodeVdfConfig(config);
    const decoded = decodeVdfConfig(encoded);

    t.alike(encoded, b4a.alloc(6, 0x00));
    t.alike(decoded, config);
});

test('VDF config codec accepts maximum field bytes', t => {
    const config = {
        difficulty: b4a.alloc(4, 0xff),
        discriminantBitSize: b4a.alloc(2, 0xff)
    };

    const encoded = encodeVdfConfig(config);
    const decoded = decodeVdfConfig(encoded);

    t.alike(encoded, b4a.alloc(6, 0xff));
    t.alike(decoded, config);
});

test('encodeVdfConfig rejects invalid payloads and field sizes', t => {
    const validDifficulty = b4a.alloc(4);
    const validDiscriminantBitSize = b4a.alloc(2);
    const invalidConfigs = [
        null,
        undefined,
        [],
        b4a.alloc(0),
        'config',
        {},
        { difficulty: validDifficulty },
        { discriminantBitSize: validDiscriminantBitSize },
        { difficulty: 1, discriminantBitSize: validDiscriminantBitSize },
        { difficulty: b4a.alloc(3), discriminantBitSize: validDiscriminantBitSize },
        { difficulty: b4a.alloc(5), discriminantBitSize: validDiscriminantBitSize },
        { difficulty: validDifficulty, discriminantBitSize: 1 },
        { difficulty: validDifficulty, discriminantBitSize: b4a.alloc(1) },
        { difficulty: validDifficulty, discriminantBitSize: b4a.alloc(3) }
    ];

    for (const config of invalidConfigs) {
        t.exception(() => encodeVdfConfig(config));
    }
});

test('decodeVdfConfig rejects non-canonical encoded lengths', t => {
    const invalidEncodedValues = [
        null,
        undefined,
        {},
        [],
        'encoded',
        b4a.alloc(0),
        b4a.alloc(5),
        b4a.alloc(7)
    ];

    for (const encoded of invalidEncodedValues) {
        t.exception(() => decodeVdfConfig(encoded));
    }
});

test('Safe VDF config codec roundtrips valid configurations', t => {
    const config = {
        difficulty: b4a.from([0xaa, 0xbb, 0xcc, 0xdd]),
        discriminantBitSize: b4a.from([0xee, 0xff])
    };

    const encoded = safeEncodeVdfConfig(config);
    const decoded = safeDecodeVdfConfig(encoded);

    t.alike(encoded, b4a.from([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]));
    t.alike(decoded, config);
});

test('Safe VDF config codec returns fallback values for invalid input', t => {
    const invalidConfigs = [
        null,
        {},
        {
            difficulty: b4a.alloc(3),
            discriminantBitSize: b4a.alloc(2)
        },
        {
            difficulty: b4a.alloc(4),
            discriminantBitSize: b4a.alloc(3)
        }
    ];
    const invalidEncodedValues = [
        null,
        {},
        'encoded',
        b4a.alloc(5),
        b4a.alloc(7)
    ];

    for (const config of invalidConfigs) {
        const encoded = safeEncodeVdfConfig(config);

        t.ok(b4a.isBuffer(encoded));
        t.is(encoded.length, 0);
    }

    for (const encoded of invalidEncodedValues) {
        t.is(safeDecodeVdfConfig(encoded), null);
    }
});
