import test from 'brittle';

import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js';
import { SGO, not_allowed_data_types } from '../../../fixtures/check.fixtures.js';
import { topLevelValidationTests, valueLevelValidationTest, addressBufferLengthTest, fieldsBufferLengthTest } from './common.test.js';
import { config } from '../../../helpers/config.js';

const stateValidationSchema = new StateValidationSchema(config);

test('validateSetGenesisEpochOperation - happy path', t => {
    t.ok(
        stateValidationSchema.validateSetGenesisEpochOperation(SGO.valid_set_genesis_epoch_operation),
        'Valid data for set genesis epoch operation should pass the validation'
    );
});

test('validateSetGenesisEpochOperation - type level validation (sgo)', t => {
    topLevelValidationTests(
        t,
        stateValidationSchema.validateSetGenesisEpochOperation.bind(stateValidationSchema),
        SGO.valid_set_genesis_epoch_operation,
        'sgo',
        not_allowed_data_types,
        SGO.top_fields_set_genesis_epoch
    );
});

test('validateSetGenesisEpochOperation - value level validation (sgo)', t => {
    valueLevelValidationTest(
        t,
        stateValidationSchema.validateSetGenesisEpochOperation.bind(stateValidationSchema),
        SGO.valid_set_genesis_epoch_operation,
        'sgo',
        SGO.set_genesis_epoch_value_fields,
        not_allowed_data_types
    );
});

test('validateSetGenesisEpochOperation - address buffer length validation - TOP LEVEL', t => {
    addressBufferLengthTest(
        t,
        stateValidationSchema.validateSetGenesisEpochOperation.bind(stateValidationSchema),
        SGO.valid_set_genesis_epoch_operation,
    );
});

test('validateSetGenesisEpochOperation - fields buffer length validation - VALUE LEVEL (sgo)', t => {
    fieldsBufferLengthTest(
        t,
        stateValidationSchema.validateSetGenesisEpochOperation.bind(stateValidationSchema),
        SGO.valid_set_genesis_epoch_operation,
        'sgo',
        SGO.required_length_of_fields_for_set_genesis_epoch
    );
});
