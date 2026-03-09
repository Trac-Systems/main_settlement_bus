import { default as test } from 'brittle';

async function runNetworkModuleTests() {
    test.pause();
    await import('./ConnectionManager.test.js');
    await import('./LegacyNetworkMessageRouter.test.js');
    await import('./NetworkWalletFactory.test.js');
    await import('./ProtocolSession.test.js');
    await import('./services/services.test.js');
    await import('./v1/v1.test.js');
    test.resume();
}

await runNetworkModuleTests();
