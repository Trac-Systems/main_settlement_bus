# Network V1 Result Code Policies

This table shows, for each Network V1 `NetworkResultCode`, the boolean policy flags that determine whether the sender rotates the validator and whether the validator closes the connection after sending the response.

Network and consensus result codes are registered in the shared protobuf enum `common.v1.ResultCode`; this document intentionally covers only the Network V1 subset used by network connection policies.

`true` in `Sender` means the sender rotates the validator for that result code. `true` in `Validator` means the validator closes the connection after sending the response. `false` means the corresponding action is not executed for that result code. These columns should be interpreted as boolean flags that control execution for each code, not as descriptive status fields.

| Sender | Validator | ResultCode | Value |
| --- | --- | --- | --- |
| true | true | RESULT_CODE_UNSPECIFIED | 0 |
| false | false | RESULT_CODE_OK | 1 |
| true | true | RESULT_CODE_INVALID_PAYLOAD | 2 |
| true | true | RESULT_CODE_RATE_LIMITED | 3 |
| true | true | RESULT_CODE_SIGNATURE_INVALID | 4 |
| true | true | RESULT_CODE_UNEXPECTED_ERROR | 5 |
| true | false | RESULT_CODE_TIMEOUT | 6 |
| true | true | RESULT_CODE_NODE_HAS_NO_WRITE_ACCESS | 7 |
| true | false | RESULT_CODE_TX_ACCEPTED_PROOF_UNAVAILABLE | 8 |
| true | true | RESULT_CODE_NODE_OVERLOADED | 9 |
| false | false | RESULT_CODE_TX_ALREADY_PENDING | 10 |
| true | true | RESULT_CODE_OPERATION_TYPE_UNKNOWN | 11 |
| true | true | RESULT_CODE_SCHEMA_VALIDATION_FAILED | 12 |
| true | true | RESULT_CODE_REQUESTER_ADDRESS_INVALID | 13 |
| true | true | RESULT_CODE_REQUESTER_PUBLIC_KEY_INVALID | 14 |
| true | true | RESULT_CODE_TX_HASH_MISMATCH | 15 |
| true | true | RESULT_CODE_TX_SIGNATURE_INVALID | 16 |
| true | true | RESULT_CODE_TX_EXPIRED | 17 |
| true | true | RESULT_CODE_TX_ALREADY_EXISTS | 18 |
| true | true | RESULT_CODE_OPERATION_ALREADY_COMPLETED | 19 |
| true | true | RESULT_CODE_REQUESTER_NOT_FOUND | 20 |
| true | true | RESULT_CODE_INSUFFICIENT_FEE_BALANCE | 21 |
| true | true | RESULT_CODE_EXTERNAL_BOOTSTRAP_EQUALS_MSB_BOOTSTRAP | 22 |
| true | true | RESULT_CODE_SELF_VALIDATION_FORBIDDEN | 23 |
| true | true | RESULT_CODE_ROLE_NODE_ENTRY_NOT_FOUND | 24 |
| true | true | RESULT_CODE_ROLE_NODE_ALREADY_WRITER | 25 |
| true | true | RESULT_CODE_ROLE_NODE_NOT_WHITELISTED | 26 |
| true | true | RESULT_CODE_ROLE_NODE_NOT_WRITER | 27 |
| true | true | RESULT_CODE_ROLE_NODE_IS_INDEXER | 28 |
| true | true | RESULT_CODE_ROLE_ADMIN_ENTRY_MISSING | 29 |
| true | true | RESULT_CODE_ROLE_INVALID_RECOVERY_CASE | 30 |
| true | true | RESULT_CODE_ROLE_UNKNOWN_OPERATION | 31 |
| true | true | RESULT_CODE_ROLE_INVALID_WRITER_KEY | 32 |
| true | true | RESULT_CODE_ROLE_INSUFFICIENT_FEE_BALANCE | 33 |
| true | true | RESULT_CODE_MSB_BOOTSTRAP_MISMATCH | 34 |
| true | true | RESULT_CODE_EXTERNAL_BOOTSTRAP_NOT_DEPLOYED | 35 |
| true | true | RESULT_CODE_EXTERNAL_BOOTSTRAP_TX_MISSING | 36 |
| true | true | RESULT_CODE_EXTERNAL_BOOTSTRAP_MISMATCH | 37 |
| true | true | RESULT_CODE_BOOTSTRAP_ALREADY_EXISTS | 38 |
| true | true | RESULT_CODE_TRANSFER_RECIPIENT_ADDRESS_INVALID | 39 |
| true | true | RESULT_CODE_TRANSFER_RECIPIENT_PUBLIC_KEY_INVALID | 40 |
| true | true | RESULT_CODE_TRANSFER_AMOUNT_TOO_LARGE | 41 |
| true | true | RESULT_CODE_TRANSFER_SENDER_NOT_FOUND | 42 |
| true | true | RESULT_CODE_TRANSFER_INSUFFICIENT_BALANCE | 43 |
| true | true | RESULT_CODE_TRANSFER_RECIPIENT_BALANCE_OVERFLOW | 44 |
| true | false | RESULT_CODE_TX_HASH_INVALID_FORMAT | 45 |
| true | false | RESULT_CODE_INTERNAL_ENQUEUE_VALIDATION_FAILED | 46 |
| true | false | RESULT_CODE_TX_COMMITTED_RECEIPT_MISSING | 47 |
| true | false | RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_INVALID | 48 |
| true | false | RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_UNKNOWN | 49 |
| true | false | RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_UNSUPPORTED | 50 |
| true | false | RESULT_CODE_VALIDATOR_RESPONSE_SCHEMA_INVALID | 51 |
| true | false | RESULT_CODE_PENDING_REQUEST_MISSING_TX_DATA | 52 |
| true | false | RESULT_CODE_PROOF_PAYLOAD_MISMATCH | 53 |
| true | false | RESULT_CODE_VALIDATOR_WRITER_KEY_NOT_REGISTERED | 54 |
| true | false | RESULT_CODE_VALIDATOR_ADDRESS_MISMATCH | 55 |
| true | false | RESULT_CODE_VALIDATOR_NODE_ENTRY_NOT_FOUND | 56 |
| true | false | RESULT_CODE_VALIDATOR_NODE_NOT_WRITER | 57 |
| true | false | RESULT_CODE_VALIDATOR_WRITER_KEY_MISMATCH | 58 |
| true | false | RESULT_CODE_VALIDATOR_TX_OBJECT_INVALID | 59 |
| true | false | RESULT_CODE_VALIDATOR_VA_MISSING | 60 |
| true | true | RESULT_CODE_TX_INVALID_PAYLOAD | 61 |
