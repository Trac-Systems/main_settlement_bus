import b4a from 'b4a';

import { addressToBuffer } from '../../src/core/state/utils/address.js';
import consensusV1Generated from '../../src/codecs/consensus/v1/consensusV1.generated.cjs';
import { v7 as uuidv7 } from 'uuid';
import { config } from '../helpers/config.js';
import { asAddress } from '../helpers/address.js';

const { MessageType, ResultCode } = consensusV1Generated.consensus.v1;

const bytes = (value, length) => b4a.alloc(length, value);

const proofProposal = Object.freeze({
    protocol_version: 1,
    network_id: 67,
    epoch: 67,
    previous_epoch_record_hash: bytes(1, 32),
    proposer: addressToBuffer(
        asAddress('82f6c1f684f4e251dfe092155b8861a0625b596991810b2b80b9c65ccbec5ad3'),
        config.addressPrefix
    ),
    vdf_parameters_hash: bytes(3, 32),
    vdf_proof: bytes(67, 96),
    signature: bytes(67, 64)
});

const proofProposalApproval = Object.freeze({
    approver: bytes(67, 32),
    approval_sig: bytes(67, 64)
});

const proofProposalResponse = Object.freeze({
    result: ResultCode.RESULT_CODE_OK,
    approval: proofProposalApproval,
    response_sig: bytes(67, 64)
});

const proofProposalHeader = Object.freeze({
    type: MessageType.MESSAGE_TYPE_PROOF_PROPOSAL,
    session_id: uuidv7(),
    timestamp: 67,
    proof_proposal: proofProposal
});

const proofProposalResponseHeader = Object.freeze({
    type: MessageType.MESSAGE_TYPE_PROOF_PROPOSAL_RESPONSE,
    session_id: uuidv7(),
    timestamp: 67,
    proof_proposal_response: proofProposalResponse
});

export default {
    proofProposal,
    proofProposalApproval,
    proofProposalResponse,
    proofProposalHeader,
    proofProposalResponseHeader,
};
