import test from 'brittle'
import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js';
import {BDO, not_allowed_data_types} from '../../../fixtures/check.fixtures.js';
import { topLevelValidationTests, valueLevelValidationTest, addressBufferLengthTest, fieldsBufferLengthTest, partialTypeCommonTests } from './common.test.js';
import { config } from '../../../helpers/config.js';

const stateValidationSchema = new StateValidationSchema(config)

test('validateBootstrapDeployment - happy-path case', t => {
    const partial_result = stateValidationSchema.validateBootstrapDeploymentOperation(BDO.valid_partial_bootstrap_deployment)
    const complete_result = stateValidationSchema.validateBootstrapDeploymentOperation(BDO.valid_complete_bootstrap_deployment)
    t.ok(partial_result, 'Valid data for partial bootstrap deployment operation should pass the validation')
    t.ok(complete_result, 'Valid data for complete bootstrap deployment operation should pass the validation')
})

test('validateBootstrapDeployment - ssss', t => {
    partialTypeCommonTests(
        t,
        stateValidationSchema.validateBootstrapDeploymentOperation.bind(stateValidationSchema),
        BDO.valid_complete_bootstrap_deployment,
        'bdo'
    )
})

test('validateBootstrapDeployment - data type validation TOP LEVEL', t => {
    //complete
    topLevelValidationTests(
        t,
        stateValidationSchema.validateBootstrapDeploymentOperation.bind(stateValidationSchema),
        BDO.valid_complete_bootstrap_deployment,
        'bdo',
        not_allowed_data_types,
        BDO.top_fields_bootstrap_deployment
    );

    //partial
    topLevelValidationTests(
        t,
        stateValidationSchema.validateBootstrapDeploymentOperation.bind(stateValidationSchema),
        BDO.valid_partial_bootstrap_deployment,
        'bdo',
        not_allowed_data_types,
        BDO.top_fields_bootstrap_deployment
    );
});


test('validateBootstrapDeployment - value level validation (bdo)', t => {
    //complete
    valueLevelValidationTest(
        t,
        stateValidationSchema.validateBootstrapDeploymentOperation.bind(stateValidationSchema),
        BDO.valid_complete_bootstrap_deployment,
        'bdo',
        BDO.complete_bootstrap_deployment_value_fields,
        not_allowed_data_types
    );
    //partial
    valueLevelValidationTest(
        t,
        stateValidationSchema.validateBootstrapDeploymentOperation.bind(stateValidationSchema),
        BDO.valid_partial_bootstrap_deployment,
        'bdo',
        BDO.partial_bootstrap_deployment_value_fields,
        not_allowed_data_types
    );

});


test('validateBootstrapDeployment - address buffer length validation - TOP LEVEL', t => {
    //complete
    addressBufferLengthTest(
        t,
        stateValidationSchema.validateBootstrapDeploymentOperation.bind(stateValidationSchema),
        BDO.valid_complete_bootstrap_deployment,
    );
    //partial
    addressBufferLengthTest(
        t,
        stateValidationSchema.validateBootstrapDeploymentOperation.bind(stateValidationSchema),
        BDO.valid_partial_bootstrap_deployment,
    );
});

test('validateBootstrapDeployment - Buffer length validation - VALUE LEVEL (bdo)', t => {
    //complete
    fieldsBufferLengthTest(
        t,
        stateValidationSchema.validateBootstrapDeploymentOperation.bind(stateValidationSchema),
        BDO.valid_complete_bootstrap_deployment,
        'bdo',
        BDO.required_length_of_fields_for_complete_bootstrap_deployment
    );

    //partial
    fieldsBufferLengthTest(
        t,
        stateValidationSchema.validateBootstrapDeploymentOperation.bind(stateValidationSchema),
        BDO.valid_partial_bootstrap_deployment,
        'bdo',
        BDO.required_length_of_fields_for_partial_bootstrap_deployment
    );
});
