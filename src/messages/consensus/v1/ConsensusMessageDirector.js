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
     * @param {Buffer} difficulty
     * @param {Buffer} discriminantBitSize
     * @param {Buffer} proof
     * @returns {Promise<object>}
     */
    async buildProofProposal(
        sessionId,
        networkId,
        epoch,
        previousEpochRecordHash,
        proposer,
        difficulty,
        discriminantBitSize,
        proof
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
            .setDifficulty(difficulty)
            .setDiscriminantBitSize(discriminantBitSize)
            .setProof(proof)
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
     * @param {Buffer} difficulty
     * @param {Buffer} discriminantBitSize
     * @param {Buffer} proof
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
        difficulty,
        discriminantBitSize,
        proof,
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
            .setDifficulty(difficulty)
            .setDiscriminantBitSize(discriminantBitSize)
            .setProof(proof)
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
