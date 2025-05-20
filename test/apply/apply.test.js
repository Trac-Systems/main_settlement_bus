import { default as test } from 'brittle';

async function runCheckTests() {
  test.pause();
  await import('./postTx.test.js');
  test.resume();
}

runCheckTests();