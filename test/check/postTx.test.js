import test from 'brittle'
import checkFixtures from '../fixtures/check.fixtures.js'
import Check from '../../src/utils/check.js';
import { topLevelValidationTests, valueLevelValidationTest, addressBufferLengthTest, fieldsBufferLengthTest } from './common.test.js';
const check = new Check();

test('validatePostTx - happy-path case', t => {
    const result = check.validatePostTx(checkFixtures.validPostTx)
    t.ok(result, 'Valid data should pass the validation')
})

test('validatePostTx - data type validation TOP LEVEL', t => {
    topLevelValidationTests(
        t,
        check.validatePostTx.bind(check),
        checkFixtures.validPostTx,
        'txo',
        checkFixtures.notAllowedDataTypes,
        checkFixtures.topFieldsTx
    );
})

test('validateBasicKeyOp - value level validation (txo)', t => {
    valueLevelValidationTest(
        t,
        check.validatePostTx.bind(check),
        checkFixtures.validPostTx,
        'txo',
        checkFixtures.postTxValueFields,
        checkFixtures.notAllowedDataTypes
    );
})

test('validatePostTx - address buffer length validation - TOP LEVEL', t => {
    addressBufferLengthTest(
        t,
        check.validatePostTx.bind(check),
        checkFixtures.validPostTx,
    );
});

test('validatePostTx - Buffer length validation - VALUE LEVEL (txo)', t => {

    fieldsBufferLengthTest(
        t,
        check.validatePostTx.bind(check),
        checkFixtures.validPostTx,
        'txo',
        checkFixtures.requiredLengthOfFieldsForPostTx
    );
});


