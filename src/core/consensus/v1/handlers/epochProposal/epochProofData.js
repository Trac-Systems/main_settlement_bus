import b4a from 'b4a'
import tracCryptoApi from "trac-crypto-api";
import { createMessage, uint8ToBuffer, uint16ToBuffer, uint64ToBuffer } from '../../../../../utils/buffer.js';

export const PROTOCOL_VERSION = 1

// const TOTAL_SIZE = 1 + 8 + 32 + 2 + 32 + 32 + 32 + 64 // 203 bytes
const TOTAL_SIZE = 1 + 8 + 32 + 2 + 32 + 32 + 64 // 171 bytes

const decode = (buffer) => {
    if (!b4a.isBuffer(buffer) || buffer.length < TOTAL_SIZE) return null

    let offset = 0

    const protocolVersion = buffer.readUInt8(offset);      offset += 1
    const epoch           = buffer.readBigUInt64BE(offset); offset += 8
    const prevEpochHash   = buffer.slice(offset,
        offset + 32); offset += 32
    const networkId       = buffer.readUInt16BE(offset);    offset += 2
    const committeeHash     = buffer.slice(offset, offset + 32); offset += 32
    // const leaderId        = buffer.slice(offset, offset + 32); offset += 32
    const vdfParamsHash   = buffer.slice(offset, offset + 32); offset += 32
    const vdfOutput       = buffer.slice(offset, offset + 64); offset += 64

    return { protocolVersion, epoch, prevEpochHash, networkId, committeeHash, /*leaderId,*/ vdfParamsHash, vdfOutput }
}

class EpochProofData {
    constructor({ protocolVersion, epoch, prevEpochHash, networkId, proposer, vdfParamsHash, vdfProof }) {
        this.protocolVersion = protocolVersion
        this.epoch           = epoch
        this.prevEpochHash   = prevEpochHash
        this.networkId       = networkId
        this.proposer        = proposer
        this.vdfParamsHash   = vdfParamsHash
        this.vdfProof        = vdfProof
    }

    async toProposalMessage(signer) {
        const hash = this.#hash()
        return {
            data: {
                protocolVersion: this.protocolVersion,
                epoch: this.epoch,
                prevEpochHash: this.prevEpochHash,
                networkId: this.networkId,
                proposer: this.proposer,
                vdfParamsHash: this.vdfParamsHash,
                vdfProof: this.vdfProof,
            },
            dataHash: hash,
            signature: await this.#sign(signer, hash),
        };
    }

    #hash() {
        return b4a.from(tracCryptoApi.hash.blake3(this.#toBuffer()))
    }

    #toBuffer() {
        return createProofProposalSigningMessage(
            this.protocolVersion,
            this.networkId,
            this.epoch,
            this.prevEpochHash,
            this.proposer,
            this.vdfParamsHash,
            this.vdfProof)
    }

    async #sign(signer, hash) {
        return signer.sign(hash)
    }
}

// TODO: validate decoded data being received and returned
export const buildProofData = (decoded) => {
    if (!decoded) return null
    return new EpochProofData(decoded)
}

// profData is buffer
export const epochProofFromBuffer = (proofData) => {
    return buildProofData(decode(proofData))
}

export const keys = {
    CURRENT_INDEX: '/epoch/current',
    EPOCH_HASH: n => `/epoch/${n}`,
    EPOCH_DATA: n => `/epochHash/${n}`
}

const createProofProposalSigningMessage = (
    protocolVersion,
    networkId,
    epoch,
    previousEpochRecordHash,
    proposer,
    vdfParamsHash,
    vdfProof,
) => createMessage(
    uint8ToBuffer(protocolVersion, 'protocolVersion'),
    uint16ToBuffer(networkId, 'networkId'),
    uint64ToBuffer(epoch, 'epoch'),
    previousEpochRecordHash,
    proposer,
    vdfParamsHash,
    vdfProof,
)
