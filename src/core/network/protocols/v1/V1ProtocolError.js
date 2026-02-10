import { ResultCode } from '../../../../utils/constants.js';

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

export class InvalidPayloadError extends V1ProtocolError {
    constructor(message = 'Invalid payload', endConnection = false) {
        super(ResultCode.INVALID_PAYLOAD, message, endConnection);
    }
}

export class SignatureInvalidError extends V1ProtocolError {
    constructor(message = 'Signature invalid', endConnection = false) {
        super(ResultCode.SIGNATURE_INVALID, message, endConnection);
    }
}

export class RateLimitedError extends V1ProtocolError {
    constructor(message = 'Rate limited', endConnection = true) {
        super(ResultCode.RATE_LIMITED, message, endConnection);
    }
}

export class UnexpectedError extends V1ProtocolError {
    constructor(message = 'Unexpected error', endConnection = true) {
        super(ResultCode.UNEXPECTED_ERROR, message, endConnection);
    }
}

export class TimeoutError extends V1ProtocolError {
    constructor(message = 'Request timed out', endConnection = true) {
        super(ResultCode.TIMEOUT, message, endConnection);
    }
}

export class NodeHasNoWriteAccess extends V1ProtocolError {
    constructor(message = 'Node has no write access', endConnection = true) {
        super(ResultCode.NODE_HAS_NO_WRITE_ACCESS, message, endConnection);
    }
}
