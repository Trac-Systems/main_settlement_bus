// ProtocolSession is a per-peer (per Hyperswarm connection) bridge that exposes the available
// protocol messengers (legacy JSON, v1 binary) in one place.
//
// Why it exists:
// - `setupProtomuxMessages(connection)` creates Protomux channels/messages for a specific peer.

class ProtocolSession {
    #legacyProtocol;
    #v1Protocol;
    #preferredProtocol = null;
    #activeProtocol = null;
    #supportedProtocols = {
        LEGACY: 'legacy',
        V1: 'v1'
    }

    constructor(legacyProtocol, v1Protocol) {
        // These are Protomux "message" objects (returned by channel.addMessage).
        // They are connection-scoped and expose .send(...), already wired to the channel's encoding.
        this.#legacyProtocol = legacyProtocol;
        this.#v1Protocol = v1Protocol;
        this.#activeProtocol = this.#v1Protocol;
    }

    get preferredProtocol() {
        return this.#preferredProtocol;
    }

    get supportedProtocols() {
        return this.#supportedProtocols;
    }

    setLegacyAsPreferredProtocol() {
        this.#preferredProtocol = this.#supportedProtocols.LEGACY;
        this.#activeProtocol = this.#legacyProtocol;
        console.log('ProtocolSession: Set preferred protocol to LEGACY');
    }

    setV1AsPreferredProtocol() {
        this.#preferredProtocol = this.#supportedProtocols.V1;
        this.#activeProtocol = this.#v1Protocol;
        console.log('ProtocolSession: Set preferred protocol to V1');
    }

    // TODO: Consider moving this method to be used only in V1 internally, just like 'encode'
    decode(message) {
        return this.#activeProtocol.decode(message);
    }

    async send(message) {
        return this.#activeProtocol.send(message);
    }

    sendAndForget(message) {
        this.#activeProtocol.sendAndForget(message);
    }

    close() {
        if (this.#legacyProtocol) {
            try {
                this.#legacyProtocol.close();
            } catch (e) {
                console.error('Failed to close legacy channel:', e); // TODO: Think about throwing instead
            }
        }

        if (this.#v1Protocol) {
            try {
                this.#v1Protocol.close();
            } catch (e) {
                console.error('Failed to close v1 channel:', e); // TODO: Think about throwing instead
            }
        }
    }
}

export default ProtocolSession;
