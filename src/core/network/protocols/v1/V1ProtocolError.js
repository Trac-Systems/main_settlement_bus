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

export class V1UnexpectedError extends V1ProtocolError {
    constructor(message = 'Unexpected error', endConnection = true) {
        super(ResultCode.UNEXPECTED_ERROR, message, endConnection);
    }
}
