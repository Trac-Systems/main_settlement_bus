import b4a from 'b4a';

import {
    encodeProofProposal,
    encodeProofProposalApproval
} from '../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import { SIGNATURE_BYTE_LENGTH } from '../../src/utils/constants.js';
import consensusFixtures from '../fixtures/consensusV1Operation.fixtures.js';
import { config } from './config.js';

export const proofProposalData = () => encodeProofProposal(consensusFixtures.proofProposal);

export const proofProposalApproval = (approverFill, approvalSigFill) => encodeProofProposalApproval({
    approver: b4a.alloc(config.addressLength, approverFill),
    approval_sig: b4a.alloc(SIGNATURE_BYTE_LENGTH, approvalSigFill)
});
