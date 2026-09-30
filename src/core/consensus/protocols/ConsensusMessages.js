import Protomux from 'protomux';
import ConsensusRouterV1 from "./ConsensusRouter.js";
import ConsensusV1Protocol from "./ConsensusV1Protocol.js";
import { Logger } from '../../../utils/logger.js';

const PROTOCOL = 'consensus/v1';

class ConsensusMessages {
    #consensusRouter;
    #pendingRequestService;
    #onSessionClosed;
    #logger;

    constructor(state, wallet, config, pendingRequestService, onSessionClosed) {
        this.#pendingRequestService = pendingRequestService;
        this.#onSessionClosed = onSessionClosed;
        this.#logger = new Logger(config);
        this.#consensusRouter = new ConsensusRouterV1(state, wallet, config, pendingRequestService);
    }

    createProtocolSession(connection) {
        return new ConsensusV1Protocol(
            this.#consensusRouter,
            connection,
            this.#pendingRequestService,
            session => {
                if (connection.protocolSessions?.indexer !== session) return;
                delete connection.protocolSessions.indexer;
                this.#onSessionClosed(connection);
            },
            this.#logger
        );
    }

    /**
     * Opens the consensus/v1 channel on this connection unless one is already open.
     * The close callback removes the session reference so a new channel can open.
     */
    attachChannel(connection) {
        connection.protocolSessions ??= {};
        if (connection.protocolSessions.indexer) return;
        const session = this.createProtocolSession(connection);
        if (!session.closed) connection.protocolSessions.indexer = session;
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
