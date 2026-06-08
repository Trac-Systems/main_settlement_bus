import {assertBuffer, createMessage, uint32ToBuffer, uint64ToBuffer} from "../../../utils/buffer.js";

export function createProofProposalSigningMessage(
    protocolVersion,
    networkId,
    epoch,
    previousEpochRecordHash,
    proposer,
    vdfParametersHash,
    vdfProof
) {
    return createMessage(
        uint32ToBuffer(protocolVersion, 'Protocol version'),
        uint32ToBuffer(networkId, 'Network id'),
        uint64ToBuffer(epoch, 'Epoch'),
        assertBuffer(previousEpochRecordHash, 'Previous epoch record hash'),
        assertBuffer(proposer, 'Proposer'),
        assertBuffer(vdfParametersHash, 'VDF parameters hash'),
        assertBuffer(vdfProof, 'VDF proof')
    );
}

export function safeCreateProofProposalSigningMessage(
    protocolVersion,
    networkId,
    epoch,
    previousEpochRecordHash,
    proposer,
    vdfParametersHash,
    vdfProof
) {
    try {
        return createProofProposalSigningMessage(
            protocolVersion,
            networkId,
            epoch,
            previousEpochRecordHash,
            proposer,
            vdfParametersHash,
            vdfProof
        );
    } catch {
        return null;
    }
}

export function createProofProposalApprovalSigningMessage(
    protocolVersion,
    networkId,
    epoch,
    previousEpochRecordHash,
    proposer,
    vdfParametersHash,
    vdfProof,
    approver,
    requesterProofSignature
) {
    return createMessage(
        uint32ToBuffer(protocolVersion, 'Protocol version'),
        uint32ToBuffer(networkId, 'Network id'),
        uint64ToBuffer(epoch, 'Epoch'),
        assertBuffer(previousEpochRecordHash, 'Previous epoch record hash'),
        assertBuffer(proposer, 'Proposer'),
        assertBuffer(vdfParametersHash, 'VDF parameters hash'),
        assertBuffer(vdfProof, 'VDF proof'),
        assertBuffer(approver, 'Approver'),
        assertBuffer(requesterProofSignature, 'Requester proof signature')
    );
}

export function safeCreateProofProposalApprovalSigningMessage(
    protocolVersion,
    networkId,
    epoch,
    previousEpochRecordHash,
    proposer,
    vdfParametersHash,
    vdfProof,
    approver,
    requesterProofSignature
) {
    try {
        return createProofProposalApprovalSigningMessage(
            protocolVersion,
            networkId,
            epoch,
            previousEpochRecordHash,
            proposer,
            vdfParametersHash,
            vdfProof,
            approver,
            requesterProofSignature
        );
    } catch {
        return null;
    }
}
