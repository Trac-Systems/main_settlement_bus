import test from 'brittle';
import b4a from 'b4a';

import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js';
import {
    safeDecodeApplyOperation,
    safeEncodeApplyOperation
} from '../../../../src/codecs/apply/applyOperationCodec.js';
import {
    HASH_BYTE_LENGTH,
    HTLC_LOCK_ID_BYTE_LENGTH,
    NONCE_BYTE_LENGTH,
    OperationType,
    SIGNATURE_BYTE_LENGTH
} from '../../../../src/utils/constants.js';
import fixtures from '../../../fixtures/applyOperation.fixtures.js';
import { not_allowed_data_types } from '../../../fixtures/check.fixtures.js';
import { config } from '../../../helpers/config.js';
import {
    topLevelValidationTests,
    valueLevelValidationTest,
    addressBufferLengthTest,
    fieldsBufferLengthTest
} from './common.test.js';

import {operationContractTests} from './schemaValidationTestHelpers.js';
import {htlcOperationPipelineTests} from './htlcSchemaTestHelpers.js';

const stateValidationSchema = new StateValidationSchema(config);
const validate = stateValidationSchema.validateHtlcRefundOperation.bind(stateValidationSchema);
const submitterFieldLengths = {
    tx: HASH_BYTE_LENGTH,
    txv: HASH_BYTE_LENGTH,
    li: HTLC_LOCK_ID_BYTE_LENGTH,
    in: NONCE_BYTE_LENGTH,
    is: SIGNATURE_BYTE_LENGTH
};
const validatorFieldLengths = {
    va: config.addressLength,
    vn: NONCE_BYTE_LENGTH,
    vs: SIGNATURE_BYTE_LENGTH
};
const completeFieldLengths = {...submitterFieldLengths, ...validatorFieldLengths};

function makeValidOperation(mode = 'complete') {
    const fixture = fixtures.validHtlcRefundOperation;
    const operation = {
        ...fixture,
        address: b4a.from(fixture.address),
        hro: Object.fromEntries(Object.entries(fixture.hro).map(([field, value]) => [field, b4a.from(value)]))
    };
    for (const field of Object.keys(validatorFieldLengths)) {
        if (mode === 'partial') delete operation.hro[field];
        if (mode === 'undefined') operation.hro[field] = undefined;
        if (mode === 'decoded partial') operation.hro[field] = null;
    }
    return operation;
}

test('validateHtlcRefundOperation accepts complete and partial representations', t => {
    for (const mode of ['complete', 'partial', 'undefined', 'decoded partial']) {
        t.is(validate(makeValidOperation(mode)), true, `${mode} is valid`);
    }
});

