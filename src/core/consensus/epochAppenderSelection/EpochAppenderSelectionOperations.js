import { generateUUID } from '../../../utils/helpers.js';
import { consensusMessageFactory } from '../../../messages/consensus/v1/consensusMessageFactory.js';
import { EpochAppenderSelectionError, EpochAppenderSelectionErrorCode } from './EpochAppenderSelectionError.js';
import { loadSelectionState, saveSelectionState } from './epochAppenderSelectionStorage.js';

/** Storage and network operations used by the epoch appender selector. */
export class EpochAppenderSelectionOperations {
    #state;
    #wallet;
    #config;
    #getManager;
    #logger;
    #pendingRequests;

    /** The manager is resolved lazily because Network opens the selector first. */
    constructor(state, wallet, config, getManager, logger, pendingRequests) {
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
        this.#getManager = getManager;
        this.#logger = logger;
        this.#pendingRequests = pendingRequests;
    }

    /** Read the local selection state. */
    load() {
        return loadSelectionState(this.#state.base);
    }

    /** Persist the selection state before granting a vote or authorizing an append. */
    save(selectionState) {
        return saveSelectionState(this.#state.base, selectionState);
    }

    /** Read the epoch and voters from the same signed checkpoint. */
    readContext() {
        return this.#state.getEpochAppenderSelectionContext();
    }

    /** Resolve the publication from the signed ledger state. */
    readOutcome(publication) {
        return this.#state.getEpochAppendOutcome(publication);
    }

    /** Connect to the current indexers through the existing connection manager. */
    connect() {
        return this.#getManager().connect();
    }

    /** Sign a request and cancel its RPC when the election stops waiting. */
    async sendRequest(peer, request, lifetime) {
        const message = await consensusMessageFactory(this.#wallet, this.#config).buildRequest(generateUUID(), request);
        if (!lifetime.isActive()) {
            return null;
        }
        lifetime.onPending(() => {
            const error = new EpochAppenderSelectionError(
                EpochAppenderSelectionErrorCode.REQUEST_CANCELLED,
                'Epoch append request no longer waiting',
                { details: { requestId: request.requestId, sessionId: message.session_id } }
            );
            this.#pendingRequests?.rejectPendingRequest(message.session_id, error);
        });
        return this.#getManager().send(peer, message);
    }

    /** Report a failed retry without interrupting the selector. */
    onError(error) {
        this.#logger?.debug?.(`[EpochAppenderSelector] ${error.message}`);
    }
}
