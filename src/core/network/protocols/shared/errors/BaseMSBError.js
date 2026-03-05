/**
 * Base MSB error type used across network/protocol codepaths.
 *
 * The optional `endConnection` flag is a transport hint used by the v1 protocol to decide
 * whether the peer connection should be ended after sending a response.
 */
export class BaseMSBError extends Error {
    /**
     * @param {number} resultCode Stable rejection reason (a `ResultCode` value).
     * @param {string} message Human-readable error message.
     * @param {boolean} [endConnection=false] Whether the transport should end the connection after responding.
     */
    constructor(resultCode, message, endConnection = false) {
        super(message);
        this.name = this.constructor.name;

        /**
         * Stable rejection reason (a `ResultCode` value).
         * @type {number}
         */
        this.resultCode = resultCode;

        /**
         * Transport hint for protocol handlers (end the connection after responding).
         * @type {boolean}
         */
        this.endConnection = Boolean(endConnection);
    }
}

export default BaseMSBError;
