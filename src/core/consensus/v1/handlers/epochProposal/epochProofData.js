import b4a from 'b4a'

export const PROTOCOL_VERSION = 1

// const TOTAL_SIZE = 1 + 8 + 32 + 2 + 32 + 32 + 32 + 64 // 203 bytes
const TOTAL_SIZE = 1 + 8 + 32 + 2 + 32 + 32 + 64 // 171 bytes

const decode = (buffer) => {
    if (!b4a.isBuffer(buffer) || buffer.length < TOTAL_SIZE) return null

    let offset = 0

    const protocolVersion = buffer.readUInt8(offset);      offset += 1
    const epoch           = buffer.readBigUInt64BE(offset); offset += 8
    const prevEpochHash   = buffer.slice(offset, offset + 32); offset += 32
    const networkId       = buffer.readUInt16BE(offset);    offset += 2
    const comiteeHash     = buffer.slice(offset, offset + 32); offset += 32
    // const leaderId        = buffer.slice(offset, offset + 32); offset += 32
    const vdfParamsHash   = buffer.slice(offset, offset + 32); offset += 32
    const vdfOutput       = buffer.slice(offset, offset + 64); offset += 64

    return { protocolVersion, epoch, prevEpochHash, networkId, comiteeHash, /*leaderId,*/ vdfParamsHash, vdfOutput }
}

class EpochProofData {
    constructor({ protocolVersion, epoch, prevEpochHash, networkId, comiteeHash, /*leaderId,*/ vdfParamsHash, vdfOutput }) {
        this.protocolVersion = protocolVersion
        this.epoch           = epoch
        this.prevEpochHash   = prevEpochHash
        this.networkId       = networkId
        this.comiteeHash     = comiteeHash
        // this.leaderId        = leaderId
        this.vdfParamsHash   = vdfParamsHash
        this.vdfOutput       = vdfOutput
    }

    toBuffer() {
        const buf = b4a.alloc(TOTAL_SIZE)
        let offset = 0

        buf.writeUInt8(this.protocolVersion, offset)
        offset += 1
        
        buf.writeBigUInt64BE(BigInt(this.epoch), offset)
        offset += 8
        
        this.prevEpochHash.copy(buf, offset)
        offset += 32
        
        buf.writeUInt16BE(this.networkId, offset)
        offset += 2
        
        this.comiteeHash.copy(buf, offset)
        offset += 32
        
        // this.leaderId.copy(buf, offset)
        // offset += 32
        
        this.vdfParamsHash.copy(buf, offset)
        offset += 32
        
        this.vdfOutput.copy(buf, offset)
        offset += 64

        return buf
    }
}

// TODO: buildData signature and EpochProofData instantiation are broken — decode() result is ignored.
// Fix: accept the decoded object and pass it to new EpochProofData(decoded).
export const buildData = (/*leaderId,*/ previousEpoch, comissionHash, vdf) => {
    console.log(/*leaderId,*/ previousEpoch, comissionHash, vdf)
    return new EpochProofData()
}

// profData is buffer
export const epochProofFromBuffer = (proofData) => {
    return buildData(decode(proofData))
}

export const keys = {
    CURRENT_INDEX: '/epoch/current',
    EPOCH_HASH: n => `/epoch/${n}`,
    EPOCH: n => `/epochHash/${n}`,
    EPOCH_DATA: n => `/epochData/${n}`
}
