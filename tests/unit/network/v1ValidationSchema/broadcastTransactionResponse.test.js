import test from 'brittle';
import b4a from 'b4a';

import V1ValidationSchema from '../../../../src/core/network/protocols/v1/validators/V1ValidationSchema.js';
import {
    NetworkOperationType,
    NONCE_BYTE_LENGTH,
    ResultCode,
    SIGNATURE_BYTE_LENGTH,
} from '../../../../src/utils/constants.js';
import {not_allowed_data_types} from '../../../fixtures/check.fixtures.js';

import {
    assertNoThrowAndAbsent,
    fieldsBufferLengthTest,
    fieldsNonZeroBufferTest,
    headerFieldValueValidationTests,
    topLevelValidationTests,
    valueLevelValidationTests,
} from './common.test.js';

const v = new V1ValidationSchema();

const validFixture = {
    type: NetworkOperationType.BROADCAST_TRANSACTION_RESPONSE,
    id: 'test-id',
    timestamp: Date.now(),
    broadcast_transaction_response: {
        nonce: b4a.alloc(NONCE_BYTE_LENGTH, 1),
        signature: b4a.alloc(SIGNATURE_BYTE_LENGTH, 2),
        proof: b4a.from('deadbeef', 'hex'),
        appendedAt: Date.now(),
        result: ResultCode.OK,
    },
    capabilities: ['cap:a'],
};

const topFields = ['type', 'id', 'timestamp', 'broadcast_transaction_response', 'capabilities'];
const valueFields = ['nonce', 'signature', 'result'];
const requiredLengths = {
    nonce: NONCE_BYTE_LENGTH,
    signature: SIGNATURE_BYTE_LENGTH,
};

test('V1ValidationSchema.validateV1BroadcastTransactionResponse - happy path', t => {
    t.ok(v.validateV1BroadcastTransactionResponse(validFixture), 'valid BROADCAST_TRANSACTION_RESPONSE should pass');
});

test('V1ValidationSchema.validateV1BroadcastTransactionResponse - payload/type mismatch (request payload + response type)', t => {
    const op = structuredClone(validFixture);
    delete op.broadcast_transaction_response;
    op.broadcast_transaction_request = {
        data: b4a.alloc(16, 1),
        nonce: b4a.alloc(NONCE_BYTE_LENGTH, 2),
        signature: b4a.alloc(SIGNATURE_BYTE_LENGTH, 3),
    };

    assertNoThrowAndAbsent(
        t,
        v.validateV1BroadcastTransactionResponse.bind(v),
        op,
        'broadcast_transaction_request payload with type=BROADCAST_TRANSACTION_RESPONSE'
    );
});

test('V1ValidationSchema.validateV1BroadcastTransactionResponse - top level validation', t => {
    topLevelValidationTests(
        t,
        v.validateV1BroadcastTransactionResponse.bind(v),
        validFixture,
        'broadcast_transaction_response',
        not_allowed_data_types,
        topFields,
        NetworkOperationType.BROADCAST_TRANSACTION_RESPONSE
    );
});

test('V1ValidationSchema.validateV1BroadcastTransactionResponse - header field values', t => {
    headerFieldValueValidationTests(t, v.validateV1BroadcastTransactionResponse.bind(v), validFixture);
});

test('V1ValidationSchema.validateV1BroadcastTransactionResponse - payload validation', t => {
    valueLevelValidationTests(
        t,
        v.validateV1BroadcastTransactionResponse.bind(v),
        validFixture,
        'broadcast_transaction_response',
        valueFields,
        not_allowed_data_types,
        {
            skipInvalidType: (field, invalidType) => field === 'result' && typeof invalidType === 'number',
        }
    );
});

test('V1ValidationSchema.validateV1BroadcastTransactionResponse - result value validation', t => {
    const negative = structuredClone(validFixture);
    negative.broadcast_transaction_response.result = -1;
    t.absent(v.validateV1BroadcastTransactionResponse(negative), 'negative result should fail');

    const nonInteger = structuredClone(validFixture);
    nonInteger.broadcast_transaction_response.result = 1.1;
    t.absent(v.validateV1BroadcastTransactionResponse(nonInteger), 'non-integer result should fail');

    const nan = structuredClone(validFixture);
    nan.broadcast_transaction_response.result = NaN;
    t.absent(v.validateV1BroadcastTransactionResponse(nan), 'result NaN should fail');

    const infinity = structuredClone(validFixture);
    infinity.broadcast_transaction_response.result = Infinity;
    t.absent(v.validateV1BroadcastTransactionResponse(infinity), 'result Infinity should fail');

    const unknownCode = structuredClone(validFixture);
    unknownCode.broadcast_transaction_response.result = Math.max(...Object.values(ResultCode)) + 1;
    t.absent(v.validateV1BroadcastTransactionResponse(unknownCode), 'unknown result code should fail');
});

test('V1ValidationSchema.validateV1BroadcastTransactionResponse - buffer lengths', t => {
    fieldsBufferLengthTest(
        t,
        v.validateV1BroadcastTransactionResponse.bind(v),
        validFixture,
        'broadcast_transaction_response',
        requiredLengths
    );
});

test('V1ValidationSchema.validateV1BroadcastTransactionResponse - non-zero buffers', t => {
    fieldsNonZeroBufferTest(
        t,
        v.validateV1BroadcastTransactionResponse.bind(v),
        validFixture,
        'broadcast_transaction_response',
        ['nonce', 'signature']
    );
});
