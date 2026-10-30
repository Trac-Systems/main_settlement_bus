import { decodeEpochRecord, decodeEpochProofV1 } from '../../../../src/codecs/apply/applyOperationCodec.js';
import { ConsensusVersion } from '../../../../src/utils/constants.js';
import {
    decodeProofProposal,
    decodeProofProposalApproval,
} from '../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import { bufferToAddress } from '../../../../src/core/state/utils/address.js';
import { VDF_DIFFICULTY, VDF_DISCRIMINANT_BITS } from './consensusNetwork.js';
import { calculateProofSignatureQuorum } from '../../../../src/core/consensus/quorum.js';

export async function assertSignedEpoch(t, network, { epoch = 1n, proposer = network.proposer } = {}) {
    const { nodes } = network;
    await network.waitForReplication(`epoch ${epoch} signed on all ${nodes.length} nodes`, async () =>
        (await Promise.all(nodes.map(node => node.state.getCurrentEpoch()))).every(current => current === epoch)
    );
    const hashes = await Promise.all(nodes.map(node => node.state.getEpoch(epoch)));
    t.ok(hashes.every(hash => hash.equals(hashes[0])), 'all nodes agree on the signed epoch hash');
    const proofs = await Promise.all(nodes.map((node, index) => node.state.getEpochProof(hashes[index])));
    t.ok(proofs.every(proof => proof.equals(proofs[0])), 'all nodes store the same signed epoch proof');
    const record = decodeEpochRecord(proofs[0]);
    t.is(record.sv.readUInt8(0), ConsensusVersion.VDF_V1, 'the signed epoch uses the VDF V1 format');
    const proof = decodeEpochProofV1(record.data);
    const proposal = decodeProofProposal(proof.pd);
    t.is(proposal.epoch.readBigUInt64BE(), epoch);
    t.is(proposal.difficulty.readUInt32BE(), VDF_DIFFICULTY);
    t.is(proposal.discriminant_bit_size.readUInt16BE(), VDF_DISCRIMINANT_BITS);
    const expectedApprovals = calculateProofSignatureQuorum(nodes.filter(node => node.promoted).length) - 1;
    t.is(proof.app.length, expectedApprovals, 'proof has the required external approvals');
    const approvers = proof.app.map(encoded => bufferToAddress(
        decodeProofProposalApproval(encoded).approver, proposer.config.addressPrefix
    ));
    t.is(new Set(approvers).size, expectedApprovals, 'approvals come from distinct indexers');
    const actualProposer = bufferToAddress(proposal.proposer, proposer.config.addressPrefix);
    const eligible = nodes.filter(node => node.promoted && node.wallet.address !== actualProposer).map(node => node.wallet.address);
    t.ok(approvers.every(address => eligible.includes(address)), 'every approver belongs to the current membership');
    return approvers;
}
