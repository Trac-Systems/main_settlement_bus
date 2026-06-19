import ConsensusValidationSchema from "./ConsensusValidationSchema.js";

class V1BaseConsensusOperation {
    #consensusValidationSchema;

    constructor(_config) {
        this.#consensusValidationSchema = new ConsensusValidationSchema();
    }
}


export default V1BaseConsensusOperation;