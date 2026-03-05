import BaseMSBError from './BaseMSBError.js';

/**
 * Protocol-agnostic validator rejection error.
 *
 * Used by shared validators in `src/core/network/protocols/shared/validators/**` so they can
 * reject remote peer input with a stable `resultCode` without throwing v1-specific errors.
 *
 * Default `endConnection = true` because shared-validator rejections are typically triggered
 * by invalid/malicious peer payloads and should terminate the peer connection after responding.
 */
export class SharedValidatorRejectionError extends BaseMSBError {
    /**
     * @param {number} resultCode Stable rejection reason (a `ResultCode` value).
     * @param {string} message Human-readable error message.
     * @param {boolean} [endConnection=true] Whether the transport should end the connection after responding.
     */
    constructor(resultCode, message, endConnection = true) {
        super(resultCode, message, endConnection);
    }
}

export default SharedValidatorRejectionError;
