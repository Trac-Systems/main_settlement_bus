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
     * @param {Buffer} configId
     * @param {Buffer} vdfProof
     * @returns {Promise<object>}
     */
    async buildProofProposal(
        sessionId,
        networkId,
        epoch,
        previousEpochRecordHash,
        proposer,
        configId,
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
            .setConfigId(configId)
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
     * @param {Buffer} configId
     * @param {Buffer} vdfProof
     * @param {Buffer} requesterProofSignature
     * @param {number} resultCode
     * @param {string} approver
     * @returns {Promise<object>}
     */
    async buildProofProposalResponse(
        sessionId,
        networkId,
        epoch,
        previousEpochRecordHash,
        proposer,
        configId,
        vdfProof,
        requesterProofSignature,
        resultCode,
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
            .setConfigId(configId)
            .setVdfProof(vdfProof)
            .setRequesterProofSignature(requesterProofSignature)
            .setResultCode(resultCode)
            .setApprover(approver)
            .buildPayload();

        return this.#builder.getResult();
    }
}

export default ConsensusMessageDirector;
