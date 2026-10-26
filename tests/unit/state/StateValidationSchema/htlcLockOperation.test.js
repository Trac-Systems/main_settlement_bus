import test from 'brittle';
import b4a from 'b4a';

import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js';
import fixtures from '../../../fixtures/applyOperation.fixtures.js';
import {config} from '../../../helpers/config.js';
import {safeEncodeApplyOperation, safeDecodeApplyOperation} from '../../../../src/codecs/apply/applyOperationCodec.js';
import {sanitizeDecodedPartialTransaction} from '../../../../src/core/network/protocols/validators/v1/handlers/broadcastTransaction/BroadcastTransactionPayloadUtils.js';
import {
    HTLC_MAX_SIGNERS,
    HTLC_METADATA_BYTE_LENGTH,
    PUBLIC_KEY_LENGTH,
    SIGNATURE_BYTE_LENGTH,
    OperationType,
    HASH_BYTE_LENGTH,
    NONCE_BYTE_LENGTH,
    AMOUNT_BYTE_LENGTH,
    EPOCH_BYTE_LENGTH,
    HTLC_THRESHOLD_BYTE_LENGTH
} from '../../../../src/utils/constants.js';
import {not_allowed_data_types} from '../../../fixtures/check.fixtures.js';
import {
    topLevelValidationTests,
    valueLevelValidationTest,
    addressBufferLengthTest,
    fieldsBufferLengthTest
} from './common.test.js';

import {operationContractTests} from './schemaValidationTestHelpers.js';
import {htlcOperationPipelineTests} from './htlcSchemaTestHelpers.js';

const stateValidationSchema = new StateValidationSchema(config);
const validate = stateValidationSchema.validateHtlcLockOperation.bind(stateValidationSchema);

const lockByteLengths = {
    tx: HASH_BYTE_LENGTH,
    txv: HASH_BYTE_LENGTH,
    in: NONCE_BYTE_LENGTH,
    is: SIGNATURE_BYTE_LENGTH,
    ca: config.addressLength,
    ra: config.addressLength,
    am: AMOUNT_BYTE_LENGTH,
    fa: AMOUNT_BYTE_LENGTH,
    fr: config.addressLength,
    hl: HASH_BYTE_LENGTH,
    re: EPOCH_BYTE_LENGTH,
    th: HTLC_THRESHOLD_BYTE_LENGTH,
    va: config.addressLength,
    vn: NONCE_BYTE_LENGTH,
    vs: SIGNATURE_BYTE_LENGTH
};

function makeValidOperation({complete = true} = {}) {
    const fixture = fixtures.validHtlcLockOperation;
    const operation = {
        ...fixture,
        hlo: {
            ...fixture.hlo,
            ss: fixture.hlo.ss.map(signer => b4a.from(signer)),
            cs: fixture.hlo.cs.map(signature => b4a.from(signature))
        }
    };

    // The shared fixture still supplies policyHash-era builder and escrow tests.
    // Use the new field locally while those layers are migrated separately.
    delete operation.hlo.ph;
    operation.hlo.md = b4a.from([0x00, 0xff, 0x80]);

    if (!complete) {
        delete operation.hlo.va;
        delete operation.hlo.vn;
        delete operation.hlo.vs;
    }
    return operation;
}

test('validateHtlcLockOperation accepts complete and partial canonical locks', t => {
    t.ok(stateValidationSchema.validateHtlcLockOperation(makeValidOperation()));
    t.ok(stateValidationSchema.validateHtlcLockOperation(makeValidOperation({complete: false})));
});

test('validateHtlcLockOperation accepts a fee-free lock and optional metadata omission', t => {
    const operation = makeValidOperation({complete: false});
    operation.hlo.fa = b4a.alloc(16);
    delete operation.hlo.fr;
    delete operation.hlo.md;

    t.ok(stateValidationSchema.validateHtlcLockOperation(operation));
});

test('validateHtlcLockOperation counts the maker in a maker-only threshold', t => {
    const operation = makeValidOperation({complete: false});
    operation.hlo.ss = [operation.hlo.ss[0]];
    operation.hlo.th = b4a.from([1]);
    operation.hlo.cs = [];

    t.ok(stateValidationSchema.validateHtlcLockOperation(operation));

    operation.hlo.th = b4a.from([0]);
    t.absent(stateValidationSchema.validateHtlcLockOperation(operation), 'zero does not count the mandatory maker');
});

