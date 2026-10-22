import { generateUUID } from '../../../utils/helpers.js';
import { consensusMessageFactory } from '../../../messages/consensus/v1/consensusMessageFactory.js';
import { EpochAppenderSelectionError, EpochAppenderSelectionErrorCode } from './EpochAppenderSelectionError.js';
import { loadSelectionState, saveSelectionState } from './epochAppenderSelectionStorage.js';

/**
 * Provides local storage, signed ledger reads and network requests for the selector. The selector uses
 * these methods to collect votes. The round handles the epoch append.
 */
export class EpochAppenderSelectionOperations {
    #state;
    #wallet;
    #config;
    #getIndexerConnectionManager;
    #logger;
    #pendingRequestService;

    /**
     * Sets up the services used by the selector. The connection manager is read through a callback
     * because Network creates it after the selector.
     *
     * @param {import('../../state/State.js').default} state Access to signed ledger data and local storage.
     * @param {object} wallet Wallet used to sign REQUEST messages.
     * @param {object} config Network and message encoding config.
     * @param {function(): import('../../network/services/IndexerConnectionManager.js').default} getIndexerConnectionManager Returns the connection manager once it is ready.
     * @param {object} [logger] Logger for operation errors.
     * @param {object} [pendingRequestService] Tracks pending requests and cancels them when needed.
     */
    constructor(state, wallet, config, getIndexerConnectionManager, logger, pendingRequestService) {
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
        this.#getIndexerConnectionManager = getIndexerConnectionManager;
        this.#logger = logger;
        this.#pendingRequestService = pendingRequestService;
    }

    /**
     * Loads the election state saved on this node.
     *
     * @returns {Promise<import('./epochAppenderSelectionState.js').EpochAppenderSelectionState|null>}
     */
    load() {
        return loadSelectionState(this.#state.base);
    }

    /**
     * Saves a copy of the election state on this node.
     *
     * @param {import('./epochAppenderSelectionState.js').EpochAppenderSelectionState} selectionState Election state to save locally.
     * @returns {Promise<void>}
     */
    save(selectionState) {
        return saveSelectionState(this.#state.base, selectionState);
    }

    /**
     * Reads the epoch, consensus config and indexers from the same signed checkpoint.
     *
     * @returns {Promise<import('./epochAppenderSelectionState.js').EpochAppenderSelectionContext>}
     */
    readContext() {
        return this.#state.getEpochAppenderSelectionContext();
    }

    /**
     * Checks whether the signed ledger has processed this append.
     *
     * @param {import('./epochAppenderSelectionState.js').EpochAppendPublication} publication Saved writer position and payload hash for this append.
     * @returns {Promise<import('./epochAppenderSelectionState.js').EpochAppendOutcomeResult>}
     */
    readOutcome(publication) {
        return this.#state.getEpochAppendOutcome(publication);
    }

    /**
     * Connects to the current indexers through the existing session manager.
     *
     * @returns {Promise<void>}
     */
    connect() {
        return this.#getIndexerConnectionManager().connect();
    }

    /**
     * Signs and sends a REQUEST for an appender vote. Registers a callback so the election can cancel
     * the pending request. If cancellation happens during signing, nothing is sent.
     *
     * @param {string} peerPublicKey Target wallet key, encoded as hex.
     * @param {import('./epochAppenderSelectionState.js').EpochAppendRequest} selectionRequest Request containing the candidate, election term and payload hash.
     * @param {import('./epochAppenderSelectionState.js').EpochSelectionRequestLifecycle} requestLifecycle Callbacks that check whether the request is active and register cancellation.
     * @returns {Promise<import('./epochAppenderSelectionState.js').EpochAppendReply|null>} Validated reply, or null after cancellation.
     */
    async sendRequest(peerPublicKey, selectionRequest, requestLifecycle) {
        const requestMessage = await consensusMessageFactory(this.#wallet, this.#config).buildRequest(generateUUID(), selectionRequest);
        if (!requestLifecycle.isActive()) {
            return null;
        }
        requestLifecycle.onPending(() => {
            const error = new EpochAppenderSelectionError(
                EpochAppenderSelectionErrorCode.REQUEST_CANCELLED,
                'Epoch append request no longer waiting',
                { details: { requestId: selectionRequest.requestId, sessionId: requestMessage.session_id } }
            );
            this.#pendingRequestService?.rejectPendingRequest(requestMessage.session_id, error);
        });
        return this.#getIndexerConnectionManager().send(peerPublicKey, requestMessage);
    }

    /**
     * Logs an error from a background operation. This does not change the election state.
     *
     * @param {Error} error Error from storage, signed context reads or a peer request.
     */
    onError(error) {
        this.#logger?.debug?.(`[EpochAppenderSelector] ${error.message}`);
    }
}
