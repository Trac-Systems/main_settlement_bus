import test from 'brittle'
import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js'
import { ACO, not_allowed_data_types } from '../../../fixtures/check.fixtures.js'
import { topLevelValidationTests, valueLevelValidationTest, addressBufferLengthTest, fieldsBufferLengthTest } from './common.test.js';
import { config } from '../../../helpers/config.js';

const stateValidationSchema = new StateValidationSchema(config)

test('validateAdminControlOperation- happy paths for all operation types', t => {
    const validInputs = [
        ACO.validAppendWhitelistOperation,
        ACO.validAddIndexerOperation,
        ACO.validRemoveIndexerOperation,
        ACO.validBanValidatorOperation,
    ]

    for (const validInput of validInputs) {
        t.ok(stateValidationSchema.validateAdminControlOperation(validInput), `Valid payload for ${validInput.type} should pass`)
    }
})

test('validateAdminControlOperation - type level validation (aco)', t => {
    topLevelValidationTests(
        t,
        stateValidationSchema.validateAdminControlOperation.bind(stateValidationSchema),
        ACO.validAppendWhitelistOperation,
        'aco',
        not_allowed_data_types,
        ACO.topFieldsAdminControl
    );

    topLevelValidationTests(
        t,
        stateValidationSchema.validateAdminControlOperation.bind(stateValidationSchema),
        ACO.validAddIndexerOperation,
        'aco',
        not_allowed_data_types,
        ACO.topFieldsAdminControl
    );

    topLevelValidationTests(
        t,
        stateValidationSchema.validateAdminControlOperation.bind(stateValidationSchema),
        ACO.validRemoveIndexerOperation,
        'aco',
        not_allowed_data_types,
        ACO.topFieldsAdminControl
    );

    topLevelValidationTests(
        t,
        stateValidationSchema.validateAdminControlOperation.bind(stateValidationSchema),
        ACO.validBanValidatorOperation,
        'aco',
        not_allowed_data_types,
        ACO.topFieldsAdminControl
    );
});

test('validateAdminControlOperation - value level validation (aco)', t => {
    valueLevelValidationTest(
        t,
        stateValidationSchema.validateAdminControlOperation.bind(stateValidationSchema),
        ACO.validAppendWhitelistOperation,
        'aco',
        ACO.adminControlValueFields,
        not_allowed_data_types
    );

    valueLevelValidationTest(
        t,
        stateValidationSchema.validateAdminControlOperation.bind(stateValidationSchema),
        ACO.validAddIndexerOperation,
        'aco',
        ACO.adminControlValueFields,
        not_allowed_data_types
    );

    valueLevelValidationTest(
        t,
        stateValidationSchema.validateAdminControlOperation.bind(stateValidationSchema),
        ACO.validRemoveIndexerOperation,
        'aco',
        ACO.adminControlValueFields,
        not_allowed_data_types
    );

    valueLevelValidationTest(
        t,
        stateValidationSchema.validateAdminControlOperation.bind(stateValidationSchema),
        ACO.validBanValidatorOperation,
        'aco',
        ACO.adminControlValueFields,
        not_allowed_data_types
    );
});

test('validateAdminControlOperation - address buffer length validation - TOP LEVEL', t => {
    addressBufferLengthTest(
        t,
        stateValidationSchema.validateAdminControlOperation.bind(stateValidationSchema),
        ACO.validAppendWhitelistOperation,
    );

    addressBufferLengthTest(
        t,
        stateValidationSchema.validateAdminControlOperation.bind(stateValidationSchema),
        ACO.validAddIndexerOperation,
    );

    addressBufferLengthTest(
        t,
        stateValidationSchema.validateAdminControlOperation.bind(stateValidationSchema),
        ACO.validRemoveIndexerOperation,
    );

    addressBufferLengthTest(
        t,
        stateValidationSchema.validateAdminControlOperation.bind(stateValidationSchema),
        ACO.validBanValidatorOperation,
    );
});

test('validateAdminControlOperation - fields buffer length validation - VALUE LEVEL (aco)', t => {
    fieldsBufferLengthTest(
        t,
        stateValidationSchema.validateAdminControlOperation.bind(stateValidationSchema),
        ACO.validAppendWhitelistOperation,
        'aco',
        ACO.requiredLengthOfFieldsForAdminControl
    );

    fieldsBufferLengthTest(
        t,
        stateValidationSchema.validateAdminControlOperation.bind(stateValidationSchema),
        ACO.validAddIndexerOperation,
        'aco',
        ACO.requiredLengthOfFieldsForAdminControl
    );

    fieldsBufferLengthTest(
        t,
        stateValidationSchema.validateAdminControlOperation.bind(stateValidationSchema),
        ACO.validRemoveIndexerOperation,
        'aco',
        ACO.requiredLengthOfFieldsForAdminControl
    );

    fieldsBufferLengthTest(
        t,
        stateValidationSchema.validateAdminControlOperation.bind(stateValidationSchema),
        ACO.validBanValidatorOperation,
        'aco',
        ACO.requiredLengthOfFieldsForAdminControl
    );
});