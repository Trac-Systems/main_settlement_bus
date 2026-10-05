import { ConsensusResultCode, CustomEventType } from '../../utils/constants.js';
import { publicKeyToAddress } from '../../utils/helpers.js';
import { V1ConsensusProtocolError } from './v1/V1ConsensusProtocolError.js';

class ConsensusConnectionPolicy {
    #state;
    #logger;
    #config;

    constructor(state, logger, config) {
        this.#state = state;
        this.#logger = logger;
        this.#config = config;
    }

    async shouldAcceptConsensusChannel(connection) {
        try {
            const address = publicKeyToAddress(connection.remotePublicKey, this.#config);
            // Waiting for replication inside Protomux pairing can block the shared stream.
            return await this.#state.isIndexerAddress(address, { wait: false, update: false });
        } catch (error) {
            this.handleLocalError(`ConsensusConnectionPolicy: failed to check indexer membership: ${error.message}`);
            return false;
        }
    }

    // Remote rejections are returned as results, not local validation errors.
    // Returns true when a ban was requested, so the handler skips the response.
    requestPeerBan(connection, error) {
        if (!(error instanceof V1ConsensusProtocolError)) return false;
        if (error.resultCode !== ConsensusResultCode.PUBLIC_KEY_MISMATCH) return false;

        this.#state.emit(CustomEventType.CONSENSUS_PEER_BAN_REQUESTED, { connection, error });
        return true;
    }

    // Expired requests and responses from an older session do not penalize the peer.
    shouldIgnoreApproval(pendingEntry, protocolSession) {
        if (!pendingEntry) return true;
        if (!pendingEntry.session) return false;
        return pendingEntry.session !== protocolSession;
    }

    // Invalid frames, message types, session IDs and unexpected senders close only consensus.
    // Proposal payload rejections use signed responses rather than this routing policy.
    handleInvalidMessage(protocolSession, reason) {
        this.#logger.error(reason);
        protocolSession.close();
    }

    // Local failures provide no grounds to close a peer's channel or transport.
    handleLocalError(reason) {
        this.#logger.error(reason);
    }
}

export default ConsensusConnectionPolicy;
