import b4a from 'b4a';
import { v7 as uuidv7 } from 'uuid';
import { NetworkOperationType, ResultCode as NetworkResultCode } from '../../src/utils/constants.js';
import { asAddress } from '../helpers/address.js';

const payloadValidatorConnectionRequest = {
    type: NetworkOperationType.VALIDATOR_CONNECTION_REQUEST,
    id: uuidv7(),
    timestamp: 123,
    validator_connection_request: {
        issuer_address: asAddress('36fdaf941de4afe602cbb1e2f56dc582466ef23fad1da55c09fd6dd841cbd117'),
        nonce: b4a.from('00', 'hex'),
        signature: b4a.from('01', 'hex')
    },
    capabilities: ['cap:a', 'cap:b']
};

const payloadValidatorConnectionResponse = {
    type: NetworkOperationType.VALIDATOR_CONNECTION_RESPONSE,
    id: uuidv7(),
    timestamp: 456,
    validator_connection_response: {
        issuer_address: asAddress('36fdaf941de4afe602cbb1e2f56dc582466ef23fad1da55c09fd6dd841cbd117'),
        nonce: b4a.from('02', 'hex'),
        signature: b4a.from('03', 'hex'),
        result: NetworkResultCode.OK
    },
    capabilities: ['cap:a']
};

const payloadLivenessRequest = {
    type: NetworkOperationType.LIVENESS_REQUEST,
    id: uuidv7(),
    timestamp: 789,
    liveness_request: {
        nonce: b4a.from('04', 'hex'),
        signature: b4a.from('05', 'hex')
    },
    capabilities: []
};

const payloadLivenessResponse = {
    type: NetworkOperationType.LIVENESS_RESPONSE,
    id: uuidv7(),
    timestamp: 101112,
    liveness_response: {
        nonce: b4a.from('06', 'hex'),
        signature: b4a.from('07', 'hex'),
        result: NetworkResultCode.OK
    },
    capabilities: []
};

const payloadBroadcastTransactionRequest = {
    type: NetworkOperationType.BROADCAST_TRANSACTION_REQUEST,
    id: uuidv7(),
    timestamp: 131415,
    broadcast_transaction_request: {
        data: b4a.from('deadbeef', 'hex'),
        nonce: b4a.from('08', 'hex'),
        signature: b4a.from('09', 'hex')
    },
    capabilities: ['cap:a']
};

const payloadBroadcastTransactionResponse = {
    type: NetworkOperationType.BROADCAST_TRANSACTION_RESPONSE,
    id: uuidv7(),
    timestamp: 161718,
    broadcast_transaction_response: {
        nonce: b4a.from('0a', 'hex'),
        signature: b4a.from('0b', 'hex'),
        result: NetworkResultCode.OK
    },
    capabilities: ['cap:b']
};

export default {
    payloadValidatorConnectionRequest,
    payloadValidatorConnectionResponse,
    payloadLivenessRequest,
    payloadLivenessResponse,
    payloadBroadcastTransactionRequest,
    payloadBroadcastTransactionResponse,
};
