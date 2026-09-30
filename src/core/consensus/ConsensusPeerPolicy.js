import { ConsensusResultCode } from '../../utils/constants.js';
import { V1ConsensusProtocolError } from './v1/V1ConsensusProtocolError.js';

// Remote rejections are returned as results, not local validation errors.
export function shouldBanConsensusPeer(error) {
    return error instanceof V1ConsensusProtocolError
        && error.resultCode === ConsensusResultCode.PUBLIC_KEY_MISMATCH;
}
