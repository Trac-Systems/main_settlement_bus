import V1BaseOperation from "../../../network/protocols/v1/validators/V1BaseOperation.js";

class V1EpochProofProposalRequest extends V1BaseOperation {
    constructor(config) {
        super(config);
    }

    async validate(payload, remotePublicKey) {
        this.isPayloadSchemaValid(payload);
        await this.validateSignature(payload, remotePublicKey);
        return true;
    }
}

export default V1EpochProofProposalRequest;