for (const mode of ['complete', 'partial', 'decoded partial']) {
    const fieldLengths = mode === 'complete' ? completeFieldLengths : submitterFieldLengths;

    test(`validateHtlcRefundOperation - ${mode} top level validation`, t => {
        topLevelValidationTests(
            t, validate, makeValidOperation(mode), 'hro', not_allowed_data_types, ['type', 'address', 'hro']
        );
    });

    test(`validateHtlcRefundOperation - ${mode} value level validation (hro)`, t => {
        valueLevelValidationTest(
            t, validate, makeValidOperation(mode), 'hro', Object.keys(fieldLengths), not_allowed_data_types
        );
    });

    test(`validateHtlcRefundOperation - ${mode} address buffer length validation`, t => {
        addressBufferLengthTest(t, validate, makeValidOperation(mode));
    });

    test(`validateHtlcRefundOperation - ${mode} field buffer length validation (hro)`, t => {
        fieldsBufferLengthTest(t, validate, makeValidOperation(mode), 'hro', fieldLengths);
    });

    test(`validateHtlcRefundOperation - ${mode} rejects other operation types without coercion`, t => {
        const invalidTypes = [
            ...Object.values(OperationType).filter(type => type !== OperationType.HTLC_REFUND),
            String(OperationType.HTLC_REFUND),
            OperationType.HTLC_REFUND + 0.5,
            NaN,
            Infinity,
            -Infinity
        ];
        for (const type of invalidTypes) {
            const operation = makeValidOperation(mode);
            operation.type = type;
            t.is(validate(operation), false, `type ${String(type)} is rejected`);
            t.ok(Object.is(operation.type, type), 'operation type is not coerced');
        }
    });

    test(`validateHtlcRefundOperation - ${mode} rejects empty and misplaced payloads`, t => {
        for (const hro of [{}, {hro: makeValidOperation(mode).hro}]) {
            const operation = {...makeValidOperation(mode), hro};
            t.is(validate(operation), false, 'hro must directly contain the required fields');
        }
        const operation = makeValidOperation(mode);
        Object.assign(operation, operation.hro);
        delete operation.hro;
        t.is(validate(operation), false, 'refund fields cannot replace the hro payload at top level');
    });

    test(`validateHtlcRefundOperation - ${mode} rejects unknown top level and value level fields`, t => {
        for (const value of [undefined, null, b4a.alloc(32, 1)]) {
            for (const field of ['extra', 'hco', 'hlo', 'tro']) {
                const operation = makeValidOperation(mode);
                operation[field] = value;
                t.is(validate(operation), false, `unexpected top level ${field} is rejected`);
                t.ok(Object.hasOwn(operation, field), 'strict validation does not strip unknown fields');
            }
            for (const field of ['extra', 'pi', 'ra', 'am']) {
                const operation = makeValidOperation(mode);
                operation.hro[field] = value;
                t.is(validate(operation), false, `unexpected hro.${field} is rejected`);
                t.ok(Object.hasOwn(operation.hro, field), 'strict validation does not strip unknown fields');
            }
        }
    });

    test(`validateHtlcRefundOperation - ${mode} rejects zero-filled buffers at both levels`, t => {
        const zeroAddress = makeValidOperation(mode);
        zeroAddress.address = b4a.alloc(config.addressLength);
        t.is(validate(zeroAddress), false, 'zero-filled address is rejected');
        for (const [field, length] of Object.entries(fieldLengths)) {
            const operation = makeValidOperation(mode);
            operation.hro[field] = b4a.alloc(length);
            t.is(validate(operation), false, `zero-filled hro.${field} is rejected`);
        }
    });

    test(`validateHtlcRefundOperation - ${mode} requires binary fields without coercion`, t => {
        for (const [field, length] of Object.entries({address: config.addressLength, ...fieldLengths})) {
            const bytes = b4a.alloc(length, 1);
            const invalidValues = [
                b4a.toString(bytes, 'hex'),
                Array.from(bytes),
                {type: 'Buffer', data: Array.from(bytes)},
                {...bytes, length},
                new Uint16Array(length).fill(1)
            ];
            for (const value of invalidValues) {
                const operation = makeValidOperation(mode);
                const target = field === 'address' ? operation : operation.hro;
                target[field] = value;
                t.is(validate(operation), false, `${field} rejects a non-byte-buffer representation`);
                t.is(target[field], value, 'validation does not convert the field');
            }
        }
    });
}

test('validateHtlcRefundOperation rejects invalid top level containers without throwing', t => {
    for (const value of not_allowed_data_types) {
        t.is(validate(value), false, `invalid root ${String(value)} is rejected`);
    }
});

test('validateHtlcRefundOperation enforces all validator metadata combinations', t => {
    const validMetadata = fixtures.validHtlcRefundOperation.hro;
    const representations = ['buffer', 'undefined', 'null'];
    for (const va of representations) {
        for (const vn of representations) {
            for (const vs of representations) {
                const operation = makeValidOperation('partial');
                for (const [field, representation] of Object.entries({va, vn, vs})) {
                    operation.hro[field] = representation === 'buffer'
                        ? b4a.from(validMetadata[field])
                        : representation === 'null' ? null : undefined;
                }
                const expected = va === vn && vn === vs;
                t.is(validate(operation), expected, `va=${va}, vn=${vn}, vs=${vs}`);
            }
        }
    }
});

