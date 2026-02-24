import {test} from 'brittle';

import {mapValidationErrorToV1Error} from '../../../src/core/network/protocols/v1/V1ValidationErrorMapper.js';
import {
    V1InvalidPayloadError,
    V1NodeHasNoWriteAccess,
    V1SignatureInvalidError,
    V1UnexpectedError,
} from '../../../src/core/network/protocols/v1/V1ProtocolError.js';

test('mapValidationErrorToV1Error keeps v1 protocol errors unchanged', t => {
    const input = new V1NodeHasNoWriteAccess('no access', true);
    const output = mapValidationErrorToV1Error(input);
    t.is(output, input);
});

test('mapValidationErrorToV1Error maps signature errors', t => {
    const output = mapValidationErrorToV1Error(new Error('Invalid signature in payload.'));
    t.ok(output instanceof V1SignatureInvalidError);
});

test('mapValidationErrorToV1Error maps shared validator payload errors', t => {
    const output = mapValidationErrorToV1Error(new Error('Requester address not found in state'));
    t.ok(output instanceof V1InvalidPayloadError);
});

test('mapValidationErrorToV1Error maps explicit unexpected validator errors', t => {
    const output = mapValidationErrorToV1Error(new Error("Method 'validate()' must be implemented."));
    t.ok(output instanceof V1UnexpectedError);
});

test('mapValidationErrorToV1Error maps unknown errors to unexpected', t => {
    const output = mapValidationErrorToV1Error(new Error('totally-unknown-error'));
    t.ok(output instanceof V1UnexpectedError);
});
