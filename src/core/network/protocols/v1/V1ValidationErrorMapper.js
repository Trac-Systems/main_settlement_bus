import {
    V1InvalidPayloadError,
    V1ProtocolError,
    V1UnexpectedError,
} from './V1ProtocolError.js';
import {ResultCode} from '../../../../utils/constants.js';

// Temporary logic - delete and refactor validators with Legacy protocol depracation.

const rules = [
    // Generic / schema-level
    {resultCode: ResultCode.INVALID_PAYLOAD, endConnection: false, patterns: [/^Payload or payload type is missing\.$/]},
    {resultCode: ResultCode.SCHEMA_VALIDATION_FAILED, endConnection: false, patterns: [/^Payload is invalid\.$/]},
    {resultCode: ResultCode.OPERATION_TYPE_UNKNOWN, endConnection: false, patterns: [/^Unknown operation type:/]},

    // Requester identity
    {resultCode: ResultCode.REQUESTER_ADDRESS_INVALID, endConnection: false, patterns: [/^Invalid requesting address in payload\.$/]},
    {resultCode: ResultCode.REQUESTER_PUBLIC_KEY_INVALID, endConnection: false, patterns: [/^Invalid requesting public key in payload\.$/]},

    // Transaction hashing/signing
    {resultCode: ResultCode.TX_HASH_MISMATCH, endConnection: false, patterns: [/^Regenerated transaction does not match incoming transaction in payload\.$/]},
    {resultCode: ResultCode.TX_SIGNATURE_INVALID, endConnection: false, patterns: [/^Invalid signature in payload\.$/]},

    // TX lifecycle / replay
    {resultCode: ResultCode.TX_EXPIRED, endConnection: false, patterns: [/^Transaction has expired\.$/]},
    {resultCode: ResultCode.TX_ALREADY_EXISTS, endConnection: false, patterns: [/^Transaction with hash .* already exists in the state\.$/]},
    {resultCode: ResultCode.OPERATION_ALREADY_COMPLETED, endConnection: false, patterns: [/^Transfer operation must not be completed already \\(va, vn, vs must be undefined\\)\\.$/]},

    // Fee & requester state
    {
        resultCode: ResultCode.REQUESTER_NOT_FOUND,
        endConnection: false,
        patterns: [/^Requester address not found in state$/, /^Node entry not found for address /]
    },
    {resultCode: ResultCode.INSUFFICIENT_FEE_BALANCE, endConnection: false, patterns: [/^Insufficient balance to cover transaction fee\\.$/]},

    // Subnet bootstrap / self-validation guard
    {resultCode: ResultCode.EXTERNAL_BOOTSTRAP_EQUALS_MSB_BOOTSTRAP, endConnection: false, patterns: [/^External bootstrap is the same as MSB bootstrap:/]},
    {resultCode: ResultCode.SELF_VALIDATION_FORBIDDEN, endConnection: false, patterns: [/^Requester address cannot be the same as the validator wallet address\\.$/]},

    // Role access
    {resultCode: ResultCode.ROLE_NODE_ENTRY_NOT_FOUND, endConnection: false, patterns: [/^Node with address .* entry does not exist\\.$/]},
    {resultCode: ResultCode.ROLE_NODE_ALREADY_WRITER, endConnection: false, patterns: [/^Node with address .* is already a writer\\.$/]},
    {resultCode: ResultCode.ROLE_NODE_NOT_WHITELISTED, endConnection: false, patterns: [/^Node with address .* is not whitelisted\\.$/]},
    {resultCode: ResultCode.ROLE_NODE_NOT_WRITER, endConnection: false, patterns: [/^Node with address .* is not a writer\\.$/]},
    {resultCode: ResultCode.ROLE_NODE_IS_INDEXER, endConnection: false, patterns: [/^Node with address .* is an indexer\\.$/]},
    {resultCode: ResultCode.ROLE_ADMIN_ENTRY_MISSING, endConnection: false, patterns: [/^Admin entry does not exist\\.$/]},
    {resultCode: ResultCode.ROLE_INVALID_RECOVERY_CASE, endConnection: false, patterns: [/^Node with address .* is not a valid recovery case\\.$/]},
    {resultCode: ResultCode.ROLE_UNKNOWN_OPERATION, endConnection: false, patterns: [/^Unknown role access operation type:/]},
    {resultCode: ResultCode.ROLE_INVALID_WRITER_KEY, endConnection: false, patterns: [/^Invalid writer key: either not owned by requester or different from assigned key$/]},
    {resultCode: ResultCode.ROLE_INSUFFICIENT_FEE_BALANCE, endConnection: false, patterns: [/^Insufficient requester balance to cover role access operation FEE\\.$/]},

    // Transaction operation
    {resultCode: ResultCode.MSB_BOOTSTRAP_MISMATCH, endConnection: false, patterns: [/^Declared MSB bootstrap is different than network bootstrap in transaction operation:/]},
    {resultCode: ResultCode.EXTERNAL_BOOTSTRAP_NOT_DEPLOYED, endConnection: false, patterns: [/^External bootstrap with hash .* is not registered as deployment entry\\.$/]},
    {resultCode: ResultCode.EXTERNAL_BOOTSTRAP_TX_MISSING, endConnection: false, patterns: [/^External bootstrap is not registered as usual tx /]},
    {resultCode: ResultCode.EXTERNAL_BOOTSTRAP_MISMATCH, endConnection: false, patterns: [/^External bootstrap does not match the one in the transaction payload:/]},

    // Bootstrap deployment
    {resultCode: ResultCode.BOOTSTRAP_ALREADY_EXISTS, endConnection: false, patterns: [/^Bootstrap with hash .* already exists in the state\\. Bootstrap must be unique\\.$/]},

    // Transfers
    {resultCode: ResultCode.TRANSFER_RECIPIENT_ADDRESS_INVALID, endConnection: false, patterns: [/^Invalid recipient address in transfer payload\\.$/]},
    {resultCode: ResultCode.TRANSFER_RECIPIENT_PUBLIC_KEY_INVALID, endConnection: false, patterns: [/^Invalid recipient public key in transfer payload\\.$/]},
    {resultCode: ResultCode.TRANSFER_AMOUNT_TOO_LARGE, endConnection: false, patterns: [/^Transfer amount exceeds maximum allowed value$/]},
    {resultCode: ResultCode.TRANSFER_SENDER_NOT_FOUND, endConnection: false, patterns: [/^Sender account not found$/]},
    {resultCode: ResultCode.TRANSFER_INSUFFICIENT_BALANCE, endConnection: false, patterns: [/^Insufficient balance for transfer( fee| \\+ fee)$/]},
    {resultCode: ResultCode.TRANSFER_RECIPIENT_BALANCE_OVERFLOW, endConnection: false, patterns: [/^Transfer would cause recipient balance to exceed maximum allowed value$/]},
];

const unexpectedPatterns = [
    /^Method 'validate\\(\\)' must be implemented\\.$/,
];

export function mapValidationErrorToV1Error(error) {
    if (error && typeof error === 'object' && 'resultCode' in error) {
        return error;
    }

    const message = error?.message ?? 'Unexpected validation error.';

    for (const rule of rules) {
        if (rule.patterns.some(pattern => pattern.test(message))) {
            if (rule.resultCode === ResultCode.INVALID_PAYLOAD) {
                return new V1InvalidPayloadError(message, false);
            }
            return new V1ProtocolError(rule.resultCode, message, rule.endConnection);
        }
    }

    if (unexpectedPatterns.some(pattern => pattern.test(message))) {
        return new V1UnexpectedError(message, true);
    }

    return new V1UnexpectedError(message, true);
}

export default {
    mapValidationErrorToV1Error,
};
