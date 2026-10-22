import V1EpochAppendRequest from '../validators/V1EpochAppendRequest.js';
import V1EpochAppendReply from '../validators/V1EpochAppendReply.js';
import { consensusMessageFactory } from '../../../../../../messages/consensus/v1/consensusMessageFactory.js';
import { sameSelectionContext } from '../../../../../consensus/epochAppenderSelection/epochAppenderSelectionState.js';

export default class V1EpochAppendOperationHandler {
    #state;
    #wallet;
    #config;
    #selector;
    #requestValidator;
    #replyValidator;

    constructor(state, wallet, config, selector) {
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
        this.#selector = selector;
        this.#requestValidator = new V1EpochAppendRequest(config, state);
        this.#replyValidator = new V1EpochAppendReply(config, state);
    }

    /** Validate REQUEST before arbitration; the selector may defer its reply. */
    async handleRequest(message, connection, session) {
        if (!this.#selector || session.closed) {
            return;
        }
        const request = await this.#requestValidator.validate(message, connection);
        if (session.closed) {
            return;
        }
        await this.#selector.refreshAppendOutcome();
        if (!await this.#canReply(request, session)) {
            return;
        }
        await this.#selector.handleSelectionRequest(request, response => {
            return this.#sendReply(message.session_id, response, session);
        });
    }

    async #canReply(request, session) {
        if (session.closed) {
            return false;
        }
        const context = await this.#state.getEpochAppenderSelectionContext();
        return !session.closed && sameSelectionContext(request, context);
    }

    async #sendReply(sessionId, request, session) {
        if (session.closed) {
            return;
        }
        const reply = await consensusMessageFactory(this.#wallet, this.#config).buildReply(sessionId, request);
        // Deferred replies can outlive both their epoch and their Protomux session.
        if (await this.#canReply(request, session)) {
            session.sendAndForget(reply);
        }
    }

    /** @returns {Promise<object|null>} Validated request identity, or null after context/session expiry. */
    async handleReply(message, connection, session, pendingRequest) {
        const request = await this.#replyValidator.validate(message, connection, pendingRequest);
        if (!await this.#canReply(request, session)) {
            return null;
        }
        return request;
    }
}
