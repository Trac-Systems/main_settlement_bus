import {NetworkOperationType, ResultCode} from '../../../utils/constants.js';
import {isHexString} from '../../../utils/helpers.js';
import {V1TimeoutError, V1UnexpectedError, V1ProtocolError} from "../protocols/v1/V1ProtocolError.js";
import {Config} from '../../../config/config.js';
import b4a from 'b4a';

const PEER_PUBLIC_KEY_HEX_LENGTH = 64;

class PendingRequestService {
    #pendingRequests;
    #requestMessageTypes = [NetworkOperationType.LIVENESS_REQUEST, NetworkOperationType.BROADCAST_TRANSACTION_REQUEST];
    #config;

    constructor(config) {
        this.#validateConfigMembers(config);
        this.#pendingRequests = new Map(); // Map<id, pendingRequestEntry>
        this.#config = config;
    }

    #validateConfigMembers(config) {
        if (!config.maxPendingRequestsInPendingRequestsService || isNaN(config.maxPendingRequestsInPendingRequestsService) || config.maxPendingRequestsInPendingRequestsService <= 0) {
            throw new Error('Invalid config: maxPendingRequestsInPendingRequestsService must be a positive integer.');
        }

        if (!config.pendingRequestTimeout || isNaN(config.pendingRequestTimeout) || config.pendingRequestTimeout <= 0) {
            throw new Error('Invalid config: pendingRequestTimeout must be a positive integer.');
        }
    }

    has(id) {
        return this.#pendingRequests.has(id);
    }

    isProbePending(peerPubKeyHex) {
        for (const [, entry] of this.#pendingRequests) {
            if (entry.requestedTo === peerPubKeyHex && entry.requestType === NetworkOperationType.LIVENESS_REQUEST) {
                return true;
            }
        }
        return false;
    }

    #validateRegisterInput(peerPubKeyHex, message) {
        if (!isHexString(peerPubKeyHex) || peerPubKeyHex.length !== PEER_PUBLIC_KEY_HEX_LENGTH) {
            throw new Error('Invalid peer public key. Expected 32-byte hex string.');
        }

        if (!message || typeof message !== 'object') {
            throw new Error('Pending request message must be an object.');
        }

        if (typeof message.id !== 'string' || message.id.length === 0) {
            throw new Error('Pending request ID must be a non-empty string.');
        }

        if (!this.#requestMessageTypes.includes(message.type)) {
            throw new Error('Unsupported pending request type.');
        }
    }

    /*
    @returns {Promise}
    */
    registerPendingRequest(peerPubKeyHex, message) {
        this.#validateRegisterInput(peerPubKeyHex, message);
        const id = message.id;
        if (this.#pendingRequests.size >= this.#config.maxPendingRequestsInPendingRequestsService) {
            throw new Error('Maximum number of pending requests reached.');
        }

        if (this.#pendingRequests.has(id)) {
            throw new Error(`Pending request with ID ${id} from peer ${peerPubKeyHex} already exists.`);
        }

        const entry = {
            id: id,
            requestType: message.type,
            requestTxData: this.#extractRequestTxData(message),
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
                    `Pending request with ID ${id} from peer ${peerPubKeyHex} timed out after ${entry.timeoutMs} ms.`,
                    false
                ));

        }, entry.timeoutMs);

        this.#pendingRequests.set(id, entry);
        return promise;
    }

    #extractRequestTxData(message) {
        if (message.type !== NetworkOperationType.BROADCAST_TRANSACTION_REQUEST) return null;
        const txData = message.broadcast_transaction_request?.data;
        return b4a.isBuffer(txData) ? txData : null;
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

    // for now, we are resolving only resultCode, but we can extend it in the future if needed...
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
