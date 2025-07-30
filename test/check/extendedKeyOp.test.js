import test from 'brittle'

import Check from '../../src/utils/check.js'
import { EKO, notAllowedDataTypes } from '../fixtures/check.fixtures.js'
import { topLevelValidationTests, valueLevelValidationTest, addressBufferLengthTest, fieldsBufferLengthTest } from './common.test.js';

const check = new Check()

test('validateExtendedKeyOpSchema - happy paths for all operation types', t => {
    const validInputs = [
        EKO.validAddAdmin,
        EKO.validAddWriter,
        EKO.validRemoveWriter
    ]

    for (const validInput of validInputs) {
        t.ok(check.validateExtendedKeyOpSchema(validInput), `Valid payload for ${validInput.type} should pass`)
    }
})

test('validateExtendedKeyOpSchema - data type validation TOP LEVEL', t => {
    topLevelValidationTests(
        t,
        check.validateExtendedKeyOpSchema.bind(check),
        EKO.validAddAdmin,
        'eko',
        notAllowedDataTypes,
        EKO.topFieldsEko
    );
})

test('validateBasicKeyOp - value level validation (eko)', t => {
    valueLevelValidationTest(
        t,
        check.validateExtendedKeyOpSchema.bind(check),
        EKO.validAddAdmin,
        'eko',
        EKO.extendedKeyOpValueFields,
        notAllowedDataTypes
    );
})

test('validateBasicKeyOp - address buffer length validation - TOP LEVEL', t => {
    addressBufferLengthTest(
        t,
        check.validateExtendedKeyOpSchema.bind(check),
        EKO.validAddAdmin,
    );
});

test('validateBasicKeyOp - fields buffer length validation - VALUE LEVEL (eko)', t => {

    fieldsBufferLengthTest(
        t,
        check.validateExtendedKeyOpSchema.bind(check),
        EKO.validAddAdmin,
        'eko',
        EKO.requiredLengthOfFieldsForExtendedValue
    )
});
