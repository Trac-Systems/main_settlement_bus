import test from 'brittle';
import b4a from 'b4a';

import ConsensusValidationSchema from '../../../src/core/consensus/v1/validators/ConsensusValidationSchema.js';
import {
    ConsensusOperationType,
    ConsensusProtocolVersion,
    ConsensusResultCode,
    VDF_BLOB_PROOF_SIZE
} from '../../../src/utils/constants.js';
import {uint8ToBuffer, uint16ToBuffer, uint64ToBuffer} from '../../../src/utils/buffer.js';
import {config} from '../../helpers/config.js';

const makeProofProposalPayload = (epoch, proofProposalOverrides = {}) => ({
    type: ConsensusOperationType.PROOF_PROPOSAL,
    session_id: 'session',
    timestamp: 1,
    proof_proposal: {
        protocol_version: uint8ToBuffer(ConsensusProtocolVersion.V1, 0),
        network_id: uint16ToBuffer(0xFFFF, 'Network id'),
        epoch,
        previous_epoch_record_hash: b4a.alloc(32, 1),
        proposer: b4a.alloc(config.addressLength, 2),
        vdf_parameters_hash: b4a.alloc(32, 3),
        vdf_proof: b4a.alloc(VDF_BLOB_PROOF_SIZE, 4),
        signature: b4a.alloc(64, 5),
        ...proofProposalOverrides
    },
});

const makeProofProposalResponsePayload = (result, approval) => ({
    type: ConsensusOperationType.PROOF_PROPOSAL_APPROVAL,
    session_id: 'session',
    timestamp: 1,
    proof_proposal_response: {
        result,
        ...(approval === undefined ? {} : {approval}),
        response_sig: b4a.alloc(64, 1),
    },
});

const approval = () => ({
    approver: b4a.alloc(config.addressLength, 2),
    approval_sig: b4a.alloc(64, 3),
});

test('ConsensusValidationSchema accepts fixed-length proof proposal byte fields', t => {
    const schema = new ConsensusValidationSchema(config);
    const maxUint64 = 0xFFFFFFFFFFFFFFFFn;

    t.is(schema.validateConsensusV1ProofProposal(makeProofProposalPayload(uint64ToBuffer(1, 'Epoch'))), true);
    t.is(schema.validateConsensusV1ProofProposal(makeProofProposalPayload(uint64ToBuffer(maxUint64, 'Epoch'))), true);
    t.is(schema.validateConsensusV1ProofProposal(makeProofProposalPayload(uint64ToBuffer(0, 'Epoch'))), false);
    t.is(schema.validateConsensusV1ProofProposal(
        makeProofProposalPayload(uint64ToBuffer(1, 'Epoch'), {network_id: uint16ToBuffer(0, 'Network id')})
    ), false);
    t.is(schema.validateConsensusV1ProofProposal(makeProofProposalPayload(b4a.alloc(7, 1))), false);
    t.is(schema.validateConsensusV1ProofProposal(makeProofProposalPayload(b4a.alloc(9, 1))), false);
    t.is(schema.validateConsensusV1ProofProposal(makeProofProposalPayload('not-a-buffer')), false);
});

test('ConsensusValidationSchema requires approval only for OK proof proposal responses', t => {
    const schema = new ConsensusValidationSchema(config);

    t.is(
        schema.validateV1EpochProofProposalResponse(
            makeProofProposalResponsePayload(ConsensusResultCode.OK, approval())
        ),
        true
    );
    t.is(
        schema.validateV1EpochProofProposalResponse(
            makeProofProposalResponsePayload(ConsensusResultCode.OK)
        ),
        false
    );
    t.is(
        schema.validateV1EpochProofProposalResponse(
            makeProofProposalResponsePayload(ConsensusResultCode.UNSPECIFIED)
        ),
        true
    );
    t.is(
        schema.validateV1EpochProofProposalResponse(
            makeProofProposalResponsePayload(ConsensusResultCode.UNSPECIFIED, approval())
        ),
        false
    );
});
