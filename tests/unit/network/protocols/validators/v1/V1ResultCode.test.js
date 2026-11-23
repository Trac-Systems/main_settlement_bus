import {test} from 'brittle';

import networkV1Generated from '../../../../../../src/codecs/network/v1/networkV1.generated.cjs';
import {
    ConsensusResultCode,
    NetworkResultCode
} from '../../../../../../src/utils/constants.js';

const expectedNetworkResultCodeMap = Object.freeze({
    RESULT_CODE_UNSPECIFIED: 0,
    RESULT_CODE_OK: 1,
    RESULT_CODE_INVALID_PAYLOAD: 2,
    RESULT_CODE_RATE_LIMITED: 3,
    RESULT_CODE_SIGNATURE_INVALID: 4,
    RESULT_CODE_UNEXPECTED_ERROR: 5,
    RESULT_CODE_TIMEOUT: 6,
    RESULT_CODE_NODE_HAS_NO_WRITE_ACCESS: 7,
    RESULT_CODE_TX_ACCEPTED_PROOF_UNAVAILABLE: 8,
    RESULT_CODE_NODE_OVERLOADED: 9,
    RESULT_CODE_TX_ALREADY_PENDING: 10,
    RESULT_CODE_OPERATION_TYPE_UNKNOWN: 11,
    RESULT_CODE_SCHEMA_VALIDATION_FAILED: 12,
    RESULT_CODE_REQUESTER_ADDRESS_INVALID: 13,
    RESULT_CODE_REQUESTER_PUBLIC_KEY_INVALID: 14,
    RESULT_CODE_TX_HASH_MISMATCH: 15,
    RESULT_CODE_TX_SIGNATURE_INVALID: 16,
    RESULT_CODE_TX_EXPIRED: 17,
    RESULT_CODE_TX_ALREADY_EXISTS: 18,
    RESULT_CODE_OPERATION_ALREADY_COMPLETED: 19,
    RESULT_CODE_REQUESTER_NOT_FOUND: 20,
    RESULT_CODE_INSUFFICIENT_FEE_BALANCE: 21,
    RESULT_CODE_EXTERNAL_BOOTSTRAP_EQUALS_MSB_BOOTSTRAP: 22,
    RESULT_CODE_SELF_VALIDATION_FORBIDDEN: 23,
    RESULT_CODE_ROLE_NODE_ENTRY_NOT_FOUND: 24,
    RESULT_CODE_ROLE_NODE_ALREADY_WRITER: 25,
    RESULT_CODE_ROLE_NODE_NOT_WHITELISTED: 26,
    RESULT_CODE_ROLE_NODE_NOT_WRITER: 27,
    RESULT_CODE_ROLE_NODE_IS_INDEXER: 28,
    RESULT_CODE_ROLE_ADMIN_ENTRY_MISSING: 29,
    RESULT_CODE_ROLE_INVALID_RECOVERY_CASE: 30,
    RESULT_CODE_ROLE_UNKNOWN_OPERATION: 31,
    RESULT_CODE_ROLE_INVALID_WRITER_KEY: 32,
    RESULT_CODE_ROLE_INSUFFICIENT_FEE_BALANCE: 33,
    RESULT_CODE_MSB_BOOTSTRAP_MISMATCH: 34,
    RESULT_CODE_EXTERNAL_BOOTSTRAP_NOT_DEPLOYED: 35,
    RESULT_CODE_EXTERNAL_BOOTSTRAP_TX_MISSING: 36,
    RESULT_CODE_EXTERNAL_BOOTSTRAP_MISMATCH: 37,
    RESULT_CODE_BOOTSTRAP_ALREADY_EXISTS: 38,
    RESULT_CODE_TRANSFER_RECIPIENT_ADDRESS_INVALID: 39,
    RESULT_CODE_TRANSFER_RECIPIENT_PUBLIC_KEY_INVALID: 40,
    RESULT_CODE_TRANSFER_AMOUNT_TOO_LARGE: 41,
    RESULT_CODE_TRANSFER_SENDER_NOT_FOUND: 42,
    RESULT_CODE_TRANSFER_INSUFFICIENT_BALANCE: 43,
    RESULT_CODE_TRANSFER_RECIPIENT_BALANCE_OVERFLOW: 44,
    RESULT_CODE_TX_HASH_INVALID_FORMAT: 45,
    RESULT_CODE_INTERNAL_ENQUEUE_VALIDATION_FAILED: 46,
    RESULT_CODE_TX_COMMITTED_RECEIPT_MISSING: 47,
    RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_INVALID: 48,
    RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_UNKNOWN: 49,
    RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_UNSUPPORTED: 50,
    RESULT_CODE_VALIDATOR_RESPONSE_SCHEMA_INVALID: 51,
    RESULT_CODE_PENDING_REQUEST_MISSING_TX_DATA: 52,
    RESULT_CODE_PROOF_PAYLOAD_MISMATCH: 53,
    RESULT_CODE_VALIDATOR_WRITER_KEY_NOT_REGISTERED: 54,
    RESULT_CODE_VALIDATOR_ADDRESS_MISMATCH: 55,
    RESULT_CODE_VALIDATOR_NODE_ENTRY_NOT_FOUND: 56,
    RESULT_CODE_VALIDATOR_NODE_NOT_WRITER: 57,
    RESULT_CODE_VALIDATOR_WRITER_KEY_MISMATCH: 58,
    RESULT_CODE_VALIDATOR_TX_OBJECT_INVALID: 59,
    RESULT_CODE_VALIDATOR_VA_MISSING: 60,
    RESULT_CODE_TX_INVALID_PAYLOAD: 61
});

