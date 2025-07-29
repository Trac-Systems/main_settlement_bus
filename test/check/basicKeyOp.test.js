import test from 'brittle'
import checkFixtures from '../fixtures/check.fixtures.js'
import Check from '../../src/utils/check.js';
import { topLevelValidationTests, valueLevelValidationTest, addressBufferLengthTest, fieldsBufferLengthTest } from './common.test.js';
const check = new Check();

test('validateBasicKeyOp - happy paths for all operation types', t => {
    const validInputs = [
        checkFixtures.validAddIndexer,
        checkFixtures.validRemoveIndexer,
        checkFixtures.validAppendWhitelist,
        checkFixtures.validBanValidator
    ]

    for (const validInput of validInputs) {
        t.ok(check.validateBasicKeyOp(validInput), `Valid data for ${validInput.type} should pass the validation`)
    }
})

test('validateBasicKeyOp - top-level structure and type validation', t => {
    topLevelValidationTests(
        t,
        check.validateBasicKeyOp.bind(check),
        checkFixtures.validAddIndexer,
        'bko',
        checkFixtures.notAllowedDataTypes,
        checkFixtures.topFieldsBko
    );
})

test('validateBasicKeyOp - value level validation (bko)', t => {
    valueLevelValidationTest(
        t,
        check.validateBasicKeyOp.bind(check),
        checkFixtures.validAddIndexer,
        'bko',
        checkFixtures.basicKeyOpValueFields,
        checkFixtures.notAllowedDataTypes
    );
})

test('validateBasicKeyOp - address buffer length validation - TOP LEVEL', t => {
    addressBufferLengthTest(
        t,
        check.validateBasicKeyOp.bind(check),
        checkFixtures.validAddIndexer,
    );
});

test('validateBasicKeyOp - fields buffer length validation - VALUE LEVEL (bko)', t => {

    fieldsBufferLengthTest(
        t,
        check.validateBasicKeyOp.bind(check),
        checkFixtures.validAddIndexer,
        'bko',
        checkFixtures.requiredLengthOfFieldsForBasicKeyOp
    )
});
