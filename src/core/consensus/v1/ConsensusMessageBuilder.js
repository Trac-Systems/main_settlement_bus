    
export default class ConsensusMessageBuilder {
    #hash;

    setHash(hash) {
        this.#hash = hash;
        return this;
    }

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
            data: dataBuffer,
            hash: this.#hash,
            nonce,
            signature
        }
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