import Protomux from 'protomux';
import ConsensusRouterV1 from "./ConsensusRouter.js";
import ConsensusV1Protocol from "./ConsensusV1Protocol.js";

const PROTOCOL = 'consensus/v1';

class ConsensusMessages {
    #consensusRouter;
    #pendingRequestService;

    constructor(state, wallet, config, pendingRequestService) {
        this.#pendingRequestService = pendingRequestService;
        this.#consensusRouter = new ConsensusRouterV1(state, wallet, config, pendingRequestService);
    }

    createProtocolSession(connection) {
        return new ConsensusV1Protocol(
            this.#consensusRouter,
            connection,
            this.#pendingRequestService
        );
    }

    /**
     * Opens the consensus/v1 channel on this connection unless one is already open.
     * `mux.opened()` reflects Protomux's own channel bookkeeping, so it stays correct
     * even though `connection.protocolSession` is shared with the validator protocol.
     */
    attachChannel(connection) {
        connection.protocolSessions ??= {};
        if (connection.protocolSessions.indexer) return;
        connection.protocolSessions.indexer = this.createProtocolSession(connection);
    }

    /**
     * Reacts if the remote opens a consensus/v1 channel before we've qualified this peer
     * as an indexer ourselves - otherwise whichever side gets there first wins the Protomux
     * pairing race and the other side's channel gets silently rejected.
     * See: node_modules/hypercore/lib/replicator.js (attachTo) for the same pattern.
     */
    prepareConnection(connection) {
        const mux = Protomux.from(connection);
        mux.pair({ protocol: PROTOCOL }, () => this.attachChannel(connection));
    }
}

export default ConsensusMessages;
