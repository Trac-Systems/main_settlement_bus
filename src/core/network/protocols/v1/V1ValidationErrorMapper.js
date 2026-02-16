import {
    InvalidPayloadError,
    SignatureInvalidError,
    UnexpectedError,
} from './V1ProtocolError.js';

// Temporary logic - delete and refactor validators with Legacy protocol depracation.

const signaturePatterns = [
    /^Invalid signature in payload\.$/,
];
// TODO: CREATE MORE V1 ERRORS AND MAP IT CORRECTLY IN THE MAPPER
const invalidPayloadPatterns = [
    /^Payload or payload type is missing\.$/,
    /^Payload is invalid\.$/,
    /^Unknown operation type:/,
    /^Invalid requesting address in payload\.$/,
    /^Invalid requesting public key in payload\.$/,
    /^Regenerated transaction does not match incoming transaction in payload\.$/,
    /^Transaction has expired\.$/,
    /^Transaction with hash .* already exists in the state\.$/,
    /^Transfer operation must not be completed already \(va, vn, vs must be undefined\)\.$/,
    /^Requester address not found in state$/,
    /^Insufficient balance to cover transaction fee\.$/,
    /^External bootstrap is the same as MSB bootstrap:/,
    /^Requester address cannot be the same as the validator wallet address\.$/,
    /^Node with address .* entry does not exist\.$/,
    /^Node with address .* is already a writer\.$/,
    /^Node with address .* is not whitelisted\.$/,
    /^Node with address .* is not a writer\.$/,
    /^Node with address .* is an indexer\.$/,
    /^Admin entry does not exist\.$/,
    /^Node with address .* is not a valid recovery case\.$/,
    /^Unknown role access operation type:/,
    /^Node entry not found for address /,
    /^Invalid writer key: either not owned by requester or different from assigned key$/,
    /^Insufficient requester balance to cover role access operation FEE\.$/,
    /^Declared MSB bootstrap is different than network bootstrap in transaction operation:/,
    /^External bootstrap with hash .* is not registered as deployment entry\.$/,
    /^External bootstrap does not match the one in the transaction payload:/,
    /^Bootstrap with hash .* already exists in the state\. Bootstrap must be unique\.$/,
    /^Invalid recipient address in transfer payload\.$/,
    /^Invalid recipient public key in transfer payload\.$/,
    /^Transfer amount exceeds maximum allowed value$/,
    /^Sender account not found$/,
    /^Insufficient balance for transfer( fee| \+ fee)$/,
    /^Transfer would cause recipient balance to exceed maximum allowed value$/,
];

const unexpectedPatterns = [
    /^Method 'validate\(\)' must be implemented\.$/,
    /^External bootstrap is not registered as usual tx /,
];

export function mapValidationErrorToV1Error(error) {
    if (error && typeof error === 'object' && 'resultCode' in error) {
        return error;
    }

    const message = error?.message ?? 'Unexpected validation error.';

    if (signaturePatterns.some(pattern => pattern.test(message))) {
        return new SignatureInvalidError(message, false);
    }

    if (invalidPayloadPatterns.some(pattern => pattern.test(message))) {
        return new InvalidPayloadError(message, false);
    }

    if (unexpectedPatterns.some(pattern => pattern.test(message))) {
        return new UnexpectedError(message, true);
    }

    return new UnexpectedError(message, true);
}

export default {
    mapValidationErrorToV1Error,
};
