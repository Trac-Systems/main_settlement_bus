import Protomux from 'protomux';
import { PeerConnectionManager } from '../../shared/PeerConnectionManager.js'

class IndexerConnectionManager extends PeerConnectionManager {
    #messages
    // Tracks connections that already have a consensus/v1 Protomux channel opened on them.
    // `connection.protocolSession` is shared with the validator protocol (already set by the
    // swarm's connection listener before a peer is known to be an indexer), so it can't be used
    // as the "already initialized" check here. Without this, calling add() twice for the same
    // connection (once via IS_INDEXER state event, once via the IndexerObserverService polling
    // loop) would open a second, unpaired consensus/v1 channel and silently swallow every send.
    //
    // A peer can also be demoted (disconnectIndexerPeer -> remove()) and later re-promoted on the
    // *same* underlying connection - remove() only closes our consensus/v1 channel, not the whole
    // connection. So "already initialized" alone isn't enough: if that channel was since closed,
    // we must open a fresh one instead of re-registering the dead one.
    #consensusInitialized = new WeakSet();

    constructor(maxIndexers, config, logger, messages) {
        super(maxIndexers, config, logger);
        this.#messages = messages
    }

    /**
     * Registers a reactive pairing callback for the consensus/v1 protocol on this connection.
     *
     * Protomux channels only pair up if both sides have a matching channel open at roughly the
     * same time - if the remote's "open channel" request arrives before we've called add() for
     * this peer ourselves, Protomux rejects it outright and nothing here ever retries. pair()
     * lets us react to that request just in time instead of losing the race silently.
     * See: node_modules/hypercore/lib/replicator.js (attachTo) for the same pattern.
     */
    prepareConnection(connection) {
        const mux = Protomux.from(connection);
        mux.pair({ protocol: 'consensus/v1' }, () => {
            this.add(connection.remotePublicKey, connection);
        });
    }

    add(publicKey, connection) {
        this.#messages.attachChannel(connection);
        this._add(publicKey, connection)
    }

    prettyPrint() {
        console.log(`Connection count: ${this._connections.size}`);
        console.log(`Indexer map keys:\n${Array.from(this._connections.keys()).join('\n')}`);
    }
}

export default IndexerConnectionManager;
