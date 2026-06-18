import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';

import { encodeProofProposalApproval } from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import { createMessage, safeWriteUInt32BE } from '../../buffer.js';

const toVerifierPublicKey = signer => {
    if (!signer) return signer;
    if (b4a.isBuffer(signer)) {
        if (signer.length === 32) return signer;
        return tracCryptoApi.address.decode(b4a.toString(signer, 'ascii'));
    }
    if (typeof signer === 'string') {
        return tracCryptoApi.address.decode(signer);
    }
    return signer;
};

export const buildProofProposalSignatureMessage = proofProposal => createMessage(
    proofProposal.protocol_version,
    proofProposal.network_id,
    proofProposal.epoch,
    proofProposal.previous_epoch_record_hash,
    proofProposal.proposer,
    proofProposal.vdf_parameters_hash,
    proofProposal.vdf_proof
);

export const hashProofProposal = async proofProposal => {
    return await tracCryptoApi.hash.blake3(buildProofProposalSignatureMessage(proofProposal));
};

export const buildProofProposalApprovalSignatureMessage = (
    proofProposal,
    approver,
    requesterProofSignature = proofProposal.signature
) => createMessage(
    proofProposal.protocol_version,
    proofProposal.network_id,
    proofProposal.epoch,
    proofProposal.previous_epoch_record_hash,
    proofProposal.proposer,
    proofProposal.vdf_parameters_hash,
    proofProposal.vdf_proof,
    approver,
    requesterProofSignature
);

export const hashProofProposalApproval = async (
    proofProposal,
    approver,
    requesterProofSignature = proofProposal.signature
) => {
    return await tracCryptoApi.hash.blake3(
        buildProofProposalApprovalSignatureMessage(
            proofProposal,
            approver,
            requesterProofSignature
        )
    );
};

export const buildProofProposalResponseSignatureMessage = (result, approval = null) => {
    const encodedApproval = approval ? encodeProofProposalApproval(approval) : b4a.alloc(0);
    return createMessage(safeWriteUInt32BE(result, 0), encodedApproval);
};

export const hashProofProposalResponse = async (result, approval = null) => {
    return await tracCryptoApi.hash.blake3(
        buildProofProposalResponseSignatureMessage(result, approval)
    );
};

const verifySignature = (signature, hash, publicKey) => {
    try {
        return tracCryptoApi.signature.verify(signature, hash, toVerifierPublicKey(publicKey)) === true;
    } catch {
        return false;
    }
};

export const verifyProofProposalSignature = async proofProposal => {
    return verifySignature(
        proofProposal.signature,
        await hashProofProposal(proofProposal),
        proofProposal.proposer
    );
};

export const verifyProofProposalApprovalSignature = async (
    proofProposal,
    approval,
    requesterProofSignature = proofProposal.signature
) => {
    return verifySignature(
        approval.approval_sig,
        await hashProofProposalApproval(
            proofProposal,
            approval.approver,
            requesterProofSignature
        ),
        approval.approver
    );
};

export const verifyProofProposalResponseSignature = async (
    proofProposalResponse,
    signerPublicKey = proofProposalResponse?.approval?.approver
) => {
    return verifySignature(
        proofProposalResponse.response_sig,
        await hashProofProposalResponse(
            proofProposalResponse.result,
            proofProposalResponse.approval
        ),
        signerPublicKey
    );
};
