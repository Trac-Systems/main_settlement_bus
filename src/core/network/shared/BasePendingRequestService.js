export default class BasePendingRequestService {
    _pendingRequests = new Map();

    has(id) {
        return this._pendingRequests.has(id);
    }

    getAndDeletePendingRequest(id) {
        const entry = this._pendingRequests.get(id);
        if (!entry) return null;

        clearTimeout(entry.timeoutId);
        this._pendingRequests.delete(id);
        return entry;
    }

    getPendingRequest(id) {
        const entry = this._pendingRequests.get(id);
        if (!entry) return null;
        return entry;
    }

    rejectPendingRequest(id, error) {
        const entry = this.getAndDeletePendingRequest(id);
        if (!entry) return false;
        entry.reject(error instanceof Error ? error : new Error(error?.message ?? 'Unexpected error'));
        return true;
    }

    rejectPendingRequestsForPeer(peerPubKeyHex, error) {
        const idsToReject = [];
        for (const [id, entry] of this._pendingRequests) {
            if (entry.requestedTo === peerPubKeyHex) idsToReject.push(id);
        }

        for (const id of idsToReject) {
            this.rejectPendingRequest(id, error);
        }

        return idsToReject.length;
    }
    
    stopPendingRequestTimeout(id) {
        const entry = this._pendingRequests.get(id);
        if (!entry) return false;

        clearTimeout(entry.timeoutId);
        entry.timeoutId = null;
        return true;
    }
    
    close() {
        for (const [id, entry] of this._pendingRequests) {
            clearTimeout(entry.timeoutId);
            try {
                entry.reject(this._createShutdownError(id));
            } catch (error) {
                console.error(`${this.constructor.name}.close: failed to reject pending request ${id}:`, error);
            }
        }
        this._pendingRequests.clear();
    }    
    
    _createShutdownError(id) {
        return new Error(`Pending request ${id} cancelled (shutdown).`);
    }
}