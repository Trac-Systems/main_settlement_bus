import test from 'brittle'

import Check from '../../src/utils/check.js'
import {CAO, not_allowed_data_types} from '../fixtures/check.fixtures.js'
import { topLevelValidationTests, valueLevelValidationTest, addressBufferLengthTest, fieldsBufferLengthTest } from './common.test.js';

const check = new Check()

test('validateCoreAdminOperation- happy paths for all operation types', t => {
    const validInputs = [
        CAO.validAddAdminOperation,
    ]

    for (const validInput of validInputs) {
        t.ok(check.validateCoreAdminOperation(validInput), `Valid payload for ${validInput.type} should pass`)
    }
})

test('validateCoreAdminOperation - data type validation TOP LEVEL', t => {
    topLevelValidationTests(
        t,
        check.validateCoreAdminOperation.bind(check),
        CAO.validAddAdminOperation,
        'cao',
        not_allowed_data_types,
        CAO.topFieldsCoreAdmin
    );
})

test('validateCoreAdminOperation - value level validation (cao)', t => {
    valueLevelValidationTest(
        t,
        check.validateCoreAdminOperation.bind(check),
        CAO.validAddAdminOperation,
        'cao',
        CAO.coreAdminOperationValuesFields,
        not_allowed_data_types
    );
})

test('validateCoreAdminOperation - address buffer length validation - TOP LEVEL', t => {
    addressBufferLengthTest(
        t,
        check.validateCoreAdminOperation.bind(check),
        CAO.validAddAdminOperation,
    );
});

test('validateCoreAdminOperation - fields buffer length validation - VALUE LEVEL (eko)', t => {

    fieldsBufferLengthTest(
        t,
        check.validateCoreAdminOperation.bind(check),
        CAO.validAddAdminOperation,
        'cao',
        CAO.requiredLengthOfFieldsForCoreAdmin
    )
});