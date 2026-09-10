import test from 'brittle';
import b4a from 'b4a';
import { safeDecodeVersionedConsensusConfig } from '../../../../src/core/state/utils/consensusConfig.js';
import { encodeConsensusConfig } from '../../../../src/codecs/apply/applyOperationCodec.js';
import applyOperationsGenerated from '../../../../src/codecs/apply/applyOperations.generated.cjs';

const { ConsensusControlOperation } = applyOperationsGenerated.apply.operations;

// Bypass envelope validation only to construct malformed wire fixtures.
function encodeUncheckedConfig(cc) {
    return b4a.from(ConsensusControlOperation.encode({ cc }).finish());
}

test('On-chain consensus config decoding returns VDF V1 parameters as numbers', t => {
    const encoded = encodeConsensusConfig({
        sv: b4a.from([1]),
        cd: b4a.from('000000010400', 'hex'),
    });
    t.alike(safeDecodeVersionedConsensusConfig(encoded), {
        schemaVersion: 1,
        configData: { difficulty: 1, discriminantBitSize: 1024 },
    });

    const invalidParameters = encodeConsensusConfig({
        sv: b4a.from([1]),
        cd: b4a.from('000000000001', 'hex'),
    });
    t.alike(safeDecodeVersionedConsensusConfig(invalidParameters), {
        schemaVersion: 1,
        configData: { difficulty: 0, discriminantBitSize: 1 },
    }, 'decoding does not replace the semantic validation in apply');
});

test('On-chain consensus config decoding returns null for malformed envelopes, versions and data', t => {
    const cd = b4a.from('000000010400', 'hex');
    const sv = b4a.from([1]);
    const malformed = [
        null,
        'config',
        b4a.alloc(0),
        b4a.from([0xff]),
        encodeUncheckedConfig(undefined),
        encodeUncheckedConfig({ cd }),
        encodeUncheckedConfig({ sv: b4a.alloc(0), cd }),
        encodeUncheckedConfig({ sv: b4a.from([1, 0]), cd }),
        encodeUncheckedConfig({ sv }),
        encodeUncheckedConfig({ sv, cd: b4a.alloc(0) }),
        encodeUncheckedConfig({ sv, cd: b4a.alloc(5) }),
        encodeUncheckedConfig({ sv, cd: b4a.alloc(7) }),
    ];
    for (const encoded of malformed) {
        t.is(safeDecodeVersionedConsensusConfig(encoded), null);
    }
});

test('On-chain consensus config decoding never interprets an unsupported version as VDF V1', t => {
    for (const version of [0, 2, 255]) {
        const encoded = encodeConsensusConfig({
            sv: b4a.from([version]),
            cd: b4a.from('000000010400', 'hex'),
        });
        t.is(safeDecodeVersionedConsensusConfig(encoded), null);
    }
});
