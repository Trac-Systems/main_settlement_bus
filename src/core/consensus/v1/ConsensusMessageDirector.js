export default class ConsensusMessageDirector {
    #builder

    constructor(builder) {
        this.#builder = builder
    }

    async buildEpochProofProposalRequest(id, data, hash, capabilities) {
        await this.#builder
            .setType(NetworkOperationType.EPOCH_PROOF_PROPOSAL_REQUEST)
            .setId(id)
            .setTimestamp()
            .setData(data)
            .setHash(hash)
            .setCapabilities(capabilities)
            .buildPayload();

        return this.#builder.getResult();
    }
}