test('validateHtlcLockOperation requires explicit lock fields', t => {
    const requiredFields = [
        'tx', 'txv', 'ca', 'ra', 'am', 'fa', 'hl', 're', 'ss', 'th', 'cs', 'in', 'is'
    ];

    for (const field of requiredFields) {
        const operation = makeValidOperation({complete: false});
        delete operation.hlo[field];
        t.absent(stateValidationSchema.validateHtlcLockOperation(operation), `${field} is required`);
    }
});

test('validateHtlcLockOperation enforces fee and fee-recipient pairing', t => {
    const missingRecipient = makeValidOperation({complete: false});
    delete missingRecipient.hlo.fr;
    t.absent(stateValidationSchema.validateHtlcLockOperation(missingRecipient));

    const recipientWithoutFee = makeValidOperation({complete: false});
    recipientWithoutFee.hlo.fa = b4a.alloc(16);
    t.absent(stateValidationSchema.validateHtlcLockOperation(recipientWithoutFee));

    const nullRecipient = makeValidOperation({complete: false});
    nullRecipient.hlo.fr = null;
    t.absent(stateValidationSchema.validateHtlcLockOperation(nullRecipient));
});

test('validateHtlcLockOperation enforces signer-set and threshold rules', t => {
    const duplicateSigners = makeValidOperation({complete: false});
    duplicateSigners.hlo.ss[1] = b4a.from(duplicateSigners.hlo.ss[0]);
    t.absent(stateValidationSchema.validateHtlcLockOperation(duplicateSigners));

    const unsortedSigners = makeValidOperation({complete: false});
    unsortedSigners.hlo.ss = [
        unsortedSigners.hlo.ss[0],
        b4a.alloc(32, 0xbb),
        b4a.alloc(32, 0xaa)
    ];
    unsortedSigners.hlo.th = b4a.from([1]);
    unsortedSigners.hlo.cs = [];
    t.absent(stateValidationSchema.validateHtlcLockOperation(unsortedSigners));

    const zeroThreshold = makeValidOperation({complete: false});
    zeroThreshold.hlo.th = b4a.from([0]);
    t.absent(stateValidationSchema.validateHtlcLockOperation(zeroThreshold));

    const excessiveThreshold = makeValidOperation({complete: false});
    excessiveThreshold.hlo.th = b4a.from([3]);
    t.absent(stateValidationSchema.validateHtlcLockOperation(excessiveThreshold));

    const unsatisfiedThreshold = makeValidOperation({complete: false});
    unsatisfiedThreshold.hlo.cs = [];
    t.absent(stateValidationSchema.validateHtlcLockOperation(unsatisfiedThreshold));
});

test('validateHtlcLockOperation rejects duplicate keys across byte representations', t => {
    for (const makerIsUint8Array of [false, true]) {
        const operation = makeValidOperation({complete: false});
        const maker = operation.hlo.ss[0];
        operation.hlo.ss = makerIsUint8Array
            ? [new Uint8Array(maker), b4a.from(maker)]
            : [b4a.from(maker), new Uint8Array(maker)];
        operation.hlo.th = b4a.from([1]);
        operation.hlo.cs = [];

        t.absent(stateValidationSchema.validateHtlcLockOperation(operation), 'identical bytes are duplicate keys');
    }

    const distinctSigners = makeValidOperation({complete: false});
    distinctSigners.hlo.ss[1] = new Uint8Array(distinctSigners.hlo.ss[1]);
    t.ok(stateValidationSchema.validateHtlcLockOperation(distinctSigners), 'distinct keys may use mixed representations');
});

