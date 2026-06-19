import {ConsensusResultCode} from '../../../utils/constants.js';

/**
 * V1 consensus protocol error type.
 *
 * `V1ConsensusProtocolError` is the v1 base class used by handlers/validators to attach:
 * - `resultCode`: a stable `ConsensusResultCode` enum value for programmatic handling
 */
export class V1ConsensusProtocolError extends Error {
    /**
     * @param {number} resultCode Stable rejection reason (a `ConsensusResultCode` enum value).
     * @param {string} message Human-readable error message.
     */
    constructor(resultCode, message) {
        super(message);
        this.name = this.constructor.name;
        this.resultCode = resultCode;
    }
}

/**
 * Returns the consensus result code attached to a protocol error.
 *
 * @param {unknown} err Error-like value to inspect.
 * @returns {number} Attached `ConsensusResultCode`, or `ConsensusResultCode.UNEXPECTED_ERROR`.
 */
export function getResultCode(err) {
    return err instanceof V1ConsensusProtocolError ? err.resultCode : ConsensusResultCode.UNEXPECTED_ERROR;
}
