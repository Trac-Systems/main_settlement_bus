import {ConsensusOperationType, PEER_PUBLIC_KEY_HEX_LENGTH, ConsensusResultCode} from '../../../utils/constants.js';
import {isHexString, publicKeyToAddress} from '../../../utils/helpers.js';
import {V1ConsensusProtocolError} from "../../../core/consensus/v1/V1ConsensusProtocolError.js";

export class IndexerPendingRequestServiceTimeoutError extends Error {
    constructor(requestId, peerAddress, timeoutMs) {
        super(`Pending request ${requestId} to peer ${peerAddress} timed out after ${timeoutMs} ms.`);
        this.name = this.constructor.name;
    }
}

export default class IndexerPendingRequestService {
    #pendingRequests;
    #config;

    constructor(config) {
        this.#pendingRequests = new Map(); // Map<id, pendingRequestEntry>
        this.#config = config;
    }

    has(id) {
        return this.#pendingRequests.has(id);
    }

    #validateRegisterInput(peerPubKeyHex, message) {
        if (!isHexString(peerPubKeyHex) || peerPubKeyHex.length !== PEER_PUBLIC_KEY_HEX_LENGTH) {
            throw new Error('Invalid peer public key. Expected 32-byte hex string.');
        }

        if (typeof message?.session_id !== 'string' || message?.session_id.length === 0) {
            throw new Error('Pending request ID must be a non-empty string.');
        }

        if (message.type !== ConsensusOperationType.PROOF_PROPOSAL) {
            throw new Error('Unsupported pending request type');
        }
    }

    /*
    @returns {Promise}
    */
    registerPendingRequest(peerPubKeyHex, message) {
        this.#validateRegisterInput(peerPubKeyHex, message);
        const id = message.session_id;
        const peerAddress = publicKeyToAddress(peerPubKeyHex, this.#config);
        if (this.#pendingRequests.size >= this.#config.maxPendingRequestsInPendingRequestsService) {
            throw new Error('Maximum number of pending requests reached.');
        }

        if (this.#pendingRequests.has(id)) {
            throw new Error(`Pending request with ID ${id} from peer ${peerPubKeyHex} already exists.`);
        }

        const entry = {
            id: id,
            requestType: message.type,
            requestedTo: peerPubKeyHex,
            proofProposal: message.proof_proposal,
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
                new IndexerPendingRequestServiceTimeoutError(
                    id,
                    peerAddress,
                    this.#config.indexerPendingRequestTimeout
                )
            );

        }, this.#config.indexerPendingRequestTimeout);

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

    // for now, we are resolving only resultCode, but we can extend it in the future if needed...
    resolvePendingRequest(id, resultCode = ConsensusResultCode.OK) {
        const entry = this.getAndDeletePendingRequest(id);
        if (!entry) return false;
        entry.resolve(resultCode);
        return true;
    }

    rejectPendingRequest(id, error) {
        const entry = this.getAndDeletePendingRequest(id);
        if (!entry) return false;
        entry.reject(error instanceof Error ? error : new Error(error?.message ?? 'Unexpected error'));
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
                    new V1ConsensusProtocolError(
                        ConsensusResultCode.UNEXPECTED_ERROR,
                        `Pending request ${id} cancelled (shutdown).`)
                );
            } catch (error) {
                console.error(`IndexerPendingRequestService.close: failed to reject pending request ${id}:`, error);
            }
        }
        this.#pendingRequests.clear();
    }
}
