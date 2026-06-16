import test from 'brittle'
import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js'
import { BIO, not_allowed_data_types } from '../../../fixtures/check.fixtures.js'
import { topLevelValidationTests, valueLevelValidationTest, addressBufferLengthTest, fieldsBufferLengthTest } from './common.test.js';
import { config } from '../../../helpers/config.js';

const stateValidationSchema = new StateValidationSchema(config)

test('validateBalanceInitialization - happy path', t => {

    const complete_result = stateValidationSchema.validateBalanceInitialization(BIO.valid_balance_initialization_operation)
    t.ok(complete_result, 'Valid data for complete balance initialization operation should pass the validation')

})

test('validateBalanceInitialization - type level validation (bio)', t => {
    topLevelValidationTests(
        t,
        stateValidationSchema.validateBalanceInitialization.bind(stateValidationSchema),
        BIO.valid_balance_initialization_operation,
        'bio',
        not_allowed_data_types,
        BIO.top_fields_balance_initialization
    );
});

test('validateBalanceInitialization - value level validation (bio)', t => {
    valueLevelValidationTest(
        t,
        stateValidationSchema.validateBalanceInitialization.bind(stateValidationSchema),
        BIO.valid_balance_initialization_operation,
        'bio',
        BIO.balance_initialization_operation_value_fields,
        not_allowed_data_types
    );
});

test('validateBalanceInitialization - address buffer length validation - TOP LEVEL', t => {
    addressBufferLengthTest(
        t,
        stateValidationSchema.validateBalanceInitialization.bind(stateValidationSchema),
        BIO.valid_balance_initialization_operation,
    );
});

test('validateAdminControlOperation - fields buffer length validation - VALUE LEVEL (aco)', t => {
    fieldsBufferLengthTest(
        t,
        stateValidationSchema.validateBalanceInitialization.bind(stateValidationSchema),
        BIO.valid_balance_initialization_operation,
        'bio',
        BIO.required_length_of_fields_for_balance_initialization
    );
});