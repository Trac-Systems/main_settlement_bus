import ConsensusRouterV1 from "../v1/ConsensusRouter.js";
import ConsensusV1Protocol from "./ConsensusV1Protocol.js";

class ConsensusMessages {
    #consensusRouter;
    #pendingRequestService;

    constructor(state, wallet, config, pendingRequestService) {
        this.#pendingRequestService = pendingRequestService;
        this.#consensusRouter = new ConsensusRouterV1(state, wallet, config, pendingRequestService);
    }

    async setupProtomuxMessages(connection) {
        connection.consensusProtocolSession = new ConsensusV1Protocol(
            this.#consensusRouter,
            connection,
            this.#pendingRequestService
        )
    }
}

export default ConsensusMessages;