test('validateHtlcLockOperation handles Buffer and Uint8Array thresholds consistently', t => {
    for (const threshold of [1, 2]) {
        for (const asUint8Array of [false, true]) {
            const operation = makeValidOperation({complete: false});
            operation.hlo.th = asUint8Array ? new Uint8Array([threshold]) : b4a.from([threshold]);
            t.ok(stateValidationSchema.validateHtlcLockOperation(operation), `threshold ${threshold} is accepted`);
        }
    }

    for (const bytes of [[0], [3], [255], [], [1, 0]]) {
        for (const asUint8Array of [false, true]) {
            const operation = makeValidOperation({complete: false});
            operation.hlo.th = asUint8Array ? new Uint8Array(bytes) : b4a.from(bytes);
            t.absent(stateValidationSchema.validateHtlcLockOperation(operation), 'invalid thresholds are rejected without throwing');
        }
    }
});

test('validateHtlcLockOperation rejects oversized arrays without visiting entries', t => {
    for (const [field, maximum] of [['ss', HTLC_MAX_SIGNERS], ['cs', HTLC_MAX_SIGNERS - 1]]) {
        const operation = makeValidOperation({complete: false});
        const value = operation.hlo[field][0];
        const entries = Array(maximum + 1).fill(value);
        let entryReads = 0;
        Object.defineProperty(entries, 0, {
            get() {
                entryReads++;
                return value;
            },
            set(_value) {},
            enumerable: true,
            configurable: true
        });
        operation.hlo[field] = entries;

        t.absent(stateValidationSchema.validateHtlcLockOperation(operation), `${field} exceeds its limit`);
        t.is(entryReads, 0, `${field} entries are not inspected`);
    }
});

test('validateHtlcLockOperation accepts maximum-sized authorization arrays', t => {
    const operation = makeValidOperation({complete: false});
    operation.hlo.ss = [
        operation.hlo.ss[0],
        ...Array.from({length: HTLC_MAX_SIGNERS - 1}, (_, index) => b4a.alloc(32, index + 1))
    ];
    operation.hlo.th = b4a.from([HTLC_MAX_SIGNERS]);
    operation.hlo.cs = Array(HTLC_MAX_SIGNERS - 1).fill(operation.hlo.cs[0]);

    t.ok(stateValidationSchema.validateHtlcLockOperation(operation));

    operation.hlo.ss = [];
    operation.hlo.cs = [];
    t.absent(stateValidationSchema.validateHtlcLockOperation(operation), 'an empty signer set is rejected');
});

test('validateHtlcLockOperation enforces cosigner signature structure', t => {
    const operation = makeValidOperation({complete: false});
    operation.hlo.cs = [b4a.alloc(63, 1)];
    t.absent(stateValidationSchema.validateHtlcLockOperation(operation), 'signatures must have the canonical length');

    operation.hlo.cs = [b4a.alloc(64, 1), b4a.alloc(64, 2)];
    t.absent(stateValidationSchema.validateHtlcLockOperation(operation), 'signatures cannot outnumber cosigners');
});

test('validateHtlcLockOperation requires complete validator metadata as a group', t => {
    const operation = makeValidOperation({complete: false});
    operation.hlo.va = fixtures.validHtlcLockOperation.hlo.va;
    t.absent(stateValidationSchema.validateHtlcLockOperation(operation));

    operation.hlo.va = null;
    t.absent(stateValidationSchema.validateHtlcLockOperation(operation));
});

test('validateHtlcLockOperation rejects malformed and unknown fields', t => {
    const badHashlock = makeValidOperation({complete: false});
    badHashlock.hlo.hl = b4a.alloc(31, 1);
    t.absent(stateValidationSchema.validateHtlcLockOperation(badHashlock));

    const zeroPrincipal = makeValidOperation({complete: false});
    zeroPrincipal.hlo.am = b4a.alloc(16);
    t.absent(stateValidationSchema.validateHtlcLockOperation(zeroPrincipal));

    const unknownField = makeValidOperation({complete: false});
    unknownField.hlo.ordered = true;
    t.absent(stateValidationSchema.validateHtlcLockOperation(unknownField));

    const removedField = makeValidOperation({complete: false});
    removedField.hlo.cc = b4a.alloc(32, 1);
    t.absent(stateValidationSchema.validateHtlcLockOperation(removedField), 'the removed field is not accepted');
});

