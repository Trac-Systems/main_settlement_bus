import { default as test } from 'brittle';

async function runConsensusModuleTests() {
    test.pause();
    await import('./services/VDFService.test.js');
    await import('./services/epochCoordinatorService/epochCoordinatorService.test.js');
    await import('./services/epochCoordinationRound/epochCoordinationRound.test.js');
    await import('./services/epochRoundListeners/epochRoundListeners.test.js');
    await import('./services/epochCoordinatorOperations/epochCoordinatorOperations.test.js');
    await import('./services/vdfServiceManager/vdfServiceManager.test.js');
    test.resume();
}

await runConsensusModuleTests();
