import test from 'brittle'
import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js';
import { TRO, not_allowed_data_types } from '../../../fixtures/check.fixtures.js';
import { topLevelValidationTests, valueLevelValidationTest, addressBufferLengthTest, fieldsBufferLengthTest, partialTypeCommonTests } from './common.test.js';
import { config } from '../../../helpers/config.js';

const stateValidationSchema = new StateValidationSchema(config)

test('validateTransferOperation - happy-path case', t => {
    // ADD_WRITER
    const partial_result = stateValidationSchema.validateTransferOperation(TRO.valid_partial_transfer)
    const complete_result = stateValidationSchema.validateTransferOperation(TRO.valid_complete_transfer)
    t.ok(partial_result, 'Valid data for partial transaction operation should pass the validation')
    t.ok(complete_result, 'Valid data for complete transaction operation should pass the validation')
})

test('validateTransferOperation - optional fields va, vn, vs', t => {
    partialTypeCommonTests(
        t,
        stateValidationSchema.validateTransferOperation.bind(stateValidationSchema),
        TRO.valid_complete_transfer,
        'tro'
    )
})

test('validateTransferOperation - data type validation TOP LEVEL', t => {
    //complete
    topLevelValidationTests(
        t,
        stateValidationSchema.validateTransferOperation.bind(stateValidationSchema),
        TRO.valid_complete_transfer,
        'tro',
        not_allowed_data_types,
        TRO.top_fields_transfer
    );
    //partial
    topLevelValidationTests(
        t,
        stateValidationSchema.validateTransferOperation.bind(stateValidationSchema),
        TRO.valid_partial_transfer,
        'tro',
        not_allowed_data_types,
        TRO.top_fields_transfer
    );
});

test('validateTransferOperation - value level validation (tro)', t => {
    //complete
    valueLevelValidationTest(
        t,
        stateValidationSchema.validateTransferOperation.bind(stateValidationSchema),
        TRO.valid_complete_transfer,
        'tro',
        TRO.complete_transfer_value_fields,
        not_allowed_data_types
    );
    // partial
    valueLevelValidationTest(
        t,
        stateValidationSchema.validateTransferOperation.bind(stateValidationSchema),
        TRO.valid_partial_transfer,
        'tro',
        TRO.partial_transfer_value_fields,
        not_allowed_data_types
    );

});

test('validateTransferOperation - address buffer length validation - TOP LEVEL', t => {
    //complete
    addressBufferLengthTest(
        t,
        stateValidationSchema.validateTransferOperation.bind(stateValidationSchema),
        TRO.valid_complete_transfer,
    );
    //partial
    addressBufferLengthTest(
        t,
        stateValidationSchema.validateTransferOperation.bind(stateValidationSchema),
        TRO.valid_partial_transfer,
    );
});

test('validateTransferOperation - Buffer length validation - VALUE LEVEL (tro)', t => {
    //complete
    fieldsBufferLengthTest(
        t,
        stateValidationSchema.validateTransferOperation.bind(stateValidationSchema),
        TRO.valid_complete_transfer,
        'tro',
        TRO.required_length_of_fields_for_complete_transfer
    );
    //partial
    fieldsBufferLengthTest(
        t,
        stateValidationSchema.validateTransferOperation.bind(stateValidationSchema),
        TRO.valid_partial_transfer,
        'tro',
        TRO.required_length_of_fields_for_partial_transfer
    );

});
