import test from 'brittle';
import b4a from 'b4a';
import {
    decodeVersionedConsensusConfig,
    safeDecodeVersionedConsensusConfig,
    validateConsensusConfig,
} from '../../../src/utils/consensusConfig.js';
import { encodeConsensusConfig } from '../../../src/codecs/apply/applyOperationCodec.js';

test('Off-chain consensus validation does not reinterpret invalid or unknown versions as VDF V1', t => {
    const cd = b4a.from('000000010400', 'hex');
    t.ok(validateConsensusConfig({ sv: b4a.from([1]), cd }));
    for (const sv of [null, 1, '1', b4a.alloc(0), b4a.from([0]), b4a.from([1, 0]), b4a.from([2]), b4a.from([255])]) {
        t.absent(validateConsensusConfig({ sv, cd }));
    }
    for (const invalidConfig of [null, {}, { sv: b4a.from([1]) }]) {
        t.absent(validateConsensusConfig(invalidConfig));
    }
    for (const invalidData of [b4a.from('000000000400', 'hex'), b4a.from('000000010001', 'hex'), b4a.alloc(5)]) {
        t.absent(validateConsensusConfig({ sv: b4a.from([1]), cd: invalidData }));
    }
});

test('Off-chain consensus config decoding returns the VDF V1 parameters as numbers', t => {
    const encoded = encodeConsensusConfig({
        sv: b4a.from([1]),
        cd: b4a.from('000000010400', 'hex'),
    });
    const expected = {
        schemaVersion: 1,
        configData: { difficulty: 1, discriminantBitSize: 1024 },
    };
    t.alike(decodeVersionedConsensusConfig(encoded), expected);
    t.alike(safeDecodeVersionedConsensusConfig(encoded), expected);
});

test('Off-chain consensus config decoding rejects unknown versions and malformed data', async t => {
    for (const version of [0, 2, 255]) {
        const encoded = encodeConsensusConfig({
            sv: b4a.from([version]),
            cd: b4a.from('000000010400', 'hex'),
        });
        await t.exception(() => decodeVersionedConsensusConfig(encoded), /Unsupported consensus config schema version/);
        t.is(safeDecodeVersionedConsensusConfig(encoded), null);
    }
    const malformedVdf = encodeConsensusConfig({ sv: b4a.from([1]), cd: b4a.alloc(5) });
    for (const encoded of [null, 'config', b4a.alloc(0), b4a.from([0xff]), malformedVdf]) {
        await t.exception.all(() => decodeVersionedConsensusConfig(encoded));
        t.is(safeDecodeVersionedConsensusConfig(encoded), null);
    }
});
