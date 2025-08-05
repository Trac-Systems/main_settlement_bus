import { default as test } from 'brittle';

async function runMsgUtilsTests() {
    test.pause();
    await import('./assembleAdminMessage.test.js');
    await import('./assembleAddWriterMessage.test.js');
    await import('./assembleRemoveWriterMessage.test.js');
    await import('./assembleAddIndexerMessage.test.js');
    await import('./assembleRemoveIndexerMessage.test.js');
    await import('./assembleBanWriterMessage.test.js');
    await import('./assembleWhitelistMessages.test.js');
    await import('./assembleWhitelistMessages.test.js');
    await import('./assemblePostTransaction.test.js');

    // TODO: Implement mocked tests for MessageOperations.verifyEventMessage
    test.resume();
}

await runMsgUtilsTests();