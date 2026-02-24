import { default as test } from 'brittle';

async function runNetworkModuleTests() {
    test.pause();
    await import('./ConnectionManager.test.js');
    await import('./NetworkWalletFactory.test.js');
    await import('./PendingRequestService.test.js');
    await import('./ValidatorHealthCheckService.test.js');
    await import('./TransactionRateLimiterService.test.js');
    await import('./V1ValidationSchema.test.js');
    await import('./V1ValidationErrorMapper.test.js');
    await import('./V1BroadcastTransactionOperationHandler.test.js');
    test.resume();
}

await runNetworkModuleTests();
