import b4a from 'b4a';

import { addressToBuffer } from '../../src/core/state/utils/address.js';
import consensusV1Generated from '../../src/codecs/consensus/v1/consensusV1.generated.cjs';
import { v7 as uuidv7 } from 'uuid';
import { config } from '../helpers/config.js';
import { asAddress } from '../helpers/address.js';
import { uint8ToBuffer, uint16ToBuffer, uint64ToBuffer } from '../../src/utils/buffer.js';
import {
    HASH_BYTE_LENGTH,
    SIGNATURE_BYTE_LENGTH,
    VDF_BLOB_PROOF_SIZE,
} from '../../src/utils/constants.js';

const { MessageType, ResultCode } = consensusV1Generated.consensus.v1;

const bytes = (value, length) => b4a.alloc(length, value);

const proofProposal = Object.freeze({
    protocol_version: uint8ToBuffer(1, 'Protocol version'),
    network_id: uint16ToBuffer(67, 'Network id'),
    epoch: uint64ToBuffer(67, 'Epoch'),
    previous_epoch_record_hash: bytes(1, HASH_BYTE_LENGTH),
    proposer: addressToBuffer(
        asAddress('82f6c1f684f4e251dfe092155b8861a0625b596991810b2b80b9c65ccbec5ad3'),
        config.addressPrefix
    ),
    vdf_parameters_hash: bytes(3, HASH_BYTE_LENGTH),
    vdf_proof: bytes(67, VDF_BLOB_PROOF_SIZE),
    signature: bytes(67, SIGNATURE_BYTE_LENGTH)
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
    type: MessageType.MESSAGE_TYPE_PROOF_PROPOSAL_APPROVAL,
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
