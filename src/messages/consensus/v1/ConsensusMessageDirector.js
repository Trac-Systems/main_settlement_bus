import {ConsensusOperationType, ConsensusProtocolVersion} from '../../../utils/constants.js';

/**
 * Director for v1 consensus protocol messages.
 */

class ConsensusMessageDirector {
    #builder;

    /**
     * @param {ConsensusMessageBuilder} builderInstance
     */
    constructor(builderInstance) {
        this.#builder = builderInstance;
    }

    /**
     * Build a proof proposal message.
     * @param {string} sessionId
     * @param {number} networkId
     * @param {number} epoch
     * @param {Buffer} previousEpochRecordHash
     * @param {string} proposer
     * @param {Buffer} vdfParametersHash
     * @param {Buffer} vdfProof
     * @returns {Promise<object>}
     */
    async buildProofProposal(
        sessionId,
        networkId,
        epoch,
        previousEpochRecordHash,
        proposer,
        vdfParametersHash,
        vdfProof
    ) {
        await this.#builder
            .setType(ConsensusOperationType.PROOF_PROPOSAL)
            .setSessionId(sessionId)
            .setTimestamp()
            .setProtocolVersion(ConsensusProtocolVersion.V1)
            .setNetworkId(networkId)
            .setEpoch(epoch)
            .setPreviousEpochRecordHash(previousEpochRecordHash)
            .setProposer(proposer)
            .setVdfParametersHash(vdfParametersHash)
            .setVdfProof(vdfProof)
            .buildPayload();

        return this.#builder.getResult();
    }

    /**
     * Build a proof proposal response message.
     * @param {string} sessionId
     * @param {number} networkId
     * @param {number} epoch
     * @param {Buffer} previousEpochRecordHash
     * @param {string} proposer
     * @param {Buffer} vdfParametersHash
     * @param {Buffer} vdfProof
     * @param {Buffer} requesterProofSignature
     * @param {number} consensusResultCode
     * @param {string} approver
     * @returns {Promise<object>}
     */
    async buildProofProposalResponse(
        sessionId,
        networkId,
        epoch,
        previousEpochRecordHash,
        proposer,
        vdfParametersHash,
        vdfProof,
        requesterProofSignature,
        consensusResultCode,
        approver
    ) {
        await this.#builder
            .setType(ConsensusOperationType.PROOF_PROPOSAL_APPROVAL)
            .setSessionId(sessionId)
            .setTimestamp()
            .setProtocolVersion(ConsensusProtocolVersion.V1)
            .setNetworkId(networkId)
            .setEpoch(epoch)
            .setPreviousEpochRecordHash(previousEpochRecordHash)
            .setProposer(proposer)
            .setVdfParametersHash(vdfParametersHash)
            .setVdfProof(vdfProof)
            .setRequesterProofSignature(requesterProofSignature)
            .setResultCode(consensusResultCode)
            .setApprover(approver)
            .buildPayload();

        return this.#builder.getResult();
    }

    /**
     * Build a non-OK proof proposal response without requiring proof proposal fields.
     * @param {string} sessionId
     * @param {number} consensusResultCode
     * @returns {Promise<object>}
     */
    async buildProofProposalRejectionResponse(sessionId, consensusResultCode) {
        await this.#builder
            .setType(ConsensusOperationType.PROOF_PROPOSAL_APPROVAL)
            .setSessionId(sessionId)
            .setTimestamp()
            .setResultCode(consensusResultCode)
            .buildPayload();

        return this.#builder.getResult();
    }
}

export default ConsensusMessageDirector;
