import { default as test } from 'brittle';

async function runMsgUtilsTests() {
  test.pause();

  await import('./createMessage.test.js');
  await import('./assembleAdminMessage.test.js');
  await import('./assembleWhitelistMessages.test.js');

  test.resume();
}

runMsgUtilsTests();