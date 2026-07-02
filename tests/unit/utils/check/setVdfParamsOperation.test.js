import test from 'brittle';

import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js';
import { VPO, not_allowed_data_types } from '../../../fixtures/check.fixtures.js';
import { topLevelValidationTests, valueLevelValidationTest, addressBufferLengthTest, fieldsBufferLengthTest } from './common.test.js';
import { config } from '../../../helpers/config.js';

const stateValidationSchema = new StateValidationSchema(config);

test('validateSetVdfParamsOperation - happy path', t => {
    t.ok(
        stateValidationSchema.validateSetVdfParamsOperation(VPO.valid_set_vdf_params_operation),
        'Valid data for set VDF params operation should pass the validation'
    );
});

test('validateSetVdfParamsOperation - type level validation (vpo)', t => {
    topLevelValidationTests(
        t,
        stateValidationSchema.validateSetVdfParamsOperation.bind(stateValidationSchema),
        VPO.valid_set_vdf_params_operation,
        'vpo',
        not_allowed_data_types,
        VPO.top_fields_set_vdf_params
    );
});

test('validateSetVdfParamsOperation - value level validation (vpo)', t => {
    valueLevelValidationTest(
        t,
        stateValidationSchema.validateSetVdfParamsOperation.bind(stateValidationSchema),
        VPO.valid_set_vdf_params_operation,
        'vpo',
        VPO.set_vdf_params_value_fields,
        not_allowed_data_types
    );
});

test('validateSetVdfParamsOperation - address buffer length validation - TOP LEVEL', t => {
    addressBufferLengthTest(
        t,
        stateValidationSchema.validateSetVdfParamsOperation.bind(stateValidationSchema),
        VPO.valid_set_vdf_params_operation,
    );
});

test('validateSetVdfParamsOperation - fields buffer length validation - VALUE LEVEL (vpo)', t => {
    fieldsBufferLengthTest(
        t,
        stateValidationSchema.validateSetVdfParamsOperation.bind(stateValidationSchema),
        VPO.valid_set_vdf_params_operation,
        'vpo',
        VPO.required_length_of_fields_for_set_vdf_params
    );
});