test('validateHtlcRefundOperation treats omitted validator fields like undefined', t => {
    const fields = Object.keys(validatorFieldLengths);
    for (let mask = 0; mask < 8; mask++) {
        const complete = makeValidOperation();
        const decodedPartial = makeValidOperation('decoded partial');
        const partial = makeValidOperation('undefined');
        for (let index = 0; index < fields.length; index++) {
            if ((mask & (1 << index)) === 0) continue;
            delete complete.hro[fields[index]];
            delete decodedPartial.hro[fields[index]];
            delete partial.hro[fields[index]];
        }
        t.is(validate(complete), mask === 0 || mask === 7, `complete deletion mask ${mask}`);
        t.is(validate(decodedPartial), mask === 0 || mask === 7, `decoded partial deletion mask ${mask}`);
        t.is(validate(partial), true, `undefined partial deletion mask ${mask}`);
    }
});

test('validateHtlcRefundOperation accepts Uint8Array bytes consistently with other operations', t => {
    const operation = makeValidOperation();
    operation.address = new Uint8Array(operation.address);
    for (const field of Object.keys(completeFieldLengths)) {
        operation.hro[field] = new Uint8Array(operation.hro[field]);
    }
    t.is(validate(operation), true, 'byte arrays with the correct lengths are valid');
});

test('validateHtlcRefundOperation validates decoded partial and complete operations', t => {
    for (const mode of ['complete', 'partial', 'decoded partial']) {
        const operation = makeValidOperation(mode);
        const encoded = safeEncodeApplyOperation(operation);
        t.ok(encoded.length > 0, `${mode} encodes successfully`);
        const decoded = safeDecodeApplyOperation(encoded);
        t.ok(decoded, `${mode} decodes successfully`);
        t.is(validate(decoded), true, `${mode} validates after protobuf roundtrip`);
        if (mode !== 'complete') {
            for (const field of Object.keys(validatorFieldLengths)) {
                t.is(decoded.hro[field], null, `decoded partial hro.${field} is null`);
            }
        }
    }
});

test('validateHtlcRefundOperation rejects incomplete or invalid decoded fields', t => {
    for (const mode of ['complete', 'partial']) {
        for (const field of Object.keys(submitterFieldLengths)) {
            const operation = makeValidOperation(mode);
            delete operation.hro[field];
            const decoded = safeDecodeApplyOperation(safeEncodeApplyOperation(operation));
            t.ok(decoded, `protobuf permits missing ${field}`);
            t.is(validate(decoded), false, `schema requires decoded hro.${field}`);
        }
    }
    for (const field of Object.keys(validatorFieldLengths)) {
        const operation = makeValidOperation();
        delete operation.hro[field];
        const decoded = safeDecodeApplyOperation(safeEncodeApplyOperation(operation));
        t.is(decoded.hro[field], null, `missing ${field} is normalized to null`);
        t.is(validate(decoded), false, 'decoded mixed validator metadata is rejected');
    }
});

test('validateHtlcRefundOperation - operation contract', t => {
    operationContractTests(
        t,
        validate,
        fixtures.validHtlcRefundOperation,
        'hro',
        [OperationType.HTLC_REFUND],
        completeFieldLengths,
        true,
        [], // zeroAllowed
        [], // optionalFields
        [], // otherRequiredFields
        [], // objectFields
        [], // zeroPolicyUnspecified
        true // decodedNullMetadata
    );
});

test('validateHtlcRefundOperation - builder, codec and partial sanitizer', async t => {
    await htlcOperationPipelineTests(
        t,
        validate,
        fixtures.validHtlcRefundOperation,
        'hro'
    );
});
