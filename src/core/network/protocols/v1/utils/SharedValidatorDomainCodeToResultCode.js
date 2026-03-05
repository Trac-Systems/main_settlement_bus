import {ResultCode} from '../../../../../utils/constants.js';
import {SharedValidatorErrorCode} from '../../shared/validators/SharedValidatorError.js';

export const sharedValidatorDomainCodeToResultCode = Object.freeze({
    [SharedValidatorErrorCode.PAYLOAD_TYPE_MISSING]: ResultCode.TX_INVALID_PAYLOAD,
    [SharedValidatorErrorCode.PAYLOAD_SCHEMA_INVALID]: ResultCode.SCHEMA_VALIDATION_FAILED,
    [SharedValidatorErrorCode.OPERATION_TYPE_UNKNOWN]: ResultCode.OPERATION_TYPE_UNKNOWN,
    [SharedValidatorErrorCode.REQUESTER_ADDRESS_INVALID]: ResultCode.REQUESTER_ADDRESS_INVALID,
    [SharedValidatorErrorCode.REQUESTER_PUBLIC_KEY_INVALID]: ResultCode.REQUESTER_PUBLIC_KEY_INVALID,
    [SharedValidatorErrorCode.TX_HASH_MISMATCH]: ResultCode.TX_HASH_MISMATCH,
    [SharedValidatorErrorCode.TX_SIGNATURE_INVALID]: ResultCode.TX_SIGNATURE_INVALID,
    [SharedValidatorErrorCode.TX_EXPIRED]: ResultCode.TX_EXPIRED,
    [SharedValidatorErrorCode.TX_ALREADY_EXISTS]: ResultCode.TX_ALREADY_EXISTS,
    [SharedValidatorErrorCode.OPERATION_ALREADY_COMPLETED]: ResultCode.OPERATION_ALREADY_COMPLETED,
    [SharedValidatorErrorCode.REQUESTER_NOT_FOUND]: ResultCode.REQUESTER_NOT_FOUND,
    [SharedValidatorErrorCode.INSUFFICIENT_FEE_BALANCE]: ResultCode.INSUFFICIENT_FEE_BALANCE,
    [SharedValidatorErrorCode.EXTERNAL_BOOTSTRAP_EQUALS_MSB_BOOTSTRAP]:
        ResultCode.EXTERNAL_BOOTSTRAP_EQUALS_MSB_BOOTSTRAP,
    [SharedValidatorErrorCode.SELF_VALIDATION_FORBIDDEN]: ResultCode.SELF_VALIDATION_FORBIDDEN,

    [SharedValidatorErrorCode.ROLE_NODE_ENTRY_NOT_FOUND]: ResultCode.ROLE_NODE_ENTRY_NOT_FOUND,
    [SharedValidatorErrorCode.ROLE_NODE_ALREADY_WRITER]: ResultCode.ROLE_NODE_ALREADY_WRITER,
    [SharedValidatorErrorCode.ROLE_NODE_NOT_WHITELISTED]: ResultCode.ROLE_NODE_NOT_WHITELISTED,
    [SharedValidatorErrorCode.ROLE_NODE_NOT_WRITER]: ResultCode.ROLE_NODE_NOT_WRITER,
    [SharedValidatorErrorCode.ROLE_NODE_IS_INDEXER]: ResultCode.ROLE_NODE_IS_INDEXER,
    [SharedValidatorErrorCode.ROLE_ADMIN_ENTRY_MISSING]: ResultCode.ROLE_ADMIN_ENTRY_MISSING,
    [SharedValidatorErrorCode.ROLE_INVALID_RECOVERY_CASE]: ResultCode.ROLE_INVALID_RECOVERY_CASE,
    [SharedValidatorErrorCode.ROLE_UNKNOWN_OPERATION]: ResultCode.ROLE_UNKNOWN_OPERATION,
    [SharedValidatorErrorCode.ROLE_INVALID_WRITER_KEY]: ResultCode.ROLE_INVALID_WRITER_KEY,
    [SharedValidatorErrorCode.ROLE_INSUFFICIENT_FEE_BALANCE]: ResultCode.ROLE_INSUFFICIENT_FEE_BALANCE,

    [SharedValidatorErrorCode.MSB_BOOTSTRAP_MISMATCH]: ResultCode.MSB_BOOTSTRAP_MISMATCH,
    [SharedValidatorErrorCode.EXTERNAL_BOOTSTRAP_NOT_DEPLOYED]: ResultCode.EXTERNAL_BOOTSTRAP_NOT_DEPLOYED,
    [SharedValidatorErrorCode.EXTERNAL_BOOTSTRAP_TX_MISSING]: ResultCode.EXTERNAL_BOOTSTRAP_TX_MISSING,
    [SharedValidatorErrorCode.EXTERNAL_BOOTSTRAP_MISMATCH]: ResultCode.EXTERNAL_BOOTSTRAP_MISMATCH,

    [SharedValidatorErrorCode.BOOTSTRAP_ALREADY_EXISTS]: ResultCode.BOOTSTRAP_ALREADY_EXISTS,

    [SharedValidatorErrorCode.TRANSFER_RECIPIENT_ADDRESS_INVALID]: ResultCode.TRANSFER_RECIPIENT_ADDRESS_INVALID,
    [SharedValidatorErrorCode.TRANSFER_RECIPIENT_PUBLIC_KEY_INVALID]:
        ResultCode.TRANSFER_RECIPIENT_PUBLIC_KEY_INVALID,
    [SharedValidatorErrorCode.TRANSFER_AMOUNT_TOO_LARGE]: ResultCode.TRANSFER_AMOUNT_TOO_LARGE,
    [SharedValidatorErrorCode.TRANSFER_SENDER_NOT_FOUND]: ResultCode.TRANSFER_SENDER_NOT_FOUND,
    [SharedValidatorErrorCode.TRANSFER_INSUFFICIENT_BALANCE]: ResultCode.TRANSFER_INSUFFICIENT_BALANCE,
    [SharedValidatorErrorCode.TRANSFER_RECIPIENT_BALANCE_OVERFLOW]:
        ResultCode.TRANSFER_RECIPIENT_BALANCE_OVERFLOW,
});
