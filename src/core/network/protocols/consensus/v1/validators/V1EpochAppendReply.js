import V1BaseConsensusOperation from './V1BaseConsensusOperation.js';
import { ConsensusOperationType, ConsensusResultCode } from '../../../../../../utils/constants.js';
import { V1ConsensusProtocolError } from '../V1ConsensusProtocolError.js';
import { fromAppendIntent } from '../../../../../../messages/consensus/v1/epochAppendMessage.js';
import { sameSelectionRequest, sameSelectionContext, EpochAppenderVoteStatus } from '../../../../../consensus/epochAppenderSelection/epochAppenderSelectionState.js';

export default class V1EpochAppendReply extends V1BaseConsensusOperation {
    /**
     * Authenticate REPLY and bind it to the exact outstanding REQUEST and RPC session.
     * @param {object} message Decoded consensus v1 reply.
     * @param {object} connection Authenticated peer connection.
     * @param {object} pendingRequest Original outbound message.
     * @returns {Promise<import('../../../../../consensus/epochAppenderSelection/epochAppenderSelectionState.js').EpochAppendRequest>}
     * @throws {V1ConsensusProtocolError}
     */
    async validate(message, connection, pendingRequest) {
        return this.validateAsProtocolError(async () => {
            const request = await this.validateAppendMessage(message, connection.remotePublicKey, ConsensusOperationType.REPLY);
            const body = message.reply;
            this.#validateCorrelation(message, request, pendingRequest);
            // A rejection may report the last vote from an older epoch/configuration.
            // It advances the local term only; it can never count as permission.
            const vote = fromAppendIntent(body.vote);
            const observedCounter = body.observed_counter.readBigUInt64BE(0);
            const requestedTerm = BigInt(request.logicalCounter);
            const votedTerm = BigInt(vote.logicalCounter);
            if (vote.networkId !== request.networkId || vote.bootstrap !== request.bootstrap ||
                requestedTerm <= 0n || votedTerm <= 0n || observedCounter < requestedTerm || observedCounter < votedTerm ||
                (body.vote_status === EpochAppenderVoteStatus.GRANTED && !sameSelectionRequest(request, vote)) ||
                (body.vote_status === EpochAppenderVoteStatus.BUSY && !sameSelectionContext(request, vote)) ||
                (body.vote_status === EpochAppenderVoteStatus.STALE && votedTerm < requestedTerm)) {
                throw new V1ConsensusProtocolError(ConsensusResultCode.INVALID_PAYLOAD, 'Inconsistent appender vote reply');
            }
            return { ...request, voteStatus: body.vote_status, observedCounter: observedCounter.toString(), vote };
        });
    }

    #validateCorrelation(message, request, pendingRequest) {
        const expectedIntent = pendingRequest?.request?.intent;
        if (!expectedIntent || message.session_id !== pendingRequest.session_id) {
            throw new V1ConsensusProtocolError(ConsensusResultCode.INVALID_PAYLOAD, 'Unrelated append reply session');
        }
        if (!sameSelectionRequest(request, fromAppendIntent(expectedIntent))) {
            throw new V1ConsensusProtocolError(ConsensusResultCode.INVALID_PAYLOAD, 'Unrelated append reply request');
        }
    }
}
