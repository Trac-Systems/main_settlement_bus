// TODO: add more validation + write unit tests

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

    async registerPendingRequest(peerPubKeyHex, requestData) {
        const id = requestData.id;
        if (this.#pendingRequests.size >= 1_000_000) {
            throw new Error('Maximum number of pending requests reached.');
        }

        if (this.#pendingRequests.has(id)) {
            throw new Error(`Pending request with ID ${id} from peer ${peerPubKeyHex} already exists.`);
        }
        const entry = {
            id: id,
            requestData: requestData,
            requestedTo: peerPubKeyHex,
            timeoutMs: this.#config.pendingRequestTimeout,
            timeoutId: null,
            resolve: null,
            reject: null,
            // timedOut: false, // To discuss what can be shared with legacy. It would be good to create this object as a class.
            // sent: true,
            //protocol: "v1"
            //retries: 0
        }

        const promise = new Promise((resolve, reject) => {
            entry.resolve = resolve;
            entry.reject = reject;
        });
        
        entry.timeoutId = setTimeout(() => {
            this.rejectPendingRequest(
                id,
                new Error(`Pending request with ID ${id} from peer ${peerPubKeyHex} timed out after ${this.#config.pendingRequestTimeout} ms.`));
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

    resolvePendingRequest(id) {
        const entry = this.getAndDeletePendingRequest(id);
        if (!entry) return false;
        entry.resolve();
        return true;
    }

    rejectPendingRequest(id, error) {
        const entry = this.getAndDeletePendingRequest(id);
        if (!entry) return false;
        entry.reject(error);
        return true;
    }
    
    close() {
        for (const [id, entry] of this.#pendingRequests) {
            clearTimeout(entry.timeoutId);
            try { 
                entry.reject(new Error(`Pending request ${id} cancelled (shutdown).`)); 
            } catch {}
        }
    this.#pendingRequests.clear();
  }
}

export default PendingRequestService;
