import { default as test } from 'brittle';

async function runConsensusModuleTests() {
    test.pause();
    await import('./services/VDFService.test.js');
    await import('./services/epochCoordinatorService/epochCoordinatorService.test.js');
    await import('./epochAppenderSelection/epochAppenderSelector.test.js');
    await import('./epochAppenderSelection/epochAppenderElection.test.js');
    // esmock requires Node; real ledger reads are covered by integration tests in Bare.
    if (typeof globalThis.Bare === 'undefined') {
        await import('./epochAppenderSelection/epochAppenderSelectionLedgerReader.test.js');
    }
    await import('./services/epochCoordinationRound/epochCoordinationRound.test.js');
    await import('./services/epochCoordinationRound/coordinatedAppend.test.js');
    await import('./services/epochRoundListeners/epochRoundListeners.test.js');
    await import('./services/epochCoordinatorOperations/epochCoordinatorOperations.test.js');
    await import('./services/vdfServiceManager/vdfServiceManager.test.js');
    test.resume();
}

await runConsensusModuleTests();
