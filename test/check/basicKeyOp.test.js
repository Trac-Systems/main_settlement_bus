import test from 'brittle'

import Check from '../../src/utils/check.js';
import { BKO, notAllowedDataTypes } from '../fixtures/check.fixtures.js';
import { topLevelValidationTests, valueLevelValidationTest, addressBufferLengthTest, fieldsBufferLengthTest } from './common.test.js';

const check = new Check();

test('validateBasicKeyOp - happy paths for all operation types', t => {
    const validInputs = [
        BKO.validAddIndexer,
        BKO.validRemoveIndexer,
        BKO.validAppendWhitelist,
        BKO.validBanValidator
    ]

    for (const validInput of validInputs) {
        t.ok(check.validateBasicKeyOp(validInput), `Valid data for ${validInput.type} should pass the validation`)
    }
})

test('validateBasicKeyOp - top-level structure and type validation', t => {
    topLevelValidationTests(
        t,
        check.validateBasicKeyOp.bind(check),
        BKO.validAddIndexer,
        'bko',
        notAllowedDataTypes,
        BKO.topFieldsBko
    );
})

test('validateBasicKeyOp - value level validation (bko)', t => {
    valueLevelValidationTest(
        t,
        check.validateBasicKeyOp.bind(check),
        BKO.validAddIndexer,
        'bko',
        BKO.basicKeyOpValueFields,
        notAllowedDataTypes
    );
})

test('validateBasicKeyOp - address buffer length validation - TOP LEVEL', t => {
    addressBufferLengthTest(
        t,
        check.validateBasicKeyOp.bind(check),
        BKO.validAddIndexer,
    );
});

test('validateBasicKeyOp - fields buffer length validation - VALUE LEVEL (bko)', t => {

    fieldsBufferLengthTest(
        t,
        check.validateBasicKeyOp.bind(check),
        BKO.validAddIndexer,
        'bko',
        BKO.requiredLengthOfFieldsForBasicKeyOp
    )
});
