import { default as test } from 'brittle';

async function runTests() {
    test.pause();
    await import('./v1.handlers.test.js');
    await import('./V1BaseOperation.test.js');
    await import('./V1LivenessRequest.test.js');
    await import('./V1LivenessResponse.test.js');
    await import('./V1BroadcastTransactionRequest.test.js');
    await import('./V1ResultCode.test.js');
    await import('./connectionPolicies.test.js');
    await import('./ValidatorPendingRequestService.test.js');
    await import('./V1BroadcastTransactionResponse.test.js');
    await import('./V1ValidationSchema.test.js');
    await import('./V1BroadcastTransactionOperationHandler.test.js');
    await import('./ValidatorV1MessageRouter.test.js');
    test.resume();
}

await runTests();
