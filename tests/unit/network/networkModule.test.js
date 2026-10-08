import { default as test } from 'brittle';

async function runNetworkModuleTests() {
    test.pause();
    await import('./protocols/consensus/consensusModule.test.js');
    await import('./Network.test.js');
    await import('./services/ValidatorConnectionManager.test.js');
    await import('./protocols/validators/legacy/ValidatorLegacyMessageRouter.test.js');
    await import('./protocols/validators/ValidatorProtocolSession.test.js');
    await import('./protocols/validators/shared/sharedModule.test.js');
    await import('./services/services.test.js');
    await import('./protocols/validators/v1/v1.test.js');
    test.resume();
}

await runNetworkModuleTests();
