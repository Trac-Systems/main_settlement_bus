import ValidatorLegacyMessageRouter from './legacy/ValidatorLegacyMessageRouter.js';
import ValidatorV1MessageRouter from './v1/ValidatorV1MessageRouter.js';
import ValidatorProtocolSession from './ValidatorProtocolSession.js';
import ValidatorLegacyProtocol from './legacy/ValidatorLegacyProtocol.js';
import ValidatorV1Protocol from './v1/ValidatorV1Protocol.js';

class ValidatorMessages {
    #legacyMessageRouter;
    #v1MessageRouter;
    #config;
    #wallet;
    #pendingRequestsService;

    constructor(
        state,
        wallet,
        rateLimiterService,
        txPoolService,
        pendingRequestsService,
        transactionCommitService,
        config
    ) {
        this.#config = config;
        this.#wallet = wallet;
        this.#pendingRequestsService = pendingRequestsService;
        this.#legacyMessageRouter = new ValidatorLegacyMessageRouter(
            state,
            wallet,
            rateLimiterService,
            txPoolService,
            this.#config
        );

        this.#v1MessageRouter = new ValidatorV1MessageRouter(
            state,
            wallet,
            rateLimiterService,
            txPoolService,
            pendingRequestsService,
            transactionCommitService,
            this.#config
        );
    }

    createProtocolSession(connection) {
        // Attach a Protomux instance to this Hyperswarm connection.
        // Protomux multiplexes multiple logical protocol channels over a single encrypted stream.

        const legacyProtocol = new ValidatorLegacyProtocol(
            this.#legacyMessageRouter,
            connection,
            null,
            this.#config
        );

        const v1Protocol = new ValidatorV1Protocol(
            this.#v1MessageRouter,
            connection,
            this.#pendingRequestsService,
            this.#config
        );

        // ValidatorProtocolSession is attached to the Hyperswarm connection so other parts of the system (e.g. tryConnect)
        // can send messages without knowing how Protomux was initialized.
        return new ValidatorProtocolSession(legacyProtocol, v1Protocol, this.#wallet, this.#config);
    }

    attachChannel(connection) {
        connection.protocolSessions ??= {};
        if (connection.protocolSessions.validator) return;
        connection.protocolSessions.validator = this.createProtocolSession(connection);
    }

    prepareConnection(connection) {
        this.attachChannel(connection);
    }
}

export default ValidatorMessages;
