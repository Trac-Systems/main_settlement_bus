import { default as test } from 'brittle';

async function runNetworkModuleTests() {
    test.pause();
    await import('./NetworkWalletFactory.test.js');
    await import('./ProtocolSession.test.js');
    await import('./v1/v1.handlers.test.js');
    await import('./services/services.test.js');
    await import('./services/ValidatorHealthCheckService.test.js');
    await import('./services/TransactionRateLimiterService.test.js');
    await import('./v1/V1ResultCode.test.js');
    await import('./v1/V1BroadcastTransactionResponse.test.js');
    await import('./v1/V1ValidationSchema.test.js');
    await import('./v1/V1ValidationErrorMapper.test.js');
    await import('./v1/V1BroadcastTransactionOperationHandler.test.js');
    await import('./v1/NetworkMessageRouterV1.test.js');
    test.resume();
}

await runNetworkModuleTests();