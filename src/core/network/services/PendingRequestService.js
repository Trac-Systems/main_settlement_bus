// TODO: add more validation + write unit tests
import {NetworkOperationType, ResultCode} from '../../../utils/constants.js';
import {V1TimeoutError, V1UnexpectedError, V1ProtocolError} from "../protocols/v1/V1ProtocolError.js";

class PendingRequestService {
    #pendingRequests;
    #config;

    constructor(config) {
        this.#pendingRequests = new Map(); // Map<id, pendingRequestEntry>
        this.#config = config;
    }

    has(id) {
        return this.#pendingRequests.has(id);
    }

    isAlreadyProbed(peerPubKeyHex, preferedProtocol) {
        for (const [, entry] of this.#pendingRequests) {
            if (entry.requestedTo === peerPubKeyHex && entry.requestType === NetworkOperationType.LIVENESS_REQUEST && preferedProtocol === null) {
                return true;
            }
        }
        return false;
    }

    /*
    @returns {Promise}
    */
    registerPendingRequest(peerPubKeyHex, message) {
        const id = message.id;
        if (this.#pendingRequests.size >= 1_000_000) {
            throw new Error('Maximum number of pending requests reached.');
        }

        if (this.#pendingRequests.has(id)) {
            throw new Error(`Pending request with ID ${id} from peer ${peerPubKeyHex} already exists.`);
        }

        const entry = {
            id: id,
            requestType: message.type,
            requestMessage: message,
            requestedTo: peerPubKeyHex,
            timeoutMs: this.#config.pendingRequestTimeout,
            timeoutId: null,
            resolve: null,
            reject: null,
        }

        const promise = new Promise((resolve, reject) => {
            entry.resolve = resolve;
            entry.reject = reject;
        });

        entry.timeoutId = setTimeout(() => {
            this.rejectPendingRequest(
                id,
                new V1TimeoutError(
                    `Pending request with ID ${id} from peer ${peerPubKeyHex} timed out after ${this.#config.pendingRequestTimeout} ms.`,
                    false
                ));

        }, this.#config.pendingRequestTimeout);

        this.#pendingRequests.set(id, entry);
        return promise;
    }

    getAndDeletePendingRequest(id) {
        const entry = this.#pendingRequests.get(id);
        if (!entry) return null;

        clearTimeout(entry.timeoutId);
        this.#pendingRequests.delete(id);
        return entry;
    }

    getPendingRequest(id) {
        const entry = this.#pendingRequests.get(id);
        if (!entry) return null;
        return entry;
    }

    // for now we are resolving only resultCode, but we can extend it in the future if needed...
    resolvePendingRequest(id, resultCode = ResultCode.OK) {
        const entry = this.getAndDeletePendingRequest(id);
        if (!entry) return false;
        entry.resolve(resultCode);
        return true;
    }

    rejectPendingRequest(id, error) {
        const entry = this.getAndDeletePendingRequest(id);
        if (!entry) return false;
        const err = error instanceof V1ProtocolError
            ? error
            : new V1UnexpectedError(error?.message ?? 'Unexpected error', false);
        entry.reject(err);
        return true;
    }

    rejectPendingRequestsForPeer(peerPubKeyHex, error) {
        const idsToReject = [];
        for (const [id, entry] of this.#pendingRequests) {
            if (entry.requestedTo === peerPubKeyHex) idsToReject.push(id);
        }

        for (const id of idsToReject) {
            this.rejectPendingRequest(id, error);
        }

        return idsToReject.length;
    }

    stopPendingRequestTimeout(id) {
        const entry = this.#pendingRequests.get(id);
        if (!entry) return false;

        clearTimeout(entry.timeoutId);
        entry.timeoutId = null;
        return true;
    }

    close() {
        for (const [id, entry] of this.#pendingRequests) {
            clearTimeout(entry.timeoutId);
            try {
                entry.reject(
                    new V1UnexpectedError(
                        `Pending request ${id} cancelled (shutdown).`,
                        false)
                );
            } catch (error) {
                console.error(`PendingRequestService.close: failed to reject pending request ${id}:`, error);
            }
        }
        this.#pendingRequests.clear();
    }
}

export default PendingRequestService;
