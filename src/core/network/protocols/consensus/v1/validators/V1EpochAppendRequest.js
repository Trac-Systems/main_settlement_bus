import V1BaseConsensusOperation from './V1BaseConsensusOperation.js';
import { ConsensusOperationType } from '../../../../../../utils/constants.js';

export default class V1EpochAppendRequest extends V1BaseConsensusOperation {
    /**
     * Authenticate REQUEST and resolve its signed arbitration membership.
     * @param {object} message Decoded consensus v1 message.
     * @param {object} connection Authenticated peer connection.
     * @returns {Promise<import('../../../../../consensus/epochAppenderSelection/epochAppenderSelectionState.js').EpochAppendRequest>}
     * @throws {import('../V1ConsensusProtocolError.js').V1ConsensusProtocolError}
     */
    async validate(message, connection) {
        return this.validateAsProtocolError(() =>
            this.validateAppendMessage(message, connection.remotePublicKey, ConsensusOperationType.REQUEST)
        );
    }
}
