import { MessageType } from './protobuf/network.cjs';

const isValidatorConnectionRequest = (type) => type === MessageType.VALIDATOR_CONNECTION_REQUEST;
const isValidatorConnectionResponse = (type) => type === MessageType.VALIDATOR_CONNECTION_RESPONSE;
const isValidatorConnection = (type) => (
    isValidatorConnectionRequest(type) || isValidatorConnectionResponse(type)
);

const isLivenessRequest = (type) => type === MessageType.LIVENESS_REQUEST;
const isLivenessResponse = (type) => type === MessageType.LIVENESS_RESPONSE;
const isLiveness = (type) => isLivenessRequest(type) || isLivenessResponse(type);

const isBroadcastTransactionRequest = (type) => type === MessageType.BROADCAST_TRANSACTION_REQUEST;
const isBroadcastTransactionResponse = (type) => type === MessageType.BROADCAST_TRANSACTION_RESPONSE;
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
