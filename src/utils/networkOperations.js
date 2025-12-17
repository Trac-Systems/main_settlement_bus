import { NetworkOperationType } from './constants.js';

const isValidatorConnectionRequest = (type) => type === NetworkOperationType.VALIDATOR_CONNECTION_REQUEST;
const isValidatorConnectionResponse = (type) => type === NetworkOperationType.VALIDATOR_CONNECTION_RESPONSE;
const isValidatorConnection = (type) => (
    isValidatorConnectionRequest(type) || isValidatorConnectionResponse(type)
);

const isLivenessRequest = (type) => type === NetworkOperationType.LIVENESS_REQUEST;
const isLivenessResponse = (type) => type === NetworkOperationType.LIVENESS_RESPONSE;
const isLiveness = (type) => isLivenessRequest(type) || isLivenessResponse(type);

const isBroadcastTransactionRequest = (type) => type === NetworkOperationType.BROADCAST_TRANSACTION_REQUEST;
const isBroadcastTransactionResponse = (type) => type === NetworkOperationType.BROADCAST_TRANSACTION_RESPONSE;
const isBroadcastTransaction = (type) => (
    isBroadcastTransactionRequest(type) || isBroadcastTransactionResponse(type)
);

const messageTypeToPayload = (type) => {
    const fromTo = [
        { condition: isValidatorConnectionRequest, payloadKey: 'validator_connection_request' },
        { condition: isValidatorConnectionResponse, payloadKey: 'validator_connection_response' },
        { condition: isLivenessRequest, payloadKey: 'liveness_request' },
        { condition: isLivenessResponse, payloadKey: 'liveness_response' },
        { condition: isBroadcastTransactionRequest, payloadKey: 'broadcast_transaction_request' },
        { condition: isBroadcastTransactionResponse, payloadKey: 'broadcast_transaction_response' },
    ];

    const match = fromTo.find((entry) => entry.condition(type));
    return match?.payloadKey;
};

export {
    isValidatorConnectionRequest,
    isValidatorConnectionResponse,
    isValidatorConnection,
    isLivenessRequest,
    isLivenessResponse,
    isLiveness,
    isBroadcastTransactionRequest,
    isBroadcastTransactionResponse,
    isBroadcastTransaction,
    messageTypeToPayload
};
