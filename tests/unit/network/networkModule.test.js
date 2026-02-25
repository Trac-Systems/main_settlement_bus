import { default as test } from 'brittle';

async function runNetworkModuleTests() {
    test.pause();
    await import('./NetworkWalletFactory.test.js');
    await import('./ProtocolSession.test.js');
    await import('./V1ValidationSchema.test.js');
    await import('./V1ValidationErrorMapper.test.js');
    await import('./V1BroadcastTransactionOperationHandler.test.js');
    await import('./services/services.test.js');
    test.resume();
}

await runNetworkModuleTests();
