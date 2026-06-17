import { default as test } from 'brittle';

async function runConsensusModuleTests() {
    test.pause();
    await import('../consensus/ConsensusValidationSchema.test.js');
    await import('./services/ConsensusConnectionManager.test.js');
    test.resume();
}

await runConsensusModuleTests();