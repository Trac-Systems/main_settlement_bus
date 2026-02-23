import {ResultCode} from '../../../../utils/constants.js';

export function getResultCode(err) {
    return (err && typeof err === 'object' && 'resultCode' in err) ? err.resultCode : ResultCode.UNEXPECTED_ERROR;
}

export function shouldEndConnection(err) {
    return Boolean(err && typeof err === 'object' && err.endConnection);
}

export class V1ProtocolError extends Error {
    constructor(resultCode, message, endConnection) {
        super(message);
        this.name = this.constructor.name;
        this.resultCode = resultCode;
        this.endConnection = endConnection;
    }
}

export class V1InvalidPayloadError extends V1ProtocolError {
    constructor(message = 'Invalid payload', endConnection = false) {
        super(ResultCode.INVALID_PAYLOAD, message, endConnection);
    }
}

export class V1SignatureInvalidError extends V1ProtocolError {
    constructor(message = 'Signature invalid', endConnection = false) {
        super(ResultCode.SIGNATURE_INVALID, message, endConnection);
    }
}

export class V1RateLimitedError extends V1ProtocolError {
    constructor(message = 'Rate limited', endConnection = true) {
        super(ResultCode.RATE_LIMITED, message, endConnection);
    }
}

export class V1UnexpectedError extends V1ProtocolError {
    constructor(message = 'Unexpected error', endConnection = true) {
        super(ResultCode.UNEXPECTED_ERROR, message, endConnection);
    }
}

export class V1TimeoutError extends V1ProtocolError {
    constructor(message = 'Request timed out', endConnection = true) {
        super(ResultCode.TIMEOUT, message, endConnection);
    }
}

export class V1NodeHasNoWriteAccess extends V1ProtocolError {
    constructor(message = 'Node has no write access', endConnection = true) {
        super(ResultCode.NODE_HAS_NO_WRITE_ACCESS, message, endConnection);
    }
}

export class V1TxAcceptedProofUnavailable extends V1ProtocolError {
    constructor(message = 'Transaction accepted but proof is unavailable', endConnection = true, appendedAt = 0) {
        super(ResultCode.TX_ACCEPTED_PROOF_UNAVAILABLE, message, endConnection);
        this.appendedAt = Number.isSafeInteger(appendedAt) && appendedAt > 0 ? appendedAt : 0;
    }
}

export class V1NodeOverloadedError extends V1ProtocolError {
    constructor(message = 'Commit queue is full', endConnection = true) {
        super(ResultCode.NODE_OVERLOADED, message, endConnection);
    }
}

export class V1TxAlreadyPendingError extends V1ProtocolError {
    constructor(message = 'Transaction is already pending', endConnection = true) {
        super(ResultCode.TX_ALREADY_PENDING, message, endConnection);
    }
}
