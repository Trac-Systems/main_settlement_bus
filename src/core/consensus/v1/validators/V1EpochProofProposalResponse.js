import ConsensusBaseOperation from './ConsensusBaseOperation.js';
import { ResultCode } from "../../../../utils/constants.js";

class V1EpochProofProposalResponse extends ConsensusBaseOperation {
    constructor(config) {
        super(config);
    }

    async validate(payload, connection, pendingRequestServiceEntry) {
        this.isPayloadSchemaValid(payload);
        this.validateResponseType(payload, pendingRequestServiceEntry);
        this.validatePeerCorrectness(connection.remotePublicKey, pendingRequestServiceEntry);

        const resultCode = payload.proof_proposal_response.result;
        if (resultCode === ResultCode.OK && !payload.proof_proposal_response.approval) return false;
        return true;
    }
}

export default V1EpochProofProposalResponse;
