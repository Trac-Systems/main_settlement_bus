import { default as test } from 'brittle';

async function runConsensusProtocolTests() {
    test.pause();
    await import('./v1/ConsensusV1ConnectionPolicy.test.js');
    await import('./IndexerMessages.test.js');
    await import('./ConsensusIndexerChannels.test.js');
    await import('./v1/V1ConsensusProtocolError.test.js');
    await import('./v1/ConsensusValidationSchema.test.js');
    await import('./v1/V1EpochProofProposalRequest.test.js');
    await import('./v1/V1EpochProofProposalApproval.test.js');
    await import('./v1/handlers/V1EpochProofProposalOperationHandler.test.js');
    await import('./v1/ConsensusV1MessageRouter.test.js');
    await import('./v1/ConsensusV1Protocol.test.js');
    await import('./v1/ConsensusSessionLifecycle.test.js');
    await import('../../services/IndexerConnectionManager.test.js');
    await import('./v1/IndexerPendingRequestService.test.js');
    test.resume();
}

await runConsensusProtocolTests();
