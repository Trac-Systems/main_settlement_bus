import {V1ProtocolError} from '../../v1/V1ProtocolError.js';

/**
 * Shared validator rejection error.
 *
 * Used by shared validators in `src/core/network/protocols/shared/validators/**` so they can
 * reject remote peer input with a stable `resultCode`.
 *
 * Note: this currently extends `V1ProtocolError` so the v1 protocol can consistently treat shared
 * validator rejections as typed protocol errors. Legacy protocol codepaths remain compatible because
 * this is still an `Error` and preserves `.message`.
 *
 * Default `endConnection = true` because shared-validator rejections are typically triggered
 * by invalid/malicious peer payloads and should terminate the peer connection after responding.
 */
export class SharedValidatorRejectionError extends V1ProtocolError {
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
