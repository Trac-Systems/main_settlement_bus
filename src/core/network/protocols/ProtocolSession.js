// ProtocolSession is a per-peer (per Hyperswarm connection) wrapper that exposes the available
// protocol messengers (legacy JSON, v1 binary) in one place.
//
// Why it exists:
// - `setupProtomuxMessages(connection)` creates Protomux channels/messages for a specific peer.
class ProtocolSession {
    #legacySession;
    #legacyChannel;

    #v1Session;
    #v1Channel;

    constructor(legacyChannel, legacySession, v1Channel, v1Session) {
        // These are Protomux "message" objects (returned by channel.addMessage).
        // They are connection-scoped and expose .send(...), already wired to the channel's encoding.
        this.#legacyChannel = legacyChannel;
        this.#legacySession = legacySession;

        this.#v1Session = v1Session;
        this.#v1Channel = v1Channel;
    }

    getLegacy() {
        return this.#legacySession;
    }

    getV1() {
        return this.#v1Session;
    }

    get(protocol) {
        if (protocol === 'legacy') return this.#legacySession;
        if (protocol === 'v1') return this.#v1Session;
        return null;
    }

    has(protocol) {
        return Boolean(this.get(protocol));
    }

    send(message) {
        // TODO: Support v1 messages
        this.#legacySession.send(message);
    }

    close() {
        if (this.#legacyChannel) {
            try {
                this.#legacyChannel.close();
            } catch (e) {
                console.error('Failed to close legacy channel:', e); // TODO: Think about throwing instead
            }
        }

        if (this.#v1Channel) {
            try {
                this.#v1Channel.close();
            } catch (e) {
                console.error('Failed to close v1 channel:', e); // TODO: Think about throwing instead
            }
        }
    }
}

export default ProtocolSession;
