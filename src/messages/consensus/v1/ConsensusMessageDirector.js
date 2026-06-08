import {ConsensusOperationType} from '../../../utils/constants.js';

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
     * @param {number} protocolVersion
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
        protocolVersion,
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
            .setProtocolVersion(protocolVersion)
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
     * @param {number} protocolVersion
     * @param {number} networkId
     * @param {number} epoch
     * @param {Buffer} previousEpochRecordHash
     * @param {string} proposer
     * @param {Buffer} vdfParametersHash
     * @param {Buffer} vdfProof
     * @param {Buffer} requesterProofSignature
     * @param {number} resultCode
     * @param {string} approver
     * @returns {Promise<object>}
     */
    async buildProofProposalResponse(
        sessionId,
        protocolVersion,
        networkId,
        epoch,
        previousEpochRecordHash,
        proposer,
        vdfParametersHash,
        vdfProof,
        requesterProofSignature,
        resultCode,
        approver
    ) {
        await this.#builder
            .setType(ConsensusOperationType.PROOF_PROPOSAL_RESPONSE)
            .setSessionId(sessionId)
            .setTimestamp()
            .setProtocolVersion(protocolVersion)
            .setNetworkId(networkId)
            .setEpoch(epoch)
            .setPreviousEpochRecordHash(previousEpochRecordHash)
            .setProposer(proposer)
            .setVdfParametersHash(vdfParametersHash)
            .setVdfProof(vdfProof)
            .setRequesterProofSignature(requesterProofSignature)
            .setResultCode(resultCode)
            .setApprover(approver)
            .buildPayload();

        return this.#builder.getResult();
    }
}

export default ConsensusMessageDirector;
