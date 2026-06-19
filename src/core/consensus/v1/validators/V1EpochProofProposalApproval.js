import V1BaseConsensusOperation from "./V1BaseConsensusOperation.js";

class V1EpochProofProposalApproval extends V1BaseConsensusOperation {
    constructor(config) {
        super(config);
    }

    async validate(payload, connection) {
        this.isPayloadSchemaValid(payload);
    }

}

export default V1EpochProofProposalApproval;