const expectedConsensusResultCodeMap = Object.freeze({
    UNSPECIFIED: 0,
    OK: 1,
    INVALID_PAYLOAD: 2,
    UNEXPECTED_ERROR: 5,
    SCHEMA_VALIDATION_FAILED: 100,
    BAD_PROTOCOL_VERSION: 101,
    WRONG_NETWORK_ID: 102,
    CONSENSUS_CONFIG_MISMATCH: 103,
    VDF_PROOF_INVALID: 104,
    ADDRESS_INVALID: 105,
    PUBLIC_KEY_MISMATCH: 106,
    PROPOSAL_SIGNATURE_INVALID: 107,
    RESPONSE_SIGNATURE_INVALID: 108,
    APPROVAL_SIGNATURE_INVALID: 109,
    OPERATION_TYPE_INVALID: 110,
    RESPONSE_APPROVAL_INVALID: 111,
    EPOCH_INVALID: 112,
    PREVIOUS_EPOCH_RECORD_HASH_INVALID: 113,
    INDEXER_ROLE_INVALID: 114
});

const sharedResultCode = networkV1Generated.common.v1.ResultCode;

test('NetworkResultCode values are unique', t => {
    const values = Object.values(NetworkResultCode);
    t.is(new Set(values).size, values.length);
});

test('NetworkResultCode preserves existing numeric values (append-only)', t => {
    t.alike(NetworkResultCode, expectedNetworkResultCodeMap);
});

test('NetworkResultCode values are backed by the shared protobuf enum', t => {
    for (const [name, value] of Object.entries(NetworkResultCode)) {
        t.is(sharedResultCode[name], value);
    }
});

test('ConsensusResultCode values are unique', t => {
    const values = Object.values(ConsensusResultCode);
    t.is(new Set(values).size, values.length);
});

test('ConsensusResultCode uses the consensus range from the shared protobuf enum', t => {
    t.alike(ConsensusResultCode, expectedConsensusResultCodeMap);
    t.is(
        sharedResultCode.RESULT_CODE_CONSENSUS_BAD_PROTOCOL_VERSION,
        ConsensusResultCode.BAD_PROTOCOL_VERSION
    );
    t.is(
        sharedResultCode.RESULT_CODE_CONSENSUS_INDEXER_ROLE_INVALID,
        ConsensusResultCode.INDEXER_ROLE_INVALID
    );
});

test('protocol-specific result-code subsets share only generic codes', t => {
    const networkValues = new Set(Object.values(NetworkResultCode));
    const sharedValues = Object.entries(ConsensusResultCode)
        .filter(([, value]) => networkValues.has(value))
        .map(([name]) => name);

    t.alike(sharedValues, [
        'UNSPECIFIED',
        'OK',
        'INVALID_PAYLOAD',
        'UNEXPECTED_ERROR'
    ]);
});

test('NetworkResultCode does not expose deprecated alias', t => {
    t.absent(
        Object.prototype.hasOwnProperty.call(NetworkResultCode, 'RESULT_CODE_TX_ACCEPTED_RECEIPT_MISSING'),
        'deprecated alias should not be present'
    );
});