for (const complete of [false, true]) {
    const phase = complete ? 'complete' : 'partial';
    const scalarFields = ['tx', 'txv', 'ca', 'ra', 'am', 'fa', 'hl', 're', 'th', 'in', 'is'];
    if (complete) scalarFields.push('va', 'vn', 'vs');
    const lengths = Object.fromEntries([...scalarFields, 'fr'].map(field => [field, lockByteLengths[field]]));

    test(`validateHtlcLockOperation - ${phase} top level validation`, t => {
        topLevelValidationTests(t, validate, makeValidOperation({complete}), 'hlo', not_allowed_data_types, ['type', 'address', 'hlo']);
    });

    test(`validateHtlcLockOperation - ${phase} scalar value level validation`, t => {
        valueLevelValidationTest(t, validate, makeValidOperation({complete}), 'hlo', scalarFields, not_allowed_data_types);
    });

    test(`validateHtlcLockOperation - ${phase} address and scalar buffer lengths`, t => {
        addressBufferLengthTest(t, validate, makeValidOperation({complete}));
        // Threshold 1, used by the length helper, is valid with the two-signer fixture.
        fieldsBufferLengthTest(t, validate, makeValidOperation({complete}), 'hlo', lengths);
    });
}

test('validateHtlcLockOperation validates optional fields independently', t => {
    for (const field of ['fr']) {
        for (const value of not_allowed_data_types) {
            const operation = makeValidOperation();
            operation.hlo[field] = value;
            t.is(validate(operation), false, `${field}: ${String(value)}`);
        }
    }
    for (const feeIsZero of [false, true]) {
        for (const recipient of ['absent', 'undefined', 'null', 'valid', 'empty', 'zero']) {
            const operation = makeValidOperation();
            if (feeIsZero) operation.hlo.fa = b4a.alloc(operation.hlo.fa.length);
            if (recipient === 'absent') delete operation.hlo.fr;
            if (recipient === 'undefined') operation.hlo.fr = undefined;
            if (recipient === 'null') operation.hlo.fr = null;
            if (recipient === 'empty') operation.hlo.fr = b4a.alloc(0);
            if (recipient === 'zero') operation.hlo.fr = b4a.alloc(config.addressLength);
            const expected = feeIsZero ? ['absent', 'undefined'].includes(recipient) : recipient === 'valid';
            t.is(validate(operation), expected, `zero fee=${feeIsZero}, recipient=${recipient}`);
        }
    }
});

test('validateHtlcLockOperation rejects malformed signer and signature arrays', t => {
    for (const [field, length] of [['ss', PUBLIC_KEY_LENGTH], ['cs', SIGNATURE_BYTE_LENGTH]]) {
        for (const value of not_allowed_data_types) {
            const operation = makeValidOperation();
            operation.hlo[field] = value;
            t.is(validate(operation), false, `${field} rejects ${String(value)}`);
        }
        const badEntries = [null, undefined, false, 1, '01'.repeat(length), {}, [], Symbol('entry'), b4a.alloc(0), b4a.alloc(length - 1, 1), b4a.alloc(length + 1, 1), b4a.alloc(length)];
        for (const bad of badEntries) {
            for (const index of [0, 1]) {
                const operation = makeValidOperation();
                if (field === 'cs') {
                    operation.hlo.ss.push(b4a.alloc(PUBLIC_KEY_LENGTH, 0xbb));
                    operation.hlo.cs.push(b4a.alloc(SIGNATURE_BYTE_LENGTH, 1));
                }
                operation.hlo[field][index] = bad;
                t.is(validate(operation), false, `${field}[${index}] rejects a malformed entry`);
            }
        }
        const operation = makeValidOperation();
        delete operation.hlo[field][0];
        t.is(validate(operation), false, `${field} rejects a sparse array`);
    }
});

test('validateHtlcLockOperation checks every validator metadata combination', t => {
    for (const va of ['buffer', 'undefined', 'null']) {
        for (const vn of ['buffer', 'undefined', 'null']) {
            for (const vs of ['buffer', 'undefined', 'null']) {
                const operation = makeValidOperation();
                for (const [field, kind] of Object.entries({va, vn, vs})) {
                    if (kind !== 'buffer') operation.hlo[field] = kind === 'null' ? null : undefined;
                }
                const expected = va === vn && vn === vs && va !== 'null';
                t.is(validate(operation), expected, `va=${va}, vn=${vn}, vs=${vs}`);
            }
        }
    }
});

