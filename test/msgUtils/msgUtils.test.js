import { default as test } from 'brittle';

async function runMsgUtilsTests() {
    test.pause();

    await import('./createMessage.test.js');
    await import('./assembleAdminMessage.test.js');
    await import('./assembleWhitelistMessages.test.js');
    await import('./assembleAddWriterMessage.test.js');
    await import('./assembleRemoveWriterMessage.test.js');
    await import('./assembleAddIndexerMessage.test.js');
    await import('./assembleRemoveIndexerMessage.test.js');
    await import('./assembleBanValidatorMessage.test.js');
    await import('./assembleWhitelistedMessage.test.js');

    // TODO: Implement mocked tests for MsgUtils.verifyEventMessage

    test.resume();
}

runMsgUtilsTests();