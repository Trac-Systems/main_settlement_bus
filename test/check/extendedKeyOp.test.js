import test from 'brittle'
import checkFixtures from '../fixtures/check.fixtures.js'
import Check from '../../src/utils/check.js'
import { topLevelValidationTests, valueLevelValidationTest, addressBufferLengthTest, fieldsBufferLengthTest } from './common.test.js';
const check = new Check()

test('validateExtendedKeyOpSchema - happy paths for all operation types', t => {
    const validInputs = [
        checkFixtures.validAddAdmin,
        checkFixtures.validAddWriter,
        checkFixtures.validRemoveWriter
    ]

    for (const validInput of validInputs) {
        t.ok(check.validateExtendedKeyOpSchema(validInput), `Valid payload for ${validInput.type} should pass`)
    }
})

test('validateExtendedKeyOpSchema - data type validation TOP LEVEL', t => {
    topLevelValidationTests(
        t,
        check.validateExtendedKeyOpSchema.bind(check),
        checkFixtures.validAddAdmin,
        'eko',
        checkFixtures.notAllowedDataTypes,
        checkFixtures.topFieldsEko
    );
})

test('validateBasicKeyOp - value level validation (eko)', t => {
    valueLevelValidationTest(
        t,
        check.validateExtendedKeyOpSchema.bind(check),
        checkFixtures.validAddAdmin,
        'eko',
        checkFixtures.extendedKeyOpValueFields,
        checkFixtures.notAllowedDataTypes
    );
})

test('validateBasicKeyOp - address buffer length validation - TOP LEVEL', t => {
    addressBufferLengthTest(
        t,
        check.validateExtendedKeyOpSchema.bind(check),
        checkFixtures.validAddAdmin,
    );
});

test('validateBasicKeyOp - fields buffer length validation - VALUE LEVEL (eko)', t => {

    fieldsBufferLengthTest(
        t,
        check.validateExtendedKeyOpSchema.bind(check),
        checkFixtures.validAddAdmin,
        'eko',
        checkFixtures.requiredLengthOfFieldsForExtendedValue
    )
});
