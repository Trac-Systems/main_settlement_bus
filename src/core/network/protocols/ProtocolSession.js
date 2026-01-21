// ProtocolSession is a per-peer (per Hyperswarm connection) wrapper that exposes the available
// protocol messengers (legacy JSON, v1 binary) in one place.
//
// Why it exists:
// - `setupProtomuxMessages(connection)` creates Protomux channels/messages for a specific peer.
class ProtocolSession {
    #legacy;
    #v1;

    constructor(legacy = null, v1 = null) {
        // These are Protomux "message" objects (returned by channel.addMessage).
        // They are connection-scoped and expose .send(...), already wired to the channel's encoding.
        this.#legacy = legacy;
        this.#v1 = v1;
    }

    getLegacy() {
        return this.#legacy;
    }

    getV1() {
        return this.#v1;
    }

    get(protocol) {
        if (protocol === 'legacy') return this.#legacy;
        if (protocol === 'v1') return this.#v1;
        return null;
    }

    has(protocol) {
        return Boolean(this.get(protocol));
    }
}

export default ProtocolSession;
