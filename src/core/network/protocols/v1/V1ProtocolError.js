import {ResultCode} from '../../../../utils/constants.js';

export function getResultCode(err) {
    return err instanceof V1ProtocolError ? err.resultCode : ResultCode.UNEXPECTED_ERROR;
}

/** 
 * V1 protocol error type.
 *
 * `V1ProtocolError` is the v1 base class used by handlers/validators to attach:
 * - `resultCode`: a stable `ResultCode` enum value for programmatic handling
 * - `endConnection`: a transport hint (close peer connection after responding)
 */
export class V1ProtocolError extends Error {
    /**
     * @param {number} resultCode Stable rejection reason (a `ResultCode` enum value).
     * @param {string} message Human-readable error message.
     * @param {boolean} [endConnection=false] Whether the transport should end the connection after responding.
     */
    constructor(resultCode, message, endConnection = false) {
        super(message);
        this.name = this.constructor.name;
        this.resultCode = resultCode;
        this.endConnection = Boolean(endConnection);
    }
}

export class V1InvalidPayloadError extends V1ProtocolError {
    constructor(message = 'Invalid payload', endConnection = false) {
        super(ResultCode.INVALID_PAYLOAD, message, endConnection);
    }
}

export class V1TxInvalidPayloadError extends V1ProtocolError {
    constructor(message = 'Invalid tx payload', endConnection = true) {
        super(ResultCode.TX_INVALID_PAYLOAD, message, endConnection);
    }
}

export class V1SignatureInvalidError extends V1ProtocolError {
    constructor(message = 'Signature invalid', endConnection = true) {
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
    constructor(message = 'Request timed out', endConnection = false) {
        super(ResultCode.TIMEOUT, message, endConnection);
    }
}

export class V1NodeHasNoWriteAccess extends V1ProtocolError {
    constructor(message = 'Node has no write access', endConnection = true) {
        super(ResultCode.NODE_HAS_NO_WRITE_ACCESS, message, endConnection);
    }
}

export class V1TxAcceptedProofUnavailable extends V1ProtocolError {
    constructor(message = 'Transaction accepted but proof is unavailable',  timestamp = 0,endConnection = false) {
        super(ResultCode.TX_ACCEPTED_PROOF_UNAVAILABLE, message, endConnection);
        this.timestamp = Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : 0;
    }
}

export class V1NodeOverloadedError extends V1ProtocolError {
    constructor(message = 'Commit queue is full', endConnection = true) {
        super(ResultCode.NODE_OVERLOADED, message, endConnection);
    }
}

export class V1TxAlreadyPendingError extends V1ProtocolError {
    constructor(message = 'Transaction is already pending', endConnection = false) {
        super(ResultCode.TX_ALREADY_PENDING, message, endConnection);
    }
}
