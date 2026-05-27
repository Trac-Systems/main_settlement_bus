// Use this a factory to create the object attached to the swam connection
class ConsensusMessages {
    #config;
    #wallet;
    #state;

    constructor(
        state,
        wallet,
        config
    ) {
        this.#config = config;
        this.#wallet = wallet;
        this.#state = state;
    }

    async setupProtomuxMessages(connection) {
        // The purpose of this is to grab a hyperswarm connection and enrich with an extra property that handle operations and carry metadata. We will need a specific class whose instnance will be created here.
        connection.protocolSession;
    }
}

export default ConsensusMessages;
