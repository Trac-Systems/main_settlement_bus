import test from 'brittle';
import b4a from 'b4a';

import legacyApplyOperations from '../../../../src/utils/protobuf/applyOperations.cjs';
import generatedApplyOperations from '../../../../src/utils/protobuf/applyOperations.generated.cjs';
import { OperationType } from '../../../../src/utils/constants.js';
import {
    safeDecodeApplyOperation,
    safeEncodeApplyOperation
} from '../../../../src/utils/protobuf/operationHelpers.js';
import fixtures from '../../../fixtures/protobuf.fixtures.js';

const { Operation } = generatedApplyOperations.apply.operations;

const validSetEpochOperation = {
    type: OperationType.SET_EPOCH,
    address: b4a.alloc(32, 0x14),
    seo: {
        cd: 42,
        ln: b4a.alloc(32, 0x01),
        ss: [
            b4a.alloc(64, 0x02),
            b4a.alloc(64, 0x03)
        ],
        pks: [
            b4a.alloc(32, 0x04),
            b4a.alloc(32, 0x05)
        ]
    }
};

const compatibilityPayloads = new Map([
    ['txComplete', fixtures.validTransactionOperation],
    ['txPartial', fixtures.validPartialTransactionOperation],
    ['addIndexer', fixtures.validAddIndexer],
    ['removeIndexer', fixtures.validRemoveIndexer],
    ['appendWhitelist', fixtures.validAppendWhitelist],
    ['banValidator', fixtures.validBanValidator],
    ['addAdmin', fixtures.validAddAdmin],
    ['disableInitialization', fixtures.validDisableInitialization],
    ['transferComplete', fixtures.validTransferOperation],
    ['transferPartial', fixtures.validPartialTransferOperation],
    ['balanceInitialization', fixtures.validBalanceInitOperation],
    ['addWriterComplete', fixtures.validCompleteAddWriter],
    ['addWriterPartial', fixtures.validPartialAddWriter],
    ['removeWriterComplete', fixtures.validCompleteRemoveWriter],
    ['removeWriterPartial', fixtures.validPartialRemoveWriter],
    ['adminRecoveryComplete', fixtures.validCompleteAdminRecovery],
    ['adminRecoveryPartial', fixtures.validPartialAdminRecovery],
    ['bootstrapDeploymentComplete', fixtures.validCompleteBootstrapDeployment],
    ['bootstrapDeploymentPartial', fixtures.validPartialBootstrapDeployment],
    ['setEpoch', validSetEpochOperation]
]);

const encodeWithGenerated = payload => {
    const verifyError = Operation.verify(payload);
    if (verifyError) throw new Error(verifyError);

    return b4a.from(Operation.encode(payload).finish());
};

test('applyOperations protobufjs encoder emits legacy-compatible bytes', t => {
    for (const [name, payload] of compatibilityPayloads) {
        const legacyEncoded = legacyApplyOperations.Operation.encode(payload);
        const generatedEncoded = encodeWithGenerated(payload);

        t.ok(
            b4a.equals(generatedEncoded, legacyEncoded),
            `${name} protobufjs bytes match legacy bytes`
        );
    }
});

test('applyOperations legacy decoder accepts protobufjs encoded payloads', t => {
    for (const [name, payload] of compatibilityPayloads) {
        const legacyEncoded = legacyApplyOperations.Operation.encode(payload);
        const generatedEncoded = encodeWithGenerated(payload);
        const expected = legacyApplyOperations.Operation.decode(legacyEncoded);
        const actual = legacyApplyOperations.Operation.decode(generatedEncoded);

        t.alike(actual, expected, `${name} legacy decoder reads protobufjs bytes`);
    }
});

test('apply operation helpers emit and decode legacy-compatible payloads', t => {
    for (const [name, payload] of compatibilityPayloads) {
        const legacyEncoded = legacyApplyOperations.Operation.encode(payload);
        const helperEncoded = safeEncodeApplyOperation(payload);

        t.ok(
            b4a.equals(helperEncoded, legacyEncoded),
            `${name} helper encoder bytes match legacy bytes`
        );
        t.alike(
            safeDecodeApplyOperation(legacyEncoded),
            legacyApplyOperations.Operation.decode(legacyEncoded),
            `${name} helper decoder reads legacy bytes like legacy decoder`
        );
    }
});

test('applyOperations protobufjs decoder accepts legacy encoded payloads', t => {
    for (const [name, payload] of compatibilityPayloads) {
        const legacyEncoded = legacyApplyOperations.Operation.encode(payload);
        const decoded = Operation.decode(legacyEncoded);
        const generatedReencoded = b4a.from(Operation.encode(decoded).finish());

        t.ok(
            b4a.equals(generatedReencoded, legacyEncoded),
            `${name} protobufjs decodes and re-encodes legacy bytes`
        );
    }
});

test('applyOperations protobufjs verify rejects multiple oneof values', t => {
    const verifyError = Operation.verify(fixtures.invalidPayloadWithMultipleOneOfKeys);

    t.ok(
        verifyError?.includes('multiple values'),
        'protobufjs verify reports multiple oneof values'
    );
});
