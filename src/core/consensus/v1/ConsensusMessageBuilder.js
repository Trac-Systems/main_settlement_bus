    
export default class ConsensusMessageBuilder {
    async #buildEpochProofProposalRequestPayload() {
        const nonce = tracCryptoApi.nonce.generate();
        const tsBuf = timestampToBuffer(this.#timestamp);
        const idBuf = idToBuffer(this.#id);
        const dataBuffer = this.#data.toBuffer();

        const message = createMessage(
            this.#type,
            idBuf,
            tsBuf,
            dataBuffer,
            nonce,
            encodeCapabilities(this.#capabilities),
        );

        const hash = await tracCryptoApi.hash.blake3(message);
        const signature = this.#wallet.sign(hash);

        this.#payloadKey = 'epoch_proof_proposal_request';
        this.#body = {
            data: {
                protocol_version: this.#data.protocolVersion,
                epoch: this.#data.epoch,
                previous_epoch_hash: this.#data.prevEpochHash,
                committed_hash: this.#data.prevEpochHash,
                vdf_parameters_hash: this.#data.vdfParamsHash,
                vdf_output: this.#data.vdfOutput,
            },
            hash,
            signature,
        };
    }

    async buildPayload() {
        this.#setHeader();

        switch (this.#type) {
            case NetworkOperationType.EPOCH_PROOF_PROPOSAL_REQUEST: {
                await this.#buildEpochProofProposalRequestPayload();
                break;
            }
            default:
                throw new Error(`Unsupported consensus type ${this.#type}`);
        }
    }
}