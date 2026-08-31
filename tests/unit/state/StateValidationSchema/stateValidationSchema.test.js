import { default as test } from 'brittle';

async function runCheckTests() {
    test.pause();

    await import('./coreAdminOperation.test.js');
    await import('./adminControlOperation.test.js');
    await import('./bootstrapDeploymentOperation.test.js');
    await import('./roleAccessOperation.test.js')
    await import('./transactionOperation.test.js')
    await import('./transferOperation.test.js')
    await import('./balanceInitializationOperation.test.js')
    await import('./setEpochOperation.test.js')
    await import('./setGenesisEpochOperation.test.js')
    await import('./setConsensusConfigOperation.test.js')
    await import('./htlcClaimOperation.test.js')

    test.resume();
}

await runCheckTests();