test('validateHtlcLockOperation checks threshold and signature-count boundaries', t => {
    for (const size of [1, 2, HTLC_MAX_SIGNERS]) {
        for (const threshold of [0, 1, size, size + 1]) {
            for (const signatures of [0, size - 1, size]) {
                const operation = makeValidOperation();
                operation.hlo.ss = Array.from({length: size}, (_, index) => b4a.alloc(PUBLIC_KEY_LENGTH, index + 1));
                operation.hlo.th = b4a.from([threshold]);
                operation.hlo.cs = Array.from({length: signatures}, () => b4a.alloc(SIGNATURE_BYTE_LENGTH, 1));
                const expected = threshold >= 1 && threshold <= size && signatures < size && signatures + 1 >= threshold;
                t.is(validate(operation), expected, `size=${size}, threshold=${threshold}, signatures=${signatures}`);
            }
        }
    }
    const duplicateCosigners = makeValidOperation();
    duplicateCosigners.hlo.ss.push(b4a.from(duplicateCosigners.hlo.ss[1]));
    t.is(validate(duplicateCosigners), false, 'duplicates among cosigners are rejected');
    const makerOutsideSortOrder = makeValidOperation();
    makerOutsideSortOrder.hlo.ss = [b4a.alloc(PUBLIC_KEY_LENGTH, 0xff), b4a.alloc(PUBLIC_KEY_LENGTH, 1), b4a.alloc(PUBLIC_KEY_LENGTH, 2)];
    t.is(validate(makerOutsideSortOrder), true, 'only cosigners, not the maker at index zero, must be sorted');
});

test('validateHtlcLockOperation - operation contract', t => {
    operationContractTests(
        t,
        validate,
        makeValidOperation(),
        'hlo',
        [OperationType.HTLC_LOCK],
        lockByteLengths,
        true,
        ['fa'],
        ['md'],
        ['ss', 'cs']
    );
});

test('validateHtlcLockOperation - builder, codec and partial sanitizer', async t => {
    await htlcOperationPipelineTests(
        t,
        validate,
        fixtures.validHtlcLockOperation,
        'hlo'
    );
});

