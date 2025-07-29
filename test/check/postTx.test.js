import test from 'brittle'

import Check from '../../src/utils/check.js';
import { TXO, notAllowedDataTypes } from '../fixtures/check.fixtures.js'
import { topLevelValidationTests, valueLevelValidationTest, addressBufferLengthTest, fieldsBufferLengthTest } from './common.test.js';

const check = new Check();

test('validatePostTx - happy-path case', t => {
    const result = check.validatePostTx(TXO.validPostTx)
    t.ok(result, 'Valid data should pass the validation')
})

test('validatePostTx - data type validation TOP LEVEL', t => {

    topLevelValidationTests(
        t,
        check.validatePostTx.bind(check),
        TXO.validPostTx,
        'txo',
        notAllowedDataTypes,
        TXO.topFieldsTx
    );
})

test('validateBasicKeyOp - value level validation (txo)', t => {
    valueLevelValidationTest(
        t,
        check.validatePostTx.bind(check),
        TXO.validPostTx,
        'txo',
        TXO.postTxValueFields,
        notAllowedDataTypes
    );
})

test('validatePostTx - address buffer length validation - TOP LEVEL', t => {
    addressBufferLengthTest(
        t,
        check.validatePostTx.bind(check),
        TXO.validPostTx,
    );
});

test('validatePostTx - Buffer length validation - VALUE LEVEL (txo)', t => {

    fieldsBufferLengthTest(
        t,
        check.validatePostTx.bind(check),
        TXO.validPostTx,
        'txo',
        TXO.requiredLengthOfFieldsForPostTx
    );
});


