import test from 'brittle';

import { OperationType } from '../../../../src/utils/constants.js';
import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js';
import { HCO, not_allowed_data_types } from '../../../fixtures/check.fixtures.js';
import {
    topLevelValidationTests,
    valueLevelValidationTest,
    addressBufferLengthTest,
    fieldsBufferLengthTest
} from './common.test.js';
import { config } from '../../../helpers/config.js';

import {operationContractTests} from './schemaValidationTestHelpers.js';
import {htlcOperationPipelineTests} from './htlcSchemaTestHelpers.js';

const stateValidationSchema = new StateValidationSchema(config);
const validateHtlcClaimOperation =
    stateValidationSchema.validateHtlcClaimOperation.bind(stateValidationSchema);

test('validateHtlcClaimOperation - happy path', t => {
    t.ok(
        validateHtlcClaimOperation(HCO.valid_htlc_claim_operation),
        'Valid HTLC claim operation should pass validation'
    );
});

test('validateHtlcClaimOperation - top level validation', t => {
    topLevelValidationTests(
        t,
        validateHtlcClaimOperation,
        HCO.valid_htlc_claim_operation,
        'hco',
        not_allowed_data_types,
        HCO.top_fields_htlc_claim
    );
});

test('validateHtlcClaimOperation - value level validation (hco)', t => {
    valueLevelValidationTest(
        t,
        validateHtlcClaimOperation,
        HCO.valid_htlc_claim_operation,
        'hco',
        HCO.htlc_claim_value_fields,
        not_allowed_data_types
    );
});

test('validateHtlcClaimOperation - address buffer length validation', t => {
    addressBufferLengthTest(
        t,
        validateHtlcClaimOperation,
        HCO.valid_htlc_claim_operation
    );
});

test('validateHtlcClaimOperation - field buffer length validation (hco)', t => {
    fieldsBufferLengthTest(
        t,
        validateHtlcClaimOperation,
        HCO.valid_htlc_claim_operation,
        'hco',
        HCO.required_length_of_fields_for_htlc_claim
    );
});

test('validateHtlcClaimOperation - operation contract', t => {
    operationContractTests(
        t,
        validateHtlcClaimOperation,
        HCO.valid_htlc_claim_operation,
        'hco',
        [OperationType.HTLC_CLAIM],
        HCO.required_length_of_fields_for_htlc_claim,
        false, // partial
        [], // zeroAllowed
        [], // optionalFields
        [], // otherRequiredFields
        [], // objectFields
        // A zero preimage can hash to a valid hashlock. The builder accepts it but
        // the schema currently rejects it; do not turn that discrepancy into a
        // rejection requirement until the protocol's intended policy is settled.
        ['pi'] // zeroPolicyUnspecified
    );
});

test('validateHtlcClaimOperation - builder, codec and partial sanitizer', async t => {
    await htlcOperationPipelineTests(
        t,
        validateHtlcClaimOperation,
        HCO.valid_htlc_claim_operation,
        'hco'
    );
});
