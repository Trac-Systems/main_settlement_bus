import {test} from 'brittle';

import {mapValidationErrorToV1Error} from '../../../src/core/network/protocols/v1/V1ValidationErrorMapper.js';
import {
    V1InvalidPayloadError,
    V1NodeHasNoWriteAccess,
    V1UnexpectedError,
} from '../../../src/core/network/protocols/v1/V1ProtocolError.js';
import {ResultCode} from '../../../src/utils/constants.js';

test('mapValidationErrorToV1Error keeps v1 protocol errors unchanged', t => {
    const input = new V1NodeHasNoWriteAccess('no access', true);
    const output = mapValidationErrorToV1Error(input);
    t.is(output, input);
});

test('mapValidationErrorToV1Error maps tx signature errors to TX_SIGNATURE_INVALID', t => {
    const output = mapValidationErrorToV1Error(new Error('Invalid signature in payload.'));
    t.is(output.resultCode, ResultCode.TX_SIGNATURE_INVALID);
    t.is(output.endConnection, false);
});

test('mapValidationErrorToV1Error maps requester-not-found errors to REQUESTER_NOT_FOUND', t => {
    const output = mapValidationErrorToV1Error(new Error('Requester address not found in state'));
    t.is(output.resultCode, ResultCode.REQUESTER_NOT_FOUND);
    t.is(output.endConnection, false);
});

test('mapValidationErrorToV1Error maps schema invalid errors to SCHEMA_VALIDATION_FAILED', t => {
    const output = mapValidationErrorToV1Error(new Error('Payload is invalid.'));
    t.is(output.resultCode, ResultCode.SCHEMA_VALIDATION_FAILED);
    t.is(output.endConnection, false);
});

test('mapValidationErrorToV1Error maps missing payload/type to INVALID_PAYLOAD (V1InvalidPayloadError)', t => {
    const output = mapValidationErrorToV1Error(new Error('Payload or payload type is missing.'));
    t.ok(output instanceof V1InvalidPayloadError);
    t.is(output.resultCode, ResultCode.INVALID_PAYLOAD);
    t.is(output.endConnection, false);
});

test('mapValidationErrorToV1Error maps explicit unexpected validator errors', t => {
    const output = mapValidationErrorToV1Error(new Error("Method 'validate()' must be implemented."));
    t.ok(output instanceof V1UnexpectedError);
});

test('mapValidationErrorToV1Error maps unknown errors to unexpected', t => {
    const output = mapValidationErrorToV1Error(new Error('totally-unknown-error'));
    t.ok(output instanceof V1UnexpectedError);
});
