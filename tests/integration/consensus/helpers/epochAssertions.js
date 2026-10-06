import { decodeEpochProof } from '../../../../src/codecs/apply/applyOperationCodec.js';
import {
    decodeProofProposal,
    decodeProofProposalApproval,
} from '../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import { bufferToAddress } from '../../../../src/core/state/utils/address.js';
import { VDF_DIFFICULTY, VDF_DISCRIMINANT_BITS } from './consensusNetwork.js';

export async function assertSignedEpoch(t, network) {
    const { nodes, proposer } = network;
    await network.waitForReplication('epoch 1 signed on all five nodes', async () =>
        (await Promise.all(nodes.map(node => node.state.getCurrentEpoch()))).every(epoch => epoch === 1n)
    );
    const hashes = await Promise.all(nodes.map(node => node.state.getEpoch(1n)));
    t.ok(hashes.every(hash => hash.equals(hashes[0])), 'all nodes agree on the signed epoch hash');
    const proofs = await Promise.all(nodes.map((node, index) => node.state.getEpochProof(hashes[index])));
    t.ok(proofs.every(proof => proof.equals(proofs[0])), 'all nodes store the same signed epoch proof');
    const proof = decodeEpochProof(proofs[0]);
    const proposal = decodeProofProposal(proof.pd);
    t.is(proposal.epoch.readBigUInt64BE(), 1n);
    t.is(proposal.difficulty.readUInt32BE(), VDF_DIFFICULTY);
    t.is(proposal.discriminant_bit_size.readUInt16BE(), VDF_DISCRIMINANT_BITS);
    t.is(proof.app.length, 2, 'five indexers require two external approvals plus the proposer');
    const approvers = proof.app.map(encoded => bufferToAddress(
        decodeProofProposalApproval(encoded).approver, proposer.config.addressPrefix
    ));
    t.is(new Set(approvers).size, 2, 'approvals come from distinct indexers');
    const eligible = nodes.filter(node => node.promoted && node !== proposer).map(node => node.wallet.address);
    t.ok(approvers.every(address => eligible.includes(address)), 'every approver belongs to the current membership');
    return approvers;
}
