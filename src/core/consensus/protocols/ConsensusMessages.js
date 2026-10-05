import Protomux from 'protomux';
import _ from 'lodash';
import ConsensusRouterV1 from "./ConsensusRouter.js";
import ConsensusV1Protocol from "./ConsensusV1Protocol.js";
import ConsensusConnectionPolicy from '../ConsensusConnectionPolicy.js';
import { Logger } from '../../../utils/logger.js';

const PROTOCOL = 'consensus/v1';

class ConsensusMessages {
    #consensusRouter;
    #pendingRequestService;
    #onSessionClosed;
    #connectionPolicy;

    constructor(state, wallet, config, pendingRequestService, onSessionClosed) {
        this.#pendingRequestService = pendingRequestService;
        this.#onSessionClosed = onSessionClosed;
        const logger = new Logger(config);
        this.#connectionPolicy = new ConsensusConnectionPolicy(state, logger, config);
        this.#consensusRouter = new ConsensusRouterV1(
            state, wallet, config, pendingRequestService, this.#connectionPolicy
        );
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
            this.#connectionPolicy
        );
    }

    /**
     * Opens the consensus/v1 channel only for a peer recognized as an indexer.
     * The close callback removes the session reference so a new channel can open.
     */
    async attachChannel(connection) {
        if (connection.destroyed) return;
        if (_.isNil(connection.protocolSessions)) {
            connection.protocolSessions = {};
        }
        if (connection.protocolSessions.indexer) return;
        try {
            if (!await this.#connectionPolicy.shouldAcceptConsensusChannel(connection)) return;
            // The connection may close or another attempt may create the session while awaiting state.
            if (connection.destroyed || connection.protocolSessions.indexer) return;
            const session = this.createProtocolSession(connection);
            if (!session.closed) connection.protocolSessions.indexer = session;
        } catch (error) {
            // A rejected Protomux pairing callback would destroy the shared transport.
            this.#connectionPolicy.handleLocalError(`ConsensusMessages: failed to open Consensus V1 channel: ${error.message}`);
        }
    }

    /**
     * Applies the same admission check to remote opens. Returning without creating
     * a session rejects only this channel attempt. Replication and later retries remain possible.
     */
    prepareConnection(connection) {
        const mux = Protomux.from(connection);
        mux.pair({ protocol: PROTOCOL }, () => this.attachChannel(connection));
    }
}

export default ConsensusMessages;
