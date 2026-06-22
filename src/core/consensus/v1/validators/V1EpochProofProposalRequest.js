import V1BaseConsensusOperation from "./V1BaseConsensusOperation.js";

class V1EpochProofProposalRequest extends V1BaseConsensusOperation {
    /**
     * Creates the proof proposal request validator.
     */
    constructor(config) {
        super(config);
    }

    /**
     * Validates proof proposal request schema and proposer signature.
     */
    async validate(payload, connection) {
        this.isPayloadSchemaValid(payload);
        await this.validateSignature(payload, connection.remotePublicKey);
    }
}

export default V1EpochProofProposalRequest;