for (const complete of [false, true]) {
    const phase = complete ? 'complete' : 'partial';

    test(`validateHtlcLockOperation - ${phase} metadata is optional independently of the fee`, t => {
        for (const feeIsZero of [false, true]) {
            for (const presence of ['omitted', 'undefined', 'present']) {
                const operation = makeValidOperation({complete});
                if (feeIsZero) {
                    operation.hlo.fa = b4a.alloc(AMOUNT_BYTE_LENGTH);
                    delete operation.hlo.fr;
                }
                if (presence === 'omitted') delete operation.hlo.md;
                if (presence === 'undefined') operation.hlo.md = undefined;
                t.is(validate(operation), true, `zero fee=${feeIsZero}, metadata=${presence}`);
                t.is(Object.hasOwn(operation.hlo, 'md'), presence !== 'omitted', 'presence is not normalized');
            }
        }
    });

    test(`validateHtlcLockOperation - ${phase} metadata byte-length boundaries`, t => {
        t.is(HTLC_METADATA_BYTE_LENGTH, 1024, 'the protocol limit is 1024 bytes');
        for (const [length, expected] of [[0, false], [1, true], [2, true], [31, true], [32, true],
            [33, true], [1023, true], [1024, true], [1025, false], [2048, false]]) {
            for (const byte of [0x00, 0x01, 0xff]) {
                for (const asUint8Array of [false, true]) {
                    const operation = makeValidOperation({complete});
                    operation.hlo.md = asUint8Array ? new Uint8Array(length).fill(byte) : b4a.alloc(length, byte);
                    t.is(validate(operation), expected, `length=${length}, byte=${byte}, Uint8Array=${asUint8Array}`);
                }
            }
        }
    });

    test(`validateHtlcLockOperation - ${phase} metadata contents are opaque`, t => {
        for (let byte = 0; byte <= 255; byte++) {
            const operation = makeValidOperation({complete});
            operation.hlo.md = b4a.from([byte]);
            t.is(validate(operation), true, `single byte ${byte}`);
        }
        for (const md of [
            b4a.from(Array.from({length: 256}, (_, byte) => byte)),
            b4a.from('{"application":"swap"}'),
            b4a.from('{invalid json'),
            b4a.from([0xc3, 0x28, 0xff, 0x00]),
            b4a.from('ą'.repeat(512))
        ]) {
            const operation = makeValidOperation({complete});
            operation.hlo.md = md;
            t.is(validate(operation), true, 'binary and text payloads require no content validation');
        }
        const operation = makeValidOperation({complete});
        operation.hlo.md = b4a.from('ą'.repeat(513));
        t.is(validate(operation), false, 'the limit counts encoded bytes, not characters');
    });

    test(`validateHtlcLockOperation - ${phase} metadata rejects non-byte-buffer types`, t => {
        const invalidValues = [
            ...not_allowed_data_types.filter(value => value !== undefined && !b4a.isBuffer(value)),
            false, 0, -1, '', '00'.repeat(1024), Symbol('metadata'),
            new Int8Array(1), new Uint8ClampedArray(1), new Uint16Array(1),
            new ArrayBuffer(1), new DataView(new ArrayBuffer(1)),
            [0], {type: 'Buffer', data: [0]}, {0: 0, length: 1}, Object.create(null)
        ];
        for (const [index, md] of invalidValues.entries()) {
            const operation = makeValidOperation({complete});
            operation.hlo.md = md;
            t.is(validate(operation), false, `invalid type case ${index} is rejected without throwing`);
        }
    });

    test(`validateHtlcLockOperation - ${phase} metadata uses the byte view length`, t => {
        for (const backing of [b4a.alloc(4096, 0xff), new Uint8Array(4096).fill(0xff)]) {
            for (const [length, expected] of [[0, false], [1, true], [1024, true], [1025, false]]) {
                const operation = makeValidOperation({complete});
                operation.hlo.md = backing.subarray(100, 100 + length);
                const before = b4a.from(backing);
                Object.freeze(operation.hlo);
                Object.freeze(operation);
                t.is(validate(operation), expected, `view length=${length}, backing length=${backing.length}`);
                t.ok(b4a.equals(backing, before), 'validation does not mutate metadata or its backing buffer');
            }
        }
    });

    test(`validateHtlcLockOperation - ${phase} metadata validates after protobuf decoding`, t => {
        for (const [md, expected] of [[undefined, true], [b4a.alloc(0), false],
            [b4a.alloc(1), true], [b4a.alloc(1023, 0xff), true], [b4a.alloc(1024), true],
            [new Uint8Array(1024).fill(0xff), true], [b4a.alloc(1025, 1), false]]) {
            const operation = makeValidOperation({complete});
            if (md === undefined) delete operation.hlo.md;
            else operation.hlo.md = md;
            const encoded = safeEncodeApplyOperation(operation);
            t.ok(encoded.length > 0, 'protobuf can represent the input independently of the metadata size rule');
            const decoded = safeDecodeApplyOperation(encoded);
            t.ok(decoded, 'operation decodes');
            if (!complete) sanitizeDecodedPartialTransaction(decoded);
            t.is(validate(decoded), expected, `decoded metadata length=${md?.length ?? 'omitted'}`);
            if (md === undefined) t.is(Object.hasOwn(decoded.hlo, 'md'), false, 'omission survives protobuf');
            else t.ok(b4a.equals(decoded.hlo.md, md), 'metadata bytes survive protobuf and sanitization unchanged');
        }
    });

    test(`validateHtlcLockOperation - ${phase} only md is accepted as the metadata field name`, t => {
        for (const field of ['ph', 'policyHash', 'metadata']) {
            for (const withMetadata of [false, true]) {
                const operation = makeValidOperation({complete});
                if (!withMetadata) delete operation.hlo.md;
                operation.hlo[field] = b4a.alloc(32, 1);
                t.is(validate(operation), false, `${field} is rejected with md present=${withMetadata}`);
            }
        }
    });
}
