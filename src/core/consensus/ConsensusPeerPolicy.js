import { ConsensusResultCode } from '../../utils/constants.js';
import { V1ConsensusProtocolError } from './v1/V1ConsensusProtocolError.js';

// Remote rejections are returned as results, not local validation errors.
export function shouldBanConsensusPeer(error) {
    return error instanceof V1ConsensusProtocolError
        && error.resultCode === ConsensusResultCode.PUBLIC_KEY_MISMATCH;
}

// Expired requests and responses from an older session do not penalize the peer.
export function shouldIgnoreConsensusApproval(pendingEntry, protocolSession) {
    if (!pendingEntry) return true;
    if (!pendingEntry.session) return false;
    return pendingEntry.session !== protocolSession;
}

// Invalid frames, message types, session IDs and unexpected senders close only consensus.
// Proposal payload rejections use signed responses rather than this routing policy.
export function handleInvalidConsensusMessage(protocolSession, logger, reason) {
    logger.error(reason);
    protocolSession.close();
}

// Local failures provide no grounds to close a peer's channel or transport.
export function handleConsensusLocalError(logger, reason) {
    logger.error(reason);
}
