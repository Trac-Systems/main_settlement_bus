import {test} from 'brittle';

import {mapValidationErrorToV1Error} from '../../../src/core/network/protocols/v1/V1ValidationErrorMapper.js';
import {
    InvalidPayloadError,
    NodeHasNoWriteAccess,
    SignatureInvalidError,
    UnexpectedError,
} from '../../../src/core/network/protocols/v1/V1ProtocolError.js';

test('mapValidationErrorToV1Error keeps v1 protocol errors unchanged', t => {
    const input = new NodeHasNoWriteAccess('no access', true);
    const output = mapValidationErrorToV1Error(input);
    t.is(output, input);
});

test('mapValidationErrorToV1Error maps signature errors', t => {
    const output = mapValidationErrorToV1Error(new Error('Invalid signature in payload.'));
    t.ok(output instanceof SignatureInvalidError);
});

test('mapValidationErrorToV1Error maps shared validator payload errors', t => {
    const output = mapValidationErrorToV1Error(new Error('Requester address not found in state'));
    t.ok(output instanceof InvalidPayloadError);
});

test('mapValidationErrorToV1Error maps explicit unexpected validator errors', t => {
    const output = mapValidationErrorToV1Error(new Error("Method 'validate()' must be implemented."));
    t.ok(output instanceof UnexpectedError);
});

test('mapValidationErrorToV1Error maps unknown errors to unexpected', t => {
    const output = mapValidationErrorToV1Error(new Error('totally-unknown-error'));
    t.ok(output instanceof UnexpectedError);
});
