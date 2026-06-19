import b4a from "b4a";

import { VDF_BLOB_PROOF_SIZE } from "../../../utils/constants.js";

// Note: THis is a temporary class and will be removed in the future. It was only
// implemented to be used as a placeholder inside src/core/consensus/v1/handlers/ConsesusEpochProofProposalOperationHandler.js
// It should NOT be used elsewhere
class DummyVDFVerifier {
    async verify(proofProposal) {
        const proof = proofProposal?.vdf_proof;
        const hasExpectedProofShape = b4a.isBuffer(proof) && proof.length === VDF_BLOB_PROOF_SIZE;
        const isZeroFilled = hasExpectedProofShape && proof.every(byte => byte === 0);

        return hasExpectedProofShape && !isZeroFilled;
    }
}

export default DummyVDFVerifier;
