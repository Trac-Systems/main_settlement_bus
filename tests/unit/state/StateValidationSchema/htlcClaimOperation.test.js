import test from 'brittle';
import b4a from 'b4a';

import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js';
import { HCO, not_allowed_data_types } from '../../../fixtures/check.fixtures.js';
import {
    topLevelValidationTests,
    valueLevelValidationTest,
    addressBufferLengthTest,
    fieldsBufferLengthTest
} from './common.test.js';
import { config } from '../../../helpers/config.js';

const stateValidationSchema = new StateValidationSchema(config);
const validateHtlcClaimOperation =
    stateValidationSchema.validateHtlcClaimOperation.bind(stateValidationSchema);

test('validateHtlcClaimOperation - happy path', t => {
    t.ok(
        validateHtlcClaimOperation(HCO.valid_htlc_claim_operation),
        'Valid HTLC claim operation should pass validation'
    );
});

test('validateHtlcClaimOperation accepts partial and complete claims but not partial validator metadata', t => {
    const partial = HCO.valid_htlc_claim_operation;
    t.ok(validateHtlcClaimOperation(partial));

    const complete = {
        ...partial,
        hco: {
            ...partial.hco,
            va: partial.address,
            vn: partial.hco.in,
            vs: partial.hco.is
        }
    };
    t.ok(validateHtlcClaimOperation(complete));

    for (const field of ['va', 'vn', 'vs']) {
        const incomplete = {...complete, hco: {...complete.hco}};
        delete incomplete.hco[field];
        t.absent(validateHtlcClaimOperation(incomplete), `${field} is required when validator metadata is present`);
    }
    const invalidLength = {...complete, hco: {...complete.hco, vn: b4a.alloc(1)}};
    t.absent(validateHtlcClaimOperation(invalidLength));
    const nullMetadata = {...partial, hco: {...partial.hco, va: null, vn: null, vs: null}};
    t.absent(validateHtlcClaimOperation(nullMetadata));
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
