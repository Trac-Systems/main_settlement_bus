import ConsensusBaseOperation from './ConsensusBaseOperation.js';

class V1EpochProofProposalRequest extends ConsensusBaseOperation {
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
