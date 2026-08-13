import { default as test } from 'brittle';

async function runConsensusModuleTests() {
    test.pause();
    await import('../consensus/ConsensusValidationSchema.test.js');
    await import('../consensus/V1EpochProofProposalRequest.test.js');
    await import('../consensus/V1EpochProofProposalApproval.test.js');
    await import('../consensus/ConsensusEpochProofProposalOperationHandler.test.js');
    await import('../consensus/ConsensusRouter.test.js');
    await import('./services/IndexerConnectionManager.test.js');
    await import('./services/IndexerPendingRequestService.test.js');
    await import('./services/VDFService.test.js');
    await import('../core/consensus/services/epochCoordinatorService/epochCoordinatorService.test.js');
    await import('../core/consensus/services/epochCoordinatorOperations/epochCoordinatorOperations.test.js');
    test.resume();
}

await runConsensusModuleTests();
