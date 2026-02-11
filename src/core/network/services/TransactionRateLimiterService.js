import b4a from 'b4a';

class TransactionRateLimiterService {
    #lastCleanup;
    #connectionsStatistics;
    #swarm;
    #config;

    constructor(swarm, config) {
        this.#lastCleanup = Date.now();
        this.#connectionsStatistics = new Map();
        this.#swarm = swarm
        this.#config = config
    }

    /*
        Checks if the peer has exceeded the rate limit.
        A peer is considered to have exceeded the rate limit if:
        - The time since the last activity is greater than or equal to 1000 ms (1 second)
        - The number of transactions in the current session is greater than or equal to rateLimitMaxTransactionsPerSecond
        If the rate limit is exceeded, the peer is disconnected.
    */
    #hasExceededRateLimit(peer) {
        const peerData = this.#connectionsStatistics.get(peer);
        const currentSecond = Math.floor((peerData.lastActivityTime - peerData.sessionStartTime) / 1000);
        
        if (currentSecond > Math.floor((peerData.lastCounterReset - peerData.sessionStartTime) / 1000)) {
            peerData.transactionCount = 0;
            peerData.lastCounterReset = peerData.lastActivityTime;
            this.#connectionsStatistics.set(peer, peerData);
        }
        
        return peerData.transactionCount >= this.#config.rateLimitMaxTransactionsPerSecond;
    }

    /*
        Handles the rate limiting for a peer connection.
        If the peer has exceeded the rate limit, it disconnects the peer.
        Otherwise, it updates the connection info with the current timestamp.
    */
    handleRateLimit(connection) {
        const peer = b4a.toString(connection.remotePublicKey, 'hex');
        const currentTime = Date.now();

        this.#cleanUpOldConnections(currentTime);
        this.#initializePeerConnectionInfoEntry(peer, currentTime);

        if (this.#isConnectionExpired(peer)) {
            this.#connectionsStatistics.delete(peer);
            return false;
        }

        if (this.#hasExceededRateLimit(peer)) {
            console.warn(`Rate limit exceeded for peer ${peer}. Disconnecting...`);
            this.#swarm.leavePeer(connection.remotePublicKey);
            connection.end();
            return true;
        }

        this.#updatePeerConnectionInfo(peer, currentTime);
        return false;
    }

    #shouldCleanupConnections(currentTime) {
        return currentTime - this.#lastCleanup >= this.#config.rateLimitCleanupIntervalMs;
    }

    /**
        Cleans up old connections that have timed out.
        Condition for cleanup based on #shouldCleanupConnections:
        - If the last cleanup was more than rateLimitCleanupIntervalMs ago
    */
    #cleanUpOldConnections(currentTime) {
        if (!this.#shouldCleanupConnections(currentTime)) {
            return;
        }

        for (const [peer, _] of this.#connectionsStatistics.entries()) {
            if (this.#isConnectionExpired(peer)) {
                //console.log(`Connection for peer ${peer} has expired. Removing...`);
                this.#connectionsStatistics.delete(peer);
            }
        }

        this.#lastCleanup = currentTime;
    }

    /*
        Initializes the connection statistics for a peer.
        Connection is a HashMap with the following structure:
            peerPublicKey: {
                sessionStartTime: timestamp,     // When the external peer started their session
                lastActivityTime: timestamp,     // Timestamp of peer's most recent activity (default: 0)
                transactionCount: number         // Number of transactions in the current session (default: 0)
            }
        
    */
    #initializePeerConnectionInfoEntry(peer, timestamp) {
        if (!this.#connectionsStatistics.has(peer)) {
            this.#connectionsStatistics.set(peer, {
                sessionStartTime: timestamp,
                lastActivityTime: 0,
                lastCounterReset: timestamp,
                transactionCount: 0
            });
        }
    }
    
    /*
        When external peer sends a transaction, this method updates the connection info.
        It updates the last activity time and increments the transaction count.
    */
    #updatePeerConnectionInfo(peer, timestamp) {
        const peerData = this.#connectionsStatistics.get(peer);
        peerData.lastActivityTime = timestamp;
        peerData.transactionCount += 1;
        this.#connectionsStatistics.set(peer, peerData);
    }

    /*
        Checks if the connection for a peer has expired.
    */
    #isConnectionExpired(peer) {
        const peerData = this.#connectionsStatistics.get(peer);
        return peerData.lastActivityTime - peerData.sessionStartTime >= this.#config.rateLimitConnectionTimeoutMs;
    }
}

export default TransactionRateLimiterService;